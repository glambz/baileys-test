# Plan 19: Retrieval Pipeline — BM25 (Postgres FTS) + ANN (pgvector) + Rerank + Turbo Cutoff + Contact-Scope Filter

**Goal**: Ship `src/ai/retrieval/{hybrid,bm25,ann,reranker}.js` — the hybrid retrieval pipeline that powers both `/api/crm/ai/ask` (team scope, no contact filter) and the WhatsApp inbound trigger (WhatsApp scope, contact-scope hard filter applied at the SQL layer). BM25 via Postgres `tsvector` over `knowledge_chunks.text`; ANN via pgvector `<=>` cosine over `knowledge_chunks.embedding`; rerank via cosine between the query embedding and the candidate embeddings; turbo cutoff at `score < 0.30`.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- Plan 15 (`15-db-layer-postgresql.md`) — needs `knowledge_chunks` table, `text_fts_idx`, `embedding_idx`, `entity_records_contact_idx`, and the Kysely client.
- Plan 17 (`17-llm-gateway.md`) — needs `embedText()` to embed the query.
- Plan 18 (`18-kb-ingestion.md`) — needs `searchByTextFts()` and `getChunksByIds()` from the read-only `chunks.js`.

## Micro-Tasks

1. **Author `src/ai/retrieval/bm25.js` (Postgres full-text search)**
   - Export `bm25Search({ query, limit = 20 }): Promise<Array<{ chunk: KnowledgeChunk, score: number }>>`.
   - SQL: `SELECT id, file_id, chunk_index, text, metadata, ts_rank_cd(to_tsvector('simple', text), plainto_tsquery('simple', $1)) AS score FROM knowledge_chunks ORDER BY score DESC LIMIT $2`.
   - Score normalization: divide each raw `ts_rank_cd` by the max score in the result set so the top hit is `1.0` and others are in `[0, 1]`.
   - **Acceptance**: vitest spec seeds 5 chunks with distinct text, runs `bm25Search({ query: 'harga paket bulanan' })`, asserts the chunk containing "harga paket bulanan" ranks first with score `1.0`; an irrelevant chunk ranks last with score `< 0.5`.

2. **Author `src/ai/retrieval/ann.js` (pgvector cosine ANN)**
   - Export `annSearch({ queryEmbedding, limit = 20 }): Promise<Array<{ chunk: KnowledgeChunk, score: number }>>`.
   - SQL: `SELECT id, file_id, chunk_index, text, metadata, 1 - (embedding <=> $1::vector) AS score FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2`.
   - The score is `1 - cosine_distance` so higher = more similar; range `[0, 1]` for normalized embeddings (MiniMax embeddings are L2-normalized).
   - **Acceptance**: vitest spec seeds 5 chunks with known embeddings (e.g., `e_i = unit(i)` for small dims via a stub), runs `annSearch`, asserts the chunk with the closest embedding to the query ranks first with score close to `1.0`.

3. **Author `src/ai/retrieval/reranker.js` (MiniMax-embedding cosine rerank)**
   - Export `rerank({ query, candidates, topK = 6 }): Promise<Array<{ chunk: KnowledgeChunk, score: number }>>`.
   - Re-embeds the `query` via `embedText()` (Plan 17).
   - Computes cosine similarity between the query embedding and each candidate's stored `embedding`.
   - Returns the top-K candidates by cosine similarity (score in `[0, 1]`).
   - **Acceptance**: vitest spec seeds 10 candidates, runs `rerank` with a query embedding closest to candidate #4, asserts candidate #4 is in the top-K and the scores are monotonic-descending.

4. **Author `src/ai/retrieval/hybrid.js` (BM25 + ANN union + rerank + turbo cutoff + contact-scope filter)**
   - Export `hybridRetrieval({ query, scope: 'whatsapp' | 'team', chatId?, contactPhone?, topK = 6 }): Promise<{ chunks: Array<{ chunk: KnowledgeChunk, score: number }>, retrievalScore: number, contactScopeApplied: boolean }>`.
   - Steps:
     1. BM25 search (`bm25.js`) → top 20.
     2. ANN search (`ann.js`) → top 20.
     3. **Reciprocal Rank Fusion (RRF)** to merge the two lists: `rrfScore(d) = Σ 1 / (k + rank_d)` with `k = 60` (standard). Then take the top 30 unique chunks by `chunk.id`.
     4. **Rerank** (`reranker.js`) → top `topK` (default 6).
     5. **Contact-scope filter** (only when `scope === 'whatsapp'` AND `contactPhone` is provided): for each candidate whose `metadata.source === 'entity_records'`, verify the source record's `contact_id === contactPhone` via `SELECT 1 FROM entity_records WHERE id = $1 AND contact_id = $2`. Drop candidates that fail.
     6. Compute `retrievalScore = max(chunk.score across the top-K)` (the top hit's score).
     7. **Turbo cutoff**: if `retrievalScore < 0.30`, return `{ chunks: [], retrievalScore, contactScopeApplied: true|false }` (the caller in Plan 20 short-circuits to `human_pending_flag`).
   - The contact-scope filter is applied **at the SQL layer** (a `WHERE` clause in the candidate lookup), not in JS — this is **defense-in-depth layer 6** (MVP.md §3.5). The JS layer's `metadata.source` check is a backstop.
   - **Acceptance**: vitest spec seeds 5 chunks and 3 `entity_records` rows with different `contact_id` values. (a) `scope='team'`: all 3 records' chunks appear in candidates. (b) `scope='whatsapp', contactPhone='6285179652486'`: only chunks whose source record has `contact_id='6285179652486'` appear; chunks from the other 2 contacts are filtered out. (c) `retrievalScore=0.25` triggers turbo cutoff (empty `chunks` array, non-empty `retrievalScore`).

5. **Author `src/test/hybrid.test.js` (Plan 23 contract; this plan plants the seeds)**
   - Commit a fixture script under `src/test/fixtures/seed-hybrid.js` that drops + reseeds the test DB with: 5 KB chunks (distinct embeddings), 3 `entity_records` rows for contacts `A`, `B`, `C`. The fixture is invoked from vitest's `beforeAll`.
   - Specs:
     - `hybridRetrieval({ scope: 'team', query: 'paket bulanan' })` returns at least one chunk and `retrievalScore ≥ 0.30`.
     - `hybridRetrieval({ scope: 'whatsapp', contactPhone: 'A', query: 'paket bulanan' })` returns ONLY chunks whose source record belongs to `A`.
     - `hybridRetrieval({ scope: 'whatsapp', contactPhone: 'A', query: 'unrelated gibberish xyzzy' })` returns `chunks: []` and `retrievalScore < 0.30` (turbo cutoff).
   - **Acceptance**: `pnpm vitest run src/test/hybrid.test.js` is green.

6. **Add `EXPLAIN ANALYZE` assertions for the contact-scope filter**
   - The `hybrid.js` SQL for the contact-scope candidate lookup uses `WHERE entity_records.contact_id = $1`. Plan 15's `entity_records_contact_idx` (partial index, `WHERE contact_id IS NOT NULL`) makes this index-only at scale.
   - Add a vitest spec that runs `EXPLAIN ANALYZE` against a seeded DB with 10 000 `entity_records` rows and asserts the plan contains `Index Scan using entity_records_contact_idx` (not `Seq Scan`).
   - **Acceptance**: spec is green; if the index is dropped, the spec fails (regression guard for the index).

## Cross-References
- Goals & lock-in of `τ_turbo = 0.30`: `docs/be/MVP.md` §3.3.
- Defense-in-depth layer 6 (contact-scope filter at data layer): `docs/be/MVP.md` §3.5 row 6.
- Step-by-step walkthrough: `docs/be/MVP.md` §6 (the "Pak Hendro" example uses this pipeline).
- BM25 (Postgres FTS) spec: `docs/be/features/ai-orchestration/spec.md` §Retrieval.
- ANN (pgvector) spec: `docs/be/features/ai-orchestration/spec.md` §Retrieval.
- Tables + indexes: `docs/crm/plans/15-db-layer-postgresql.md` (`text_fts_idx`, `embedding_idx`, `entity_records_contact_idx`).
- Read-only chunks API: `docs/crm/plans/18-kb-ingestion.md` (step 3).
- Embedder: `docs/crm/plans/17-llm-gateway.md` (step 5 `embedText`).
- Consumer (WhatsApp trigger): `docs/crm/plans/20-whatsapp-trigger-state-machine.md`.
- Consumer (REST `/api/crm/ai/ask`): `docs/crm/plans/21-rest-endpoints.md`.
- Cross-contact leak test: `docs/crm/plans/23-defense-in-depth-tests.md` (`contact-scope.test.js`).

## Notes
- **Contact-scope hard filter at the SQL layer.** This is non-negotiable. The JS backstop in step 4 is a safety net; the SQL `WHERE contact_id = ?` is the primary guard. Plan 23's `contact-scope.test.js` asserts both layers.
- The hybrid pipeline is **stateless** — no per-request cache, no conversation memory. Each call recomputes BM25 + ANN + rerank. Per MVP.md §4, no Redis layer.
- RRF with `k=60` is the standard constant; do not tune per-corpus in this cycle. The MiniMax-embeddings cosine rerank is a deliberate MVP simplification — Phase 2 swaps it for a cross-encoder per MVP.md §7.
- Turbo cutoff (`τ_turbo = 0.30`) is **lower** than the user-tunable confidence threshold (`τ_user`, default `0.7`). The turbo cutoff is for "we have nothing relevant at all — don't waste an LLM call"; the user threshold is for "the LLM gave us a low-confidence answer — don't auto-send it". Both must coexist.
- `scope='team'` is what `/api/crm/ai/ask` uses (no contact filter, full tenant data). `scope='whatsapp'` is what Plan 20's trigger uses (contact filter applied). The contact filter is **NEVER** bypassed by a request that claims `scope='team'` but is actually serving a chat — the trigger in Plan 20 always passes `scope='whatsapp'`.
- The `metadata.source` field is set by Plan 18's `ingest.js` (chunks from KB files have `source: 'kb'`; chunks that are derived from `entity_records` would have `source: 'entity_records'` — for the MVP, only KB chunks are retrieved by this pipeline; entity records are exposed as a separate retrieval path that Plan 21's `/api/crm/ai/ask` uses directly).
- The Plan 23 `contact-scope.test.js` MUST cover both the WhatsApp scope and the team scope; the team scope must NOT regress the contact filter — Plan 21's `/api/crm/ai/ask` is intentionally contact-filter-free because the operator is asking on behalf of the tenant, not on behalf of a chat.