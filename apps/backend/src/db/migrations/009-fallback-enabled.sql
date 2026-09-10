-- Migration 009 — add fallback_enabled toggle to ai_settings.
-- Source: docs/maintenance/fe-be-integration-2026-07-16/plan.md §5.
--
-- Renumbered from the original plan's 007 because a parallel dispatch owns
-- 007-fallback-enabled.sql in this same cycle.
--
-- When fallback_enabled=false, the trigger should NOT send the locked
-- Indonesian fallback phrase on fallback_used:true — instead escalate
-- directly to human_pending_flag. The settings store reads this column.

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS fallback_enabled BOOLEAN NOT NULL DEFAULT TRUE;
