-- Migration 006 — episodic memory layer.
-- Source: post-cycle follow-up after "auto-reply has no context of the
-- ongoing conversation". Per docs/crm/plans/19-retrieval-pipeline.md +
-- the dual-layer memory strategy agreed with U on 2026-07-09:
--   Layer 1: running summary (chats.conversation_summary, ~1KB)
--   Layer 2: episodic vector store (messages.embedding, BGE-M3 1024-dim)
-- Idempotent: every DDL is IF NOT EXISTS / uses DO blocks.

-- 1. messages.embedding: per-message vector for selective retrieval.
--    Without this, the trigger has no way to surface "what was said 200
--    turns ago" without loading the full chat. With this, the top-10 most
--    similar past messages fit in ~1KB of context.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE messages ADD COLUMN embedding VECTOR(1024);
  END IF;
END
$$;

-- 2. chats.conversation_summary: LLM-generated digest of the running
--    conversation. Updated by src/ai/settings/summary.js after every turn.
--    Capped at ~4KB; old summaries are compressed by the worker.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'conversation_summary'
  ) THEN
    ALTER TABLE chats ADD COLUMN conversation_summary TEXT NOT NULL DEFAULT '';
  END IF;
END
$$;

-- 3. chats.summary_updated_at: epoch seconds of the last summary refresh.
--    Used to debounce summary updates (don't recompute every turn).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'summary_updated_at'
  ) THEN
    ALTER TABLE chats ADD COLUMN summary_updated_at BIGINT NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- Indexes for the episodic search.
CREATE INDEX IF NOT EXISTS messages_chat_id_ts_idx
  ON messages (chat_id, timestamp DESC);
-- The vector index is optional for small chat histories; create it but
-- tolerate failure (e.g. ivfflat requires a minimum row count).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'messages_embedding_ivf_idx'
  ) THEN
    BEGIN
      CREATE INDEX messages_embedding_ivf_idx
        ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 4);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'messages_embedding_ivf_idx: skipped (%): %', SQLSTATE, SQLERRM;
    END;
  END IF;
END
$$;
