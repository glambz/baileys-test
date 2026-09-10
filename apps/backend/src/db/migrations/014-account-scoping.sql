-- Migration 014: scope chats and messages to the WhatsApp account that owns them.
--
-- Before this, nothing recorded which linked account a row belonged to.
-- `chats.id` is the CONTACT's JID and was the entire primary key, so:
--
--   * logging out of account A and pairing account B wrote both accounts'
--     chats into the same rows. `INSERT ... ON CONFLICT (id) DO UPDATE` meant
--     a contact both accounts had messaged collided on one row, keeping
--     account A's ai_mode / conversation_summary / escalation_briefing.
--   * `messages` has its own PK (the WhatsApp message id), so account B's
--     messages did not overwrite anything — they ACCUMULATED into account A's
--     thread, interleaved by timestamp.
--   * the read path had no filter whatsoever
--     (`SELECT ... FROM chats ORDER BY last_message_at DESC`), so account B's
--     operator saw every one of account A's chats.
--
-- `tenant_id` did not help: it is a fixed deployment constant ('default'),
-- never derived from the paired account.
--
-- Idempotent: re-running is safe.

-- ---------------------------------------------------------------------------
-- 1. Add the column. Empty string rather than NULL, because `account_jid = $1`
--    never matches NULL and NULL rows would silently vanish from every scoped
--    read, which reads as data loss.
-- ---------------------------------------------------------------------------
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS account_jid TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS account_jid TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 2. Backfill. Everything already in the database belongs to whichever account
--    was paired when it was written, and only one ever has been. Take that
--    account from the inbox writer's persisted self number, passed in as a
--    setting by the migration runner; fall back to leaving rows unscoped when
--    it is unknown rather than guessing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  self_pn TEXT := coalesce(nullif(current_setting('baileys.self_pn', true), ''), '');
BEGIN
  IF self_pn <> '' THEN
    UPDATE chats    SET account_jid = self_pn WHERE account_jid = '';
    UPDATE messages SET account_jid = self_pn WHERE account_jid = '';
    RAISE NOTICE 'backfilled chats/messages with account_jid=%', self_pn;
  ELSE
    RAISE NOTICE 'baileys.self_pn not set; historic rows left with account_jid='''' '
                 '(they will be adopted by the next successful pairing)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Re-key chats on (account_jid, id).
--
--    This is the part that actually stops the merge: two accounts talking to
--    the same contact now get two rows instead of one, so the ON CONFLICT
--    upsert updates only the current account's row.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'chats_pkey'
       AND i.indnatts = 1
  ) THEN
    ALTER TABLE chats DROP CONSTRAINT chats_pkey;
    ALTER TABLE chats ADD CONSTRAINT chats_pkey PRIMARY KEY (account_jid, id);
    RAISE NOTICE 'chats primary key is now (account_jid, id)';
  ELSE
    RAISE NOTICE 'chats primary key already composite; no-op';
  END IF;
END
$$;

-- Reads still address a chat by contact JID alone in a few admin paths, so
-- keep that lookup indexed now that it is no longer the primary key.
CREATE INDEX IF NOT EXISTS chats_id_idx ON chats (id);

-- ---------------------------------------------------------------------------
-- 4. Index the message read path, which is always account + chat + time.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_account_chat_ts_idx
  ON messages (account_jid, chat_id, "timestamp" DESC);

-- NOTE: knowledge_chunks.chat_jid (chat-scoped KB) is NOT account-scoped here.
-- It is currently unused — zero rows have a non-null chat_jid — so scoping it
-- would be speculative. If chat-scoped KB is ever adopted, it needs the same
-- treatment, because a contact JID means different things to different
-- accounts.
