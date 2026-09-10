'use strict';
/**
 * Baileys sendMessage wrapper with retry + audit.
 * Source: docs/crm/plans/20-whatsapp-trigger-state-machine.md step 2.
 */
const { getPool } = require('../../db/client');
const { currentAccountId } = require('../../whatsapp/account');
const audit = require('../audit/log');
const episodic = require('../store/episodic');

class SendFailedError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SendFailedError';
    this.cause = cause;
  }
}

function jitter(base) {
  const factor = 1 + (Math.random() * 0.4 - 0.2);
  return base * factor;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  if (!err) return false;
  const status = err.status || err.statusCode || (err.output && err.output.statusCode);
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
}

// The persona prompt instructs the model to close every supported sentence
// with a [n] citation marker (base-prompts.js, "Format jawaban dengan
// citation [n]"). That is right for grounding and wrong for the customer:
// the markers were reaching WhatsApp verbatim — observed "…untuk Paket A [3]."
// Stripping here, at the one choke point every outbound reply passes
// through, keeps the sent text, the stored body and the chat preview
// identical. The locked fallback phrase carries no marker, so it is
// byte-identical through this.
const CITATION_MARKER = /[ \t]*\[\d{1,3}\](?=[\s.,;:!?)’'"]|$)/g;
function stripCitations(text) {
  return String(text || '')
    .replace(CITATION_MARKER, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function sendReply({ sock, chatId, body, tenantId, isFallback }) {
  tenantId = tenantId || 'default';
  body = stripCitations(body);
  const maxRetries = Number(process.env.ANTI_BAN_MAX_SEND_RETRIES || 3);
  let attempt = 0;
  let lastErr;
  while (attempt < maxRetries) {
    try {
      const r = await sock.sendMessage(chatId, { text: body });
      const messageId = r && r.key && r.key.id;
      const timestamp = r && r.messageTimestamp ? Number(r.messageTimestamp) : Math.floor(Date.now() / 1000);
      // Persist outbound message.
      const pool = getPool();
      await pool.query(
        `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status, is_fallback, account_jid)
         VALUES ($1, $2, 'out', $3, $4::jsonb, $5, 'sent', $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          messageId || `out_${Date.now()}`,
          chatId,
          body,
          JSON.stringify({ id: messageId, fromMe: true }),
          timestamp,
          isFallback === true,
          currentAccountId() || '',
        ]
      );
      // Update chat preview. `chats.last_message_at` is BIGINT epoch seconds
      // (see src/db/migrations/000-base-chats.sql), not a timestamp — so the
      // value is passed through as $2 without a to_timestamp() cast.
      await pool.query(
        `UPDATE chats
         SET last_message_preview = $1, last_message_at = $2, unread_count = 0
         WHERE id = $3 AND account_jid = $4`,
        [body.slice(0, 200), timestamp, chatId, currentAccountId() || '']
      );
      await audit.write('auto_reply_sent', {
        chatId,
        tenantId,
        messageId,
        bodyLength: body.length,
      });
      // BUG-PUSH-EVENTS feature (2026-08-03): emit message.created to the
      // SSE topic so the FE's EventSource receives the new outbound message
      // in real time. Best-effort; never throws.
      try {
        const events = require('../../api/events');
        events.publish(chatId, 'message.created', {
          id: messageId,
          chatId,
          direction: 'out',
          bodyLength: body.length,
          timestamp,
        });
      } catch (_) { /* never block on logging */ }
      // Embed the outbound reply for the episodic memory store. Fire and
      // forget — the trigger has already returned a successful send; a
      // slow embedding service must not delay the user-visible reply.
      episodic.embedAndStoreMessage({
        id: messageId || `out_${timestamp}`,
        chatId,
        body,
        direction: 'out',
        timestamp,
      }).catch(() => {});
      return { messageId, timestamp };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries - 1) break;
      await sleep(jitter(1000 * Math.pow(2, attempt)));
      attempt += 1;
    }
  }
  await audit.write('auto_reply_hold', {
    chatId,
    tenantId,
    reason: 'send_failure',
    error: String(lastErr && lastErr.message ? lastErr.message : lastErr).slice(0, 500),
  });
  throw new SendFailedError(lastErr ? lastErr.message : 'send failed', lastErr);
}

module.exports = { sendReply, SendFailedError, stripCitations };