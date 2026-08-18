-- Migration 011: AI chat history (in-app workspace).
-- Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
-- Per-user history. Even though the app is single-user now, user_id is
-- nullable so future multi-tenant upgrades don't need a schema change.
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT,                       -- nullable for single-user now
  tenant_id    TEXT NOT NULL DEFAULT 'default',
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  confidence   DOUBLE PRECISION NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'answered'
    CHECK (kind IN ('answered', 'fallback')),
  evidence     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest-first for the history sidebar.
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_created_at
  ON ai_chat_history (created_at DESC);

-- Per-tenant partition for fast tenant queries.
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant_created
  ON ai_chat_history (tenant_id, created_at DESC);
