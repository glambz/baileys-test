-- Migration 012: vector index for CRM entity records.
-- Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap A)
--
-- Until now `entity_records` were invisible to RAG — hybrid.js said so
-- outright ("entity_records are NOT chunked into knowledge_chunks").
-- Records live in their own table rather than in knowledge_chunks because
-- they have a different lifecycle and provenance from uploaded documents,
-- and because knowledge_chunks.file_id is a NOT NULL FK to knowledge_files
-- (a synthetic file row per record would pollute the Knowledge page).
--
-- Idempotent: re-running is safe.

CREATE TABLE IF NOT EXISTS record_embeddings (
  id           TEXT PRIMARY KEY,
  record_id    TEXT NOT NULL REFERENCES entity_records(id) ON DELETE CASCADE,
  entity_id    TEXT NOT NULL,
  tenant_id    TEXT NOT NULL DEFAULT 'default',
  chunk_index  INTEGER NOT NULL,
  text         TEXT NOT NULL,
  text_hash    TEXT NOT NULL,
  embedding    VECTOR(1024),
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, chunk_index)
);

-- Re-index on update deletes-then-inserts by record_id; this index keeps
-- that cheap, and the FK cascade uses it on record delete.
CREATE INDEX IF NOT EXISTS record_embeddings_record_idx
  ON record_embeddings (record_id);

CREATE INDEX IF NOT EXISTS record_embeddings_entity_idx
  ON record_embeddings (entity_id);

-- BM25/FTS branch, mirroring knowledge_chunks_text_fts_idx.
CREATE INDEX IF NOT EXISTS record_embeddings_text_fts_idx
  ON record_embeddings USING gin (to_tsvector('simple', text));

-- ANN branch. HNSW over cosine distance, matching how knowledge_chunks
-- is queried (embedding <=> query).
CREATE INDEX IF NOT EXISTS record_embeddings_embedding_idx
  ON record_embeddings USING hnsw (embedding vector_cosine_ops);
