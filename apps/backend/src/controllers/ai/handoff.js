'use strict';
/**
 * GET /api/crm/ai/handoff?chatId=... — handoff context for the operator.
 *
 * Cycle: be-handoff-summary-2026-07-15
 * Plan:  docs/maintenance/handoff-summary-2026-07-15/plan.md §3
 *
 * Returns the chat's conversation summary, last N messages, the reason
 * the chat was flagged (fallback_handoff | confidence_low | ungrounded_number
 * | turbo_cutoff | parse_failure), and the chat meta. The endpoint is
 * GATED on `aiMode === 'human_pending_flag'` so the operator can only
 * view handoff context for chats that have been handed off.
 *
 * Reads from:
 *   - `chats` (SQL) for ai_mode, phone, last_message_at, conversation_summary, summary_updated_at
 *   - `messages` (SQL) for the last 3 messages
 *   - `audit/log.js` NDJSON file for the latest auto_reply_handoff / auto_reply_hold
 */
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { getPool } = require('../../db/client');
const { loadChatMode, ChatNotFoundError } = require('../../ai/whatsapp/handoff');
const { loadChatSummary } = require('../../ai/settings/summary');
const audit = require('../../ai/audit/log');

const QuerySchema = z.object({
  chatId: z.string().min(1),
});

const LAST_MESSAGES_COUNT = 3;

const FLAG_REASON_LABELS = {
  fallback_handoff: 'AI kirim pesan fallback; butuh dijawab manusia',
  confidence_low: 'AI keyakinannya rendah; butuh tinjauan',
  ungrounded_number: 'AI menghasilkan angka yang tidak ada di knowledge DB',
  turbo_cutoff: 'Retrieval score di bawah threshold; KB tidak punya jawaban',
  parse_failure: 'LLM output tidak bisa di-parse',
  human_pending_flag: 'Operator sebelumnya menandai chat untuk dijawab manusia',
};

function findLatestHandoffEvent(chatId) {
  // Audit is an NDJSON file, one per UTC day. We scan today's file plus
  // the previous 6 days to cover operator lookups across handoff windows.
  // Returns the most recent auto_reply_handoff / auto_reply_hold row for
  // this chat, or null if none exists.
  const days = 7;
  let latest = null;
  for (let i = 0; i < days; i += 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const p = path.join(audit.AUDIT_DIR, `${day}.ndjson`);
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (_) {
      continue;
    }
    const lines = raw.split('\n').filter(Boolean);
    for (let j = lines.length - 1; j >= 0; j -= 1) {
      let row;
      try {
        row = JSON.parse(lines[j]);
      } catch (_) {
        continue;
      }
      if (row.chatId !== chatId) continue;
      if (row.eventType !== 'auto_reply_handoff' && row.eventType !== 'auto_reply_hold') continue;
      // First match scanning newest-first is the most recent.
      return row;
    }
  }
  return latest;
}

function deriveFlagReason(auditRow) {
  if (!auditRow) return 'human_pending_flag';
  if (auditRow.eventType === 'auto_reply_handoff') return 'fallback_handoff';
  // auto_reply_hold — use payload.reason if it matches a known enum, else
  // pass through so the FE can still show "ditandai untuk dijawab manusia".
  const r = auditRow.reason;
  if (r === 'fallback_handoff' || r === 'confidence_low' || r === 'ungrounded_number' ||
      r === 'turbo_cutoff' || r === 'parse_failure') {
    return r;
  }
  return 'human_pending_flag';
}

async function handler(req, res, next) {
  try {
    const parsedQ = QuerySchema.safeParse(req.query || {});
    if (!parsedQ.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'chatId query param required',
        details: parsedQ.error.issues,
      });
    }
    const { chatId } = parsedQ.data;

    // 1. Load chat mode; 404 if the chat doesn't exist.
    let mode;
    try {
      mode = await loadChatMode(chatId);
    } catch (err) {
      if (err instanceof ChatNotFoundError) {
        return res.status(404).json({ error: 'ChatNotFound', chatId });
      }
      throw err;
    }
    if (mode !== 'human_pending_flag') {
      return res.status(404).json({ error: 'NotInHumanPendingFlag', chatId, currentMode: mode });
    }

    // 2. Load summary + chat meta + last messages from SQL.
    const pool = getPool();
    const summaryText = await loadChatSummary(chatId).catch(() => '');

    const [metaRes, msgRes] = await Promise.all([
      pool.query(
        `SELECT phone, last_message_at, summary_updated_at
           FROM chats WHERE id = $1`,
        [chatId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, direction, body, timestamp
           FROM messages
          WHERE chat_id = $1
          ORDER BY timestamp DESC
          LIMIT $2`,
        [chatId, LAST_MESSAGES_COUNT],
      ).catch(() => ({ rows: [] })),
    ]);

    const metaRow = metaRes && metaRes.rows && metaRes.rows[0];
    const phone = metaRow ? metaRow.phone : null;
    const lastMessageAt = metaRow ? Number(metaRow.last_message_at || 0) : 0;
    const summaryUpdatedAt = metaRow ? Number(metaRow.summary_updated_at || 0) : 0;

    const lastMessagesRaw = msgRes && msgRes.rows ? msgRes.rows : [];
    // SQL returned newest-first (ORDER BY timestamp DESC). The plan's
    // payload shows oldest->newest order so the operator reads top->down.
    const lastMessages = lastMessagesRaw.slice().reverse().map((r) => ({
      id: r.id,
      direction: r.direction,
      body: r.body || '',
      timestamp: Number(r.timestamp || 0),
    }));

    // 3. Find the latest auto_reply_handoff / auto_reply_hold audit row.
    const auditRow = findLatestHandoffEvent(chatId);
    const flagReason = deriveFlagReason(auditRow);
    const flagReasonLabel = FLAG_REASON_LABELS[flagReason] || 'Chat ditandai untuk dijawab manusia';

    return res.json({
      chatId,
      aiMode: mode,
      phone,
      lastMessageAt,
      flagReason,
      flagReasonLabel,
      conversationSummary: summaryText,
      summaryUpdatedAt,
      lastMessages,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handler, deriveFlagReason, findLatestHandoffEvent };