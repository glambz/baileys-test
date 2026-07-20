'use strict';
/**
 * AIReplyMode state machine + DB transitions.
 * Source: docs/crm/plans/20-whatsapp-trigger-state-machine.md step 1.
 *
 * The literal union `'ai' | 'human' | 'human_pending_flag'` is byte-equal
 * to frontend/src/types/crm.ts:7 and to the SQL CHECK constraint.
 */
const { getPool } = require('../../db/client');

class ForbiddenTransitionError extends Error {
  constructor(fromMode, toMode) {
    super(`Cannot transition from ${fromMode} to ${toMode}`);
    this.name = 'ForbiddenTransitionError';
    this.fromMode = fromMode;
    this.toMode = toMode;
  }
}

class ChatNotFoundError extends Error {
  constructor(chatId) {
    super(`Chat not found: ${chatId}`);
    this.name = 'ChatNotFoundError';
    this.chatId = chatId;
  }
}

// Allowed transitions (MVP.md §3.4).
// The BE never auto-flags from human (`human -> human_pending_flag` forbidden),
// but the operator can re-enable via Plan 21's toggle-mode (human -> ai).
const ALLOWED = new Set([
  'ai->human_pending_flag',
  'ai->human',
  'human_pending_flag->ai',
  'human_pending_flag->human',
  'human->ai',
]);

function assertTransitionAllowed(fromMode, toMode) {
  if (!fromMode || !toMode) {
    throw new ForbiddenTransitionError(fromMode, toMode);
  }
  if (fromMode === toMode) return; // idempotent
  if (!ALLOWED.has(`${fromMode}->${toMode}`)) {
    throw new ForbiddenTransitionError(fromMode, toMode);
  }
}

async function loadChatMode(chatId) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT ai_mode FROM chats WHERE id = $1',
    [chatId]
  );
  if (r.rows.length === 0) throw new ChatNotFoundError(chatId);
  return r.rows[0].ai_mode;
}

async function loadChatContactId(chatId) {
  const pool = getPool();
  const r = await pool.query(
    'SELECT contact_id FROM chats WHERE id = $1',
    [chatId]
  );
  if (r.rows.length === 0) throw new ChatNotFoundError(chatId);
  return r.rows[0].contact_id;
}

/**
 * Idempotent upsert: ensures a `chats` row exists for the given JID.
 * Called on every inbound message so the trigger's first step
 * (loadChatMode) succeeds for previously-unknown contacts.
 *
 * Sets:
 *   - id = chatId (chat JID is the natural primary key)
 *   - jid = chatId (mirror of id, preserved for downstream consumers)
 *   - phone = opts.phone (senderPn-derived phone; may be null)
 *   - last_message_at = opts.lastMessageAt on insert AND on conflict (updates timestamp)
 *
 * Idempotent: running on every message is safe and cheap. The ON CONFLICT
 * clause does not touch ai_mode / jid, so an operator's per-chat toggle
 * (human / human_pending_flag) survives subsequent inbound messages.
 */
async function upsertChatOnInbound(chatId, opts) {
  opts = opts || {};
  if (!chatId) return;
  const pool = getPool();
  const phone = opts.phone || null;
  const lastMessageAt = opts.lastMessageAt || Math.floor(Date.now() / 1000);
  await pool.query(
    `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count)
     VALUES ($1, $1, $2, '', $3, 0)
     ON CONFLICT (id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at`,
    [chatId, phone, lastMessageAt]
  );
}

async function transitionChatMode(chatId, fromMode, toMode, _reason) {
  // Idempotent.
  if (fromMode === toMode) return;
  assertTransitionAllowed(fromMode, toMode);
  const pool = getPool();
  const r = await pool.query(
    `UPDATE chats SET ai_mode = $1 WHERE id = $2 AND ai_mode = $3 RETURNING ai_mode`,
    [toMode, chatId, fromMode]
  );
  if (r.rows.length === 0) {
    // Either chat doesn't exist or mode has changed underneath us.
    const cur = await pool.query('SELECT ai_mode FROM chats WHERE id = $1', [chatId]);
    if (cur.rows.length === 0) throw new ChatNotFoundError(chatId);
    throw new ForbiddenTransitionError(cur.rows[0].ai_mode, toMode);
  }
}

module.exports = {
  loadChatMode,
  loadChatContactId,
  transitionChatMode,
  upsertChatOnInbound,
  assertTransitionAllowed,
  ForbiddenTransitionError,
  ChatNotFoundError,
};