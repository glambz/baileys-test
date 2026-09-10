-- Migration 015: allow status='received' on messages.
--
-- `messages_status_check` allowed only sent/delivered/read/failed, but
-- src/ai/whatsapp/trigger.js has always inserted 'received' for inbound
-- messages. Every one of those inserts violated the constraint and threw.
-- The throw was swallowed by the fire-and-forget IIFE around it, so nothing
-- surfaced — but the statement immediately after the insert is
-- `episodic.embedAndStoreMessage(...)`, which therefore never ran.
--
-- Measured before this migration: 0 of 72 inbound messages had an embedding,
-- against 8 of 74 outbound. The AI's episodic recall of what the CUSTOMER
-- said was permanently empty, and the trigger silently fell back to the
-- last-6-turns markdown history instead.
--
-- 'received' is the semantically correct value for an inbound message, and
-- it is what the code already writes, so widen the constraint rather than
-- changing the code to lie with 'sent'. (The existing inbound rows all read
-- 'sent' because src/inbox/writer.js omits the column and takes the
-- DEFAULT 'sent' — inaccurate but harmless, and left alone here rather than
-- rewritten, since nothing reads status to mean direction.)
--
-- Idempotent: re-running is safe.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
  CHECK (status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'received'::text]));
