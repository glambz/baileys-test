-- Migration 005 — outbound `messages` table.
-- Source: src/ai/whatsapp/send.js references `messages` for tracking
-- outbound AI replies, but no prior migration creates it. Every
-- auto_reply_sent was failing with `relation "messages" does not exist`,
-- leaving the AI echo loop unsuppressed.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Minimal schema: the only required columns are the ones send.js writes
-- (id, chat_id, direction, body, key, timestamp, status). Other columns
-- can be added later as additive migrations if needed.

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT        PRIMARY KEY,
  chat_id       TEXT        NOT NULL,
  direction     TEXT        NOT NULL CHECK (direction IN ('in', 'out')),
  body          TEXT        NOT NULL DEFAULT '',
  key           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  timestamp     BIGINT      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed'))
);

CREATE INDEX IF NOT EXISTS messages_chat_id_timestamp_idx
  ON messages (chat_id, timestamp DESC);
