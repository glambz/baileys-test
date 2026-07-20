# Plan 18: Knowledge Base Ingestion — OCR + Chunker + MiniMax Embeddings + Idempotent Upsert

**Goal**: Ship `src/ai/store/{ingest,chunks}.js` + `src/ai/retrieval/{ocr,chunker}.js` + the embeddings wiring from Plan 17 — the full KB ingestion pipeline. Operators upload a file via the `POST /api/crm/knowledge/upload` endpoint; the pipeline extracts text (PDF / DOCX / HTML / XLSX), chunks it with overlap, embeds each chunk with MiniMax, and upserts `(file_id, chunk_index)` rows into `knowledge_chunks` **idempotently** on `(tenant_id, source_path, chunk_index, text_hash)`. Embeddings are **fully implemented** in this run — no half work.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- Plan 15 (`15-db-layer-postgresql.md`) — needs `knowledge_files` and `knowledge_chunks` tables, the `text_hash` index, and the Kysely client.
- Plan 17 (`17-llm-gateway.md`) — needs `embedText()` for MiniMax embeddings.

## Micro-Tasks

1. **Author `src/ai/retrieval/ocr.js` (multi-format text extractor)**
   - Export `extractText({ buffer, mimeType, filename }): Promise<{ text: string, metadata: { pages?: number[], sections?: string[] } }>`.
   - MIME-type dispatch:
     - `application/pdf` → `pdf-parse` (returns `{ text, numpages }`; collect per-page text into `metadata.pages[]`).
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) → `mammoth.extractRawText({ buffer })`.
     - `text/html` and `application/xhtml+xml` → `cheerio.load(buffer).text()` with `script`/`style` removed first; collect `h1`/`h2`/`h3` text into `metadata.sections[]`.
     - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) and `text/csv` → `xlsx-stream` (XLSX) or a streaming CSV parser; collect each sheet/row into `text` and sheet names into `metadata.sections[]`.
     - `text/plain` → `buffer.toString('utf8')`.
   - On unsupported MIME, throw `UnsupportedMimeError`.
   - **Acceptance**: vitest specs assert: (a) a 2-page PDF returns `text` with both pages concatenated; (b) a DOCX with two paragraphs returns both; (c) an HTML with `<script>` tags returns text with script content stripped; (d) an XLSX with 3 sheets returns 3 sections; (e) `application/zip` throws `UnsupportedMimeError`.

2. **Author `src/ai/retrieval/chunker.js` (semantic chunker with overlap)**
   - Export `chunkText({ text, maxTokens = 512, overlapTokens = 50 }): Array<{ text: string, metadata: object }>`.
   - Algorithm: split on paragraph boundaries (`\n\n+`); if a paragraph exceeds `maxTokens`, split on sentence boundaries (`. `, `! `, `? `); if a sentence still exceeds `maxTokens`, hard-split on word boundaries at `maxTokens` chars (last-resort, marked `metadata.hardSplit = true`).
   - Each chunk includes `overlapTokens` worth of preceding text (the tail of the previous chunk) so retrieval can match on sentence boundaries that straddle chunks.
   - Returned objects: `{ text, metadata: { tokenEstimate, sectionTitle?, pageNumber?, hardSplit: boolean } }`.
   - Determinism: identical input → identical output array (no randomness, no timestamps). The `text_hash` from Plan 15's `text_hash_idx` is computed in step 3 from the chunk text.
   - **Acceptance**: vitest specs assert: (a) a 2000-token paragraph produces 4 chunks each ≤ 512 tokens with 50-token overlap; (b) a 100-token paragraph produces 1 chunk; (c) an input with three `## Section` headings produces chunks whose `metadata.sectionTitle` matches the preceding heading; (d) re-running with the same input produces the same chunks (deep-equal).

3. **Author `src/ai/store/chunks.js` (READ-ONLY public API; writes only via ingest.js)**
   - Export `getChunksForFile(fileId): Promise<KnowledgeChunk[]>`, `getChunksByIds(ids: string[]): Promise<KnowledgeChunk[]>`, `searchByTextFts(query, limit): Promise<Array<{ chunk: KnowledgeChunk, score: number }>>` (used by Plan 19's BM25 path).
   - **Write methods (`insertChunk`, `deleteChunksForFile`, `upsertChunk`) are NOT exported.** They are module-internal and reachable only from `src/ai/store/ingest.js`. This is **defense-in-depth layer 1** for the "AI writes only to CRM, never to KB" rule (MVP.md §3.2 rule #4): the LLM gateway has no path to chunk writes even if it tried.
   - Document this constraint in the module's JSDoc as `// WRITE-RESTRICTED: only src/ai/store/ingest.js may call the internal write methods.`
   - **Acceptance**: vitest spec imports `* as chunks from 'src/ai/store/chunks'` and asserts `chunks.insertChunk === undefined`; the only write method exported (if any) is `__ingestUpsertChunk` and is marked `@private` via JSDoc; Plan 23's audit confirms no router endpoint imports `chunks.__ingestUpsertChunk`.

4. **Author `src/ai/store/ingest.js` (the full upload→index pipeline)**
   - Export `ingestFile({ tenantId, filename, mimeType, buffer }): Promise<{ fileId: string, chunksCount: number }>`.
   - Steps:
     1. Compute SHA-256 of `buffer`; if a `knowledge_files` row with the same `(tenant_id, sha256)` already exists in `status='indexed'`, return that fileId (idempotent re-upload).
     2. Insert a `knowledge_files` row with `status='queued'`, `size_bytes=buffer.length`, `storage_path=./data/kb/<fileId>/<filename>`.
     3. Write the buffer to `storage_path` (create dir if missing).
     4. Set `status='ingesting'`.
     5. Call `extractText` (Plan 18 step 1).
     6. Call `chunkText` (Plan 18 step 2).
     7. For each chunk, call `embedText` (Plan 17 step 5) — sequentially or in small parallel batches (max 4 concurrent calls to respect MiniMax rate limits).
     8. Inside a single transaction, UPSERT each `(file_id, chunk_index, text, text_hash, embedding, metadata)` row using `ON CONFLICT (file_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`.
     9. Set `status='indexed'`, `chunks_count=<n>`, `ingested_at=now()`. On any error, set `status='failed'`, `last_error=<message>`, and re-throw.
   - Pipeline runs **async** from the route handler's perspective: the route returns `{ fileId, status: 'queued' }` immediately; a background worker (registered in `src/index.js`) drains the queue. Plan 21's endpoint spec documents this.
   - **Acceptance**: vitest spec uses a small PDF fixture (committed under `__fixtures__/kb/sample.pdf`); after `ingestFile`, the DB has 1 `knowledge_files` row (`status='indexed'`), N `knowledge_chunks` rows, and a non-empty `embedding` vector for each chunk; re-ingesting the same PDF returns the same `fileId` and does NOT create duplicate chunks.

5. **Author `src/ai/retrieval/ocr.test-fixtures.js` + commit fixture files**
   - Commit fixture files under `__fixtures__/kb/`:
     - `sample.pdf` — a 2-page PDF with deterministic text.
     - `sample.docx` — a 3-paragraph DOCX.
     - `sample.html` — an HTML file with `<script>` tags and 2 `<h2>` sections.
     - `sample.xlsx` — a 2-sheet XLSX with 5 rows each.
   - The fixtures are tiny (< 50 KB total) and committed to git so vitest runs hermetically.
   - **Acceptance**: the four fixture files exist and are non-empty; `pnpm test` does NOT hit the network for these.

6. **Wire embeddings pipeline end-to-end (mini smoke)**
   - Add `pnpm script:ingest-smoke` that calls `ingestFile` against `__fixtures__/kb/sample.pdf` and prints `{ fileId, chunksCount, firstEmbedding[0..4] }`.
   - The smoke command is gated by `RUN_SMOKE=1` so it doesn't run in unit CI (which mocks `embedText`).
   - **Acceptance**: `RUN_SMOKE=1 pnpm script:ingest-smoke` against a live Postgres + MiniMax credentials returns a `fileId`, a positive `chunksCount`, and a non-zero `firstEmbedding[0..4]`.

## Cross-References
- Tables + indexes consumed: `docs/be/MVP.md` §2.2 (`knowledge_files`, `knowledge_chunks`, `UNIQUE (file_id, chunk_index)`, `text_hash` hash index, `ivfflat` embedding index).
- Goals & ingest contract: `docs/be/MVP.md` §1 #3 (full embedding pipeline — no half work) + §2.1 module table.
- Feature spec (consumer of ingest + chunks): `docs/be/features/kb-ingestion/spec.md`.
- Embedder consumed: `docs/crm/plans/17-llm-gateway.md` (Plan 17 step 5 `embedText`).
- DB layer: `docs/crm/plans/15-db-layer-postgresql.md`.
- Defense-in-depth rule "AI never writes to KB": `docs/be/MVP.md` §3.2 rule #4 + §3.5 layer 1; structural enforcement here.
- Retrieval consumes `searchByTextFts` and `getChunksByIds`: `docs/crm/plans/19-retrieval-pipeline.md`.
- REST endpoint that triggers ingest: `docs/crm/plans/21-rest-endpoints.md` (POST /api/crm/knowledge/upload).
- Audit log of ingest events: `docs/crm/plans/22-audit-log.md`.

## Notes
- **Embeddings are FULL MVP — no half work.** The pipeline runs end-to-end on a real file with real MiniMax embeddings. The dev seed in Plan 15 uses constant vectors only for the test fixtures; production data is fully embedded.
- **Idempotency on `(tenant_id, source_path, chunk_index, text_hash)`.** Re-uploading the same file does NOT create duplicate chunks; the SHA-256 short-circuit returns the existing `fileId`. Re-uploading a slightly different file creates a new row.
- **Async pipeline.** The route handler returns 202 + `{ fileId, status: 'queued' }` immediately. The background worker drains the queue serially per file (parallel across files up to a 4-worker pool). Plan 21 documents the API contract.
- **WRITE-RESTRICTED.** `chunks.js` exposes ONLY read methods publicly. The internal write helpers are exported with a `__ingest` prefix and are imported only by `ingest.js`. The LLM gateway in Plan 17 and the retrieval pipeline in Plan 19 cannot reach them — even if they tried, the imports would fail to resolve.
- The IVFFlat index is built with `lists = 100` per Plan 15's migration. If the actual chunk count is < 10 000, `lists` is too high and query quality degrades. Plan 15's migration handles this with an adaptive `lists` recomputation. Plan 19's retrieval spec asserts `EXPLAIN ANALYZE` shows reasonable recall at small N (≥ 80% of brute-force top-K).
- Embedding dimension is `1536` per `knowledge_chunks.embedding VECTOR(1536)`. If MiniMax exposes a different dimension, the migration's `VECTOR(1536)` must be updated (this is a doc-gap → escalate).
- Plan 17's `embedText` already handles inputs that exceed the embedding model's token limit by chunking and averaging. Plan 18 does NOT pre-chunk for embedding; it relies on Plan 18's `chunker.js` (maxTokens=512) producing chunks within the model's limit.
- Failures during embedding leave the `knowledge_files` row in `status='failed'` with `last_error` set. The operator-facing KB UI (FE module) reads `status` and `last_error` for the chip indicator.