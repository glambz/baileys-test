<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/features/kb-ingestion/spec.md
-->

# KB Ingestion — PRD

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §2.1.

The PRD for the KB ingestion pipeline. Internal infrastructure.

## KB-1. Operator uploads a KB file

- **As an** operator,
- **when** I POST a multipart file to `POST /api/crm/knowledge/upload`,
- **I want** the BE to ingest it, OCR it, chunk it, embed it, and
  index it,
- **so that** the AI can ground its answers on the file.

**Acceptance**

- The endpoint accepts `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `text/html`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  and `text/plain`.
- Max upload size: 50 MB.
- The HTTP 200 returns `{ fileId, sha256, chunksCount, status: 'queued' }`
  **before** the pipeline finishes (async pipeline).
- The pipeline writes `knowledge_files.status = 'indexed'` on success
  and `'failed'` on any thrown error.

## KB-2. Operator lists KB files

- **As an** operator,
- **when** I GET `/api/crm/knowledge/files`,
- **I want** a paginated list of files for the current tenant,
- **so that** I can see what's indexed.

**Acceptance**

- Returns an array of `KnowledgeFile`-shaped objects (FE parity,
  mapped to the FE's status enum per `spec.md` §10).
- Supports `?limit` (default 20, max 100) and `?offset`.

## KB-3. Operator reads a single file's metadata

- **As an** operator,
- **when** I GET `/api/crm/knowledge/files/:id`,
- **I want** the file's metadata plus chunk count and last-reindex
  timestamp,
- **so that** I can confirm ingestion completed.

**Acceptance**

- 404 if not found.
- Includes `chunksCount`, `ingestedAt`, `lastError` (nullable).

## KB-4. Operator deletes a KB file

- **As an** operator,
- **when** I DELETE `/api/crm/knowledge/files/:id`,
- **I want** the BE to delete the binary, all chunks, and the row,
- **so that** the file is fully removed from retrieval.

**Acceptance**

- CASCADE delete of `knowledge_chunks` (FK).
- The binary at `./data/kb/<tenant>/<file_id><ext>` is unlinked.
- 404 if not found.

## KB-5. Idempotency

- **As the** BE,
- **when** the operator re-uploads the same file (same SHA-256),
- **I want** the pipeline to skip re-embedding and reuse the existing
  `knowledge_chunks` rows,
- **so that** the upload is cheap and deterministic.

**Acceptance**

- The `(tenant_id, source_path, chunk_index)` triple is the
  idempotency key.
- The `ON CONFLICT (file_id, chunk_index) DO UPDATE` upsert handles
  it.
- An idempotent re-upload returns the original `fileId`.

## KB-6. KB writes are restricted to the ingest path

- **As the** system,
- **I want** the LLM's structured output schema to have NO KB write
  action,
- **so that** the AI cannot write to the KB.

**Acceptance**

- The zod schema in `parse.js` has no `addKbEntry` / `updateKbEntry`
  action.
- The router `src/ai/routes/knowledge.js` does not accept POST/PATCH/PUT
  to `knowledge_chunks`.
- The DB GRANT for the BE's app role lacks `INSERT` on `knowledge_chunks`.