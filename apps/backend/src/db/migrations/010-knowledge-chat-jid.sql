-- Migration 010: Chat scope on knowledge chunks.
-- Source: docs/specs/2026-08-18-kb-chat-scope-guardrail.md
-- chat_jid = NULL means global (tenant-wide) knowledge; safe to surface to any chat.
-- chat_jid = <jid> means tied to a specific WhatsApp chat; only surface to that chat.
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS chat_jid TEXT;

-- Backfill: existing rows are global.
UPDATE knowledge_chunks SET chat_jid = NULL WHERE chat_jid IS NULL;

-- Partial index for the common case where most KB is global.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_chat_jid
  ON knowledge_chunks (chat_jid)
  WHERE chat_jid IS NOT NULL;
