<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md §2.1, §4
  - docs/be/features/ai-orchestration/spec.md
  - frontend/src/mock/knowledge.ts (FE metadata shape parity)
-->

# KB Ingestion — Spec

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §2.1.
> If anything in this document conflicts with MVP.md, MVP.md wins.

The **knowledge-base ingestion pipeline** ingests uploaded files
(PDF / DOCX / HTML / XLSX), extracts text via OCR, chunks it
semantically, embeds each chunk via the MiniMax embeddings endpoint,
and upserts into Postgres with idempotency. The retrieval layer
(`hybrid.js`) then queries both BM25 (Postgres FTS) and ANN
(pgvector cosine) over the chunks.

## 1. Upload → storage → OCR → chunk → embed → upsert

```
[HTTP POST multipart/form-data]
            │
            ▼
[multipart parse]    →  storage at ./data/kb/<tenant>/<file_id><ext>
            │
            ▼
[OCR by mime type]   →  plain text per page/sheet
            │
            ▼
[chunker.js]         →  ~512 tokens per chunk, 50-token overlap
            │         deterministic per-file SHA-256 for idempotency
            ▼
[embed.js]           →  MiniMax embeddings (1536 dims default)
            │
            ▼
[Postgres upsert]    →  knowledge_files + knowledge_chunks
            │
            ▼
[HTTP 200 response]  →  { fileId, sha256, chunksCount, status: 'indexed' }
```

The HTTP response is returned **before** the chunking/embedding
finishes — the pipeline runs async. The operator polls
`GET /api/crm/knowledge/files/:id` for status.

## 2. Storage format

- File binary: `./data/kb/<tenant_id>/<file_id><ext>`.
- Metadata: `knowledge_files` row (id, tenant_id, filename, mime_type,
  size_bytes, storage_path, status, chunks_count, last_error,
  ingested_at, created_at).
- Chunk text + embedding: `knowledge_chunks` rows (id, file_id,
  chunk_index, text, text_hash, embedding, metadata, created_at).
- The text_hash column is the SHA-256 of the chunk text; it is the
  idempotency key together with `(tenant_id, source_path, chunk_index)`.

## 3. OCR module choice per file type

| Mime | Library | Output |
|---|---|---|
| `application/pdf` | `pdf-parse@^1` | per-page text array |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) | `mammoth@^1` | plain text |
| `text/html` | `cheerio@^1` | stripped text |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) | `xlsx@^0.18` | per-sheet rows → joined text |
| `text/plain` | native | raw |

Plain text is stored as-is; the chunker joins it directly.

The OCR module lives at `src/ai/retrieval/ocr.js` and is a thin
wrapper around the four libraries. Adding a new mime type is a
single switch case.

## 4. Semantic chunking

```js
// src/ai/retrieval/chunker.js (signature)
export function chunk(text: string, opts?: { tokens?: number; overlap?: number }): Chunk[];
// Default: { tokens: 512, overlap: 50 }
```

Rules:

- Aim for ~512 tokens per chunk (configurable). Tokenization is the
  MiniMax tokenizer to ensure embedding-quality parity.
- 50-token overlap (configurable). The overlap is between consecutive
  chunks.
- Deterministic per-file SHA-256: each chunk's `text_hash` is the
  SHA-256 of its text. The pipeline uses
  `(tenant_id, source_path, chunk_index)` as the idempotency key —
  re-running the same upload does not re-embed.

## 5. MiniMax embeddings

### 5.1 Env vars

| Var | Default | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `minimax` | locked for MVP |
| `MINIMAX_EMBEDDING_MODEL` | (MiniMax embed model) | The model id, e.g. `text-embedding-3-small` or the MiniMax equivalent |
| `MINIMAX_EMBEDDING_DIMS` | `1536` | Vector dimensions for the `VECTOR(N)` column |

### 5.2 Client

Uses the same `openai@^4` SDK pointed at MiniMax's OpenAI-compatible
embeddings endpoint. SHA-256 cache: `Map<textHash, Float32Array>`,
in-memory, bounded at 10 000 entries (LRU eviction). Reduces
re-embedding on identical chunks across files.

### 5.3 Vector type in Postgres

```sql
CREATE TABLE knowledge_chunks (
  ...
  embedding VECTOR(1536) NOT NULL,
  ...
);
```

The `1536` is the locked default; if `MINIMAX_EMBEDDING_DIMS` differs
the migration emits the matching `VECTOR(N)`. **All chunks in a
single tenant MUST share the same dimensionality**; mixing dimensions
in the same `embedding` column is a migration error.

## 6. Postgres upsert + idempotency

```sql
-- knowledge_files
INSERT INTO knowledge_files (id, tenant_id, filename, mime_type, size_bytes, storage_path, status, chunks_count, ingested_at)
VALUES ($1, $2, $3, $4, $5, $6, 'indexed', $7, now())
ON CONFLICT (id) DO UPDATE
  SET status = EXCLUDED.status,
      chunks_count = EXCLUDED.chunks_count,
      last_error = NULL,
      ingested_at = EXCLUDED.ingested_at;

-- knowledge_chunks
INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding, metadata)
VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
ON CONFLICT (file_id, chunk_index) DO UPDATE
  SET text = EXCLUDED.text,
      text_hash = EXCLUDED.text_hash,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata;
```

The `(file_id, chunk_index)` unique constraint is what gives
idempotency on re-ingestion of the same file. The
`(tenant_id, source_path, chunk_index)` triple is the operator-visible
idempotency contract (per MVP.md §2.1).

## 7. pgvector `ivfflat` index with adaptive `lists`

```sql
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

The `lists = 100` default is for ~10k–100k chunk corpora. The BE
computes an adaptive value at migration time:

```
lists = max(10, round(sqrt(chunk_count)))
```

This matches the risk mitigation in MVP.md §8 — pgvector quality
drops on small datasets if `lists` is too high. Migration emits the
computed `lists` value (not the literal `100`) so the index is sized
to the actual corpus.

## 8. BM25 / FTS index

```sql
CREATE INDEX knowledge_chunks_text_fts_idx ON knowledge_chunks
  USING gin (to_tsvector('simple', text));
```

Uses the `'simple'` text-search configuration (no stemming; works for
both Indonesian and English). BM25 ranking is computed via
`ts_rank_cd` in `src/ai/retrieval/bm25.js`.

## 9. Status lifecycle

| Status | Set by | Meaning |
|---|---|---|
| `queued` | upload endpoint | File accepted, OCR not started |
| `ingesting` | pipeline start | OCR / chunk / embed in progress |
| `indexed` | pipeline success | Chunks persisted, FTS + ANN indexes updated |
| `failed` | any pipeline step throws | `last_error` column carries the message; operator can retry by re-uploading |

## 10. Frontend metadata parity

The `knowledge_files` response shape (returned by
`GET /api/crm/knowledge/files`) mirrors the FE's
[`KnowledgeFile`](../../../frontend/src/types/crm.ts:93-105)
interface. The `status` values are renamed on the wire to the FE's
enum: `queued → pending`, `ingesting → chunked`, `indexed → embedded`,
`failed → failed`.

| BE (`knowledge_files.status`) | FE (`KnowledgeFileStatus`) |
|---|---|
| `queued` | `'pending'` |
| `ingesting` | `'chunked'` |
| `indexed` | `'embedded'` |
| `failed` | `'failed'` |

The mapping is a single switch in `src/ai/store/chunks.js::toApiShape()`.

## 11. KB writes are reachable ONLY from `ingest.js`

Per MVP.md §3.2 rule 4: the LLM's structured output schema does NOT
include any `addKbEntry` or `updateKbEntry` action. The router
endpoints do NOT accept chunk writes. Only `ingest.js` (operator
upload) writes to `knowledge_chunks`. The DB GRANT for the AI
service role excludes `INSERT` on `knowledge_chunks`.

This is enforced at three layers:
1. The zod schema in `parse.js` has no KB write action.
2. The router `src/ai/routes/knowledge.js` has no POST/PATCH/PUT
   path that targets `knowledge_chunks`.
3. The DB GRANT for the BE's app role lacks `INSERT` on
   `knowledge_chunks`.

## 12. Out of scope (this run)

- KB auto-tag extraction at ingest time (Phase 3).
- Audio / video OCR (Phase 3 — Tesseract for images only this run).
- Streaming chunked uploads (the upload is fully buffered).
- Re-embedding endpoint (`POST /api/crm/knowledge/files/:id/reembed`
  in the FE's mock spec) — not in this run's MVP endpoint list
  (MVP.md §2.3 does not include it).

## 13. Cross-references

- Goals: [`docs/be/MVP.md`](../../../be/MVP.md) §2.1, §4.
- AI orchestration (embeddings client): [`../ai-orchestration/spec.md`](../ai-orchestration/spec.md) §4.
- API: [`../../api/api-spec.md`](../../api/api-spec.md) §"KB endpoints".
- Postgres DDL: [`../../../tech/postgresql-schema.md`](../../../tech/postgresql-schema.md).
- FE types: [`../../../frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts) §`KnowledgeFile`, §`KnowledgeChunk`.