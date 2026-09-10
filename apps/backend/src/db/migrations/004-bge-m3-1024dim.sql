-- Migration 004 — switch knowledge_chunks.embedding from VECTOR(1536)
-- to VECTOR(1024) to match MarcoAland/Indonesian-bge-m3 (BGE-M3, 1024-dim).
-- The existing 1536-dim data is dropped; re-run `pnpm db:seed` (or
-- python src/scripts/re-embed.py) to repopulate with real BGE-M3 vectors.
-- Idempotent: re-running this migration is safe.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'
      AND udt_name = 'vector'
  ) THEN
    ALTER TABLE knowledge_chunks DROP COLUMN embedding;
    ALTER TABLE knowledge_chunks ADD COLUMN embedding VECTOR(1024);
    RAISE NOTICE 'knowledge_chunks.embedding: VECTOR(1024) (was 1536; data cleared)';
  ELSE
    RAISE NOTICE 'knowledge_chunks.embedding already 1024 or missing; no-op';
  END IF;
END
$$;
