-- Migration 000 — Base chats table.
-- Source: docs/tech/chat-data-model.md §2.1 + docs/tech/postgresql-schema.md
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- This table is purely new from this BE-AI cycle (cycle be-ai-auto-reply-2026-07-03).
-- The existing Baileys backend (src/controllers/) has NO chatsController; nothing
-- creates the `chats` table at runtime. Migration 001-initial.sql assumes it
-- exists for its ALTER TABLE statements. This migration satisfies that
-- assumption on fresh databases.
--
-- Schema mirrors docs/tech/chat-data-model.md §2.1 (the `Chat` TypeScript
-- interface) with Postgres type mapping from docs/tech/postgresql-schema.md.

CREATE TABLE IF NOT EXISTS chats (
  id                    TEXT        PRIMARY KEY,
  jid                   TEXT        NOT NULL,
  phone                 TEXT,
  last_message_preview  TEXT        NOT NULL DEFAULT '',
  last_message_at       BIGINT      NOT NULL DEFAULT 0,
  unread_count          INTEGER     NOT NULL DEFAULT 0,
  pinned                BOOLEAN     DEFAULT false,
  muted                 BOOLEAN     DEFAULT false,
  archived              BOOLEAN     DEFAULT false
);