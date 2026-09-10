-- Migration 008 — extend messages for FE wire-up (cycle be-fe-integration-2026-07-16).
-- Source: docs/maintenance/fe-be-integration-2026-07-16/plan.md §2.
--
-- is_fallback marks whether the row is the locked fallback phrase sent by the
-- trigger at step 9b. The FE renders these distinctly (smaller / muted).
--
-- sender_name carries the display name of the sender so the FE's
-- Message.senderName field has data to read.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
