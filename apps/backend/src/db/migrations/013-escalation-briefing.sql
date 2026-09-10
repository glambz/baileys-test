-- Migration 013: agent-facing escalation briefing.
-- Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap B)
--
-- `chats.conversation_summary` is a running digest refreshed at most once
-- per 10 minutes. At the moment a chat escalates it can be empty or stale
-- (verified: a live escalation left the handoff endpoint returning a
-- zero-length summary). These columns hold a briefing generated at the
-- escalation itself, so the agent taking over always has current context.
--
-- Idempotent: re-running is safe.

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS escalation_briefing JSONB,
  ADD COLUMN IF NOT EXISTS escalation_reason   TEXT,
  ADD COLUMN IF NOT EXISTS escalation_at       BIGINT NOT NULL DEFAULT 0;

-- Operator queues sort by "most recently escalated first"; partial because
-- most chats have never escalated.
CREATE INDEX IF NOT EXISTS chats_escalation_at_idx
  ON chats (escalation_at DESC)
  WHERE escalation_at > 0;
