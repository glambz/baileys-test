'use strict';
/**
 * /api/chats — chat list + messages + outbound send.
 * Cycle: be-fe-integration-2026-07-16.
 * Plan:  docs/maintenance/fe-be-integration-2026-07-16/plan.md §1-2.
 *
 * Mirrors src/mock/handler.ts lines 51-115. The FE has been calling these
 * endpoints against the mock and they need to exist on the real BE now.
 *
 *   GET  /api/chats                  -> {chats: ChatDto[]}
 *   GET  /api/chats/:id/messages     -> {chatId, messages: MessageDto[], nextBefore?}
 *   POST /api/chats/:id/messages     -> {message: MessageDto}
 *
 * Field names use camelCase to match the FE's contract.ts MessageDto/ChatDto
 * types exactly (do NOT change these names without coordinating with FE).
 */
const { Router } = require('express');
const { getPool } = require('../db/client');
const { currentAccountId } = require('../whatsapp/account');

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      // BUG-AI-HUMAN-TOGGLE-NO-VISUAL-UPDATE fix (2026-07-16): include
      // ai_mode in the SELECT + the response so the FE sidebar + ThreadHeader
      // can read the current mode from the chat list. Without this, the FE
      // ThreadHeader (which derives mode from chat.aiMode ?? 'ai') always
      // rendered the AI segment on initial mount, even when the BE actually
      // had a human_pending_flag mode.
      // Account-scoped. This query had NO where clause at all, so after
      // switching linked accounts the sidebar listed the previous account's
      // chats alongside the current one's.
      `SELECT id, jid, phone, ai_mode, last_message_at
         FROM chats
        WHERE account_jid = $1
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT 200`,
      [currentAccountId() || ''],
    );
    res.json({
      chats: r.rows.map((row) => ({
        id: row.id,
        jid: row.jid,
        phone: row.phone || undefined,
        // Include ai_mode + normalise to one of the three FE-recognised values.
        // Anything else (e.g. a stray DB enum) falls back to 'ai' so the UI
        // never renders an unrecognised pill.
        aiMode: ['ai', 'human', 'human_pending_flag'].includes(row.ai_mode)
          ? row.ai_mode
          : 'ai',
        lastMessagePreview: '',
        lastMessageAt: row.last_message_at ? Number(row.last_message_at) : Math.floor(Date.now() / 1000),
        unreadCount: 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const pool = getPool();
    const chatId = decodeURIComponent(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const beforeParam = req.query.before ? Number(req.query.before) : undefined;
    const afterParam = req.query.after ? Number(req.query.after) : undefined;
    const params = [chatId, currentAccountId() || ''];
    let where = 'chat_id = $1 AND account_jid = $2';
    if (typeof beforeParam === 'number' && !Number.isNaN(beforeParam)) {
      params.push(beforeParam);
      where += ` AND timestamp < $${params.length}`;
    }
    if (typeof afterParam === 'number' && !Number.isNaN(afterParam)) {
      params.push(afterParam);
      // Strict-greater-than so the FE can use the most recent message's
      // timestamp as `after` to discover new messages incrementally.
      where += ` AND timestamp > $${params.length}`;
    }
    // BUG-CHAT-NEW-MSG-NOT-VISIBLE fix (2026-07-22): default to the LATEST
    // messages (DESC + LIMIT, then reverse to ASC for the FE) so the
    // initial fetch + every poll actually surfaces new inbound + AI
    // replies. The previous ASC order returned the OLDEST 50 messages
    // for a chat that had 52+ rows, so any newer message (ts > oldest 50)
    // was simply not in the response and the FE had no way to know it
    // existed. With DESC + LIMIT, the default fetch now returns the most
    // recent 50 messages which is what the user expects to see on mount
    // AND on poll.
    const r = await pool.query(
      `SELECT id, chat_id, direction, body, sender_name, timestamp, is_fallback
         FROM messages
        WHERE ${where}
        ORDER BY timestamp DESC, id DESC
        LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    // Reverse to chronological ASC so the FE list naturally reads
    // oldest-at-top, newest-at-bottom.
    const messages = r.rows.reverse().map((row) => ({
      id: row.id,
      chatId: row.chat_id,
      direction: row.direction === 'out' ? 'out' : 'in',
      key: { remoteJid: row.chat_id, fromMe: row.direction === 'out' },
      senderName: row.sender_name || null,
      body: row.body || null,
      kind: 'text',
      caption: null,
      mime: null,
      timestamp: Number(row.timestamp),
      isFallback: row.is_fallback === true,
    }));
    // nextBefore = oldest of returned (use to find messages BEFORE these)
    // nextAfter = newest of returned (use to find messages AFTER these)
    const nextBefore = messages.length > 0 ? messages[0].timestamp : undefined;
    const nextAfter = messages.length > 0 ? messages[messages.length - 1].timestamp : undefined;
    res.json({
      chatId,
      messages,
      ...(typeof nextBefore === 'number' ? { nextBefore } : {}),
      ...(typeof nextAfter === 'number' ? { nextAfter } : {}),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const pool = getPool();
    const chatId = decodeURIComponent(req.params.id);
    const body =
      typeof req.body && typeof req.body.body === 'string'
        ? req.body.body.trim()
        : '';
    if (!body || body.length > 4096) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'body must be 1-4096 chars after trim',
      });
    }
    const id = `srv-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const ts = Math.floor(Date.now() / 1000);
    await pool.query(
      `INSERT INTO messages (id, chat_id, direction, body, sender_name, timestamp, is_fallback, account_jid)
       VALUES ($1, $2, 'out', $3, NULL, $4, false, $5)`,
      [id, chatId, body, ts, currentAccountId() || ''],
    );
    res.json({
      message: {
        id,
        chatId,
        direction: 'out',
        key: { remoteJid: chatId, fromMe: true },
        senderName: null,
        body,
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: ts,
        isFallback: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
