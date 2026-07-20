-- Migration 003 — Indexes.
-- Source: docs/be/MVP.md §2.2 + docs/crm/plans/15-db-layer-postgresql.md

-- ANN over KB chunks (pgvector cosine). Lists adapts via DO block.
DO $$
DECLARE
  chunk_count INT;
  lists INT;
BEGIN
  SELECT count(*) INTO chunk_count FROM knowledge_chunks;
  lists := GREATEST(10, CEIL(SQRT(chunk_count)))::INT;
  IF lists < 1 THEN lists := 1; END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = %s)',
    lists
  );
END
$$;

-- BM25 (Postgres FTS) over KB chunks.
CREATE INDEX IF NOT EXISTS knowledge_chunks_text_fts_idx
  ON knowledge_chunks USING gin (to_tsvector('simple', text));

-- Hash index for text_hash idempotency.
CREATE INDEX IF NOT EXISTS knowledge_chunks_text_hash_idx
  ON knowledge_chunks USING hash (text_hash);

-- GIN on entity_records.data (jsonb_path_ops).
CREATE INDEX IF NOT EXISTS entity_records_data_gin
  ON entity_records USING gin (data jsonb_path_ops);

-- Partial btree on contact_id — index-only scans for defense-in-depth layer 6.
CREATE INDEX IF NOT EXISTS entity_records_contact_idx
  ON entity_records (contact_id) WHERE contact_id IS NOT NULL;