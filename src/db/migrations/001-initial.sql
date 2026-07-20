-- Migration 001 — Initial: extend existing chats table with AI columns.
-- Source: docs/be/MVP.md §2.2 + docs/crm/plans/15-db-layer-postgresql.md
-- Idempotent: every DDL is IF NOT EXISTS / uses DO blocks.

-- Defense-in-depth layer 6: AIReplyMode literal enforced at SQL layer.
-- Byte-identical to frontend/src/types/crm.ts:7.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'ai_mode'
  ) THEN
    ALTER TABLE chats
      ADD COLUMN ai_mode TEXT NOT NULL DEFAULT 'ai'
        CHECK (ai_mode IN ('ai', 'human', 'human_pending_flag'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'ai_pending_flag'
  ) THEN
    ALTER TABLE chats
      ADD COLUMN ai_pending_flag BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;