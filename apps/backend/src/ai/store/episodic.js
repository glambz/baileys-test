'use strict';
/**
 * Episodic memory store.
 * Source: cycle be-ai-auto-reply follow-up "auto-reply has no context of the
 * ongoing conversation" + dual-layer memory strategy (2026-07-09).
 *
 * Layer 2 of the dual-layer approach:
 *   - Every message (in + out) gets a BGE-M3 embedding persisted to
 *     `messages.embedding` (1024-dim).
 *   - `episodicSearch` returns the top-K messages for a chat ordered by
 *     cosine similarity to a query embedding, so the trigger can always
 *     include the most relevant past turns without loading the full chat.
 *
 * Layer 1 (the running summary) lives in `chats.conversation_summary` and
 * is maintained by `../settings/summary.js`.
 */
const { getPool } = require('../../db/client');
const { embedText } = require('../llm/embed');
const { currentAccountId } = require('../../whatsapp/account');

/**
 * Embed the message body and persist the vector. Idempotent: an existing
 * embedding for the same `id` is overwritten (so re-runs of the embedding
 * pipeline stay correct after a model upgrade).
 *
 * @param {object} args
 * @param {string} args.id          message id (Baileys key.id for inbound,
 *                                  our generated id for outbound)
 * @param {string} args.chatId      chat JID (already LID-resolved by caller)
 * @param {string} args.body        message text
 * @param {'in'|'out'} args.direction
 * @param {number} [args.timestamp] epoch seconds
 * @returns {Promise<void>}
 */
async function embedAndStoreMessage(args) {
  if (!args || !args.id || !args.chatId || !args.body) return;
  let vec;
  try {
    vec = await embedText(args.body);
  } catch (_) {
    // Embedding service unavailable — store the row without a vector so
    // search still works for messages that DO have embeddings. Better to
    // miss one row than to drop the message entirely.
    return;
  }
  const pool = getPool();
  await pool.query(
    `UPDATE messages
        SET embedding = $1::vector
      WHERE id = $2 AND account_jid = $3`,
    [JSON.stringify(vec), args.id, currentAccountId() || '']
  );
}

/**
 * Vector-search the messages table for a chat. Returns the top-K messages
 * ordered by cosine similarity to `queryEmbedding`, descending.
 *
 * @param {object} args
 * @param {string} args.chatId
 * @param {number[]} args.queryEmbedding
 * @param {number} [args.topK=10]
 * @param {number} [args.minTimestamp] only return messages with
 *   timestamp >= this epoch seconds (e.g. last 30 days)
 * @returns {Promise<Array<{id, role, body, ts, score}>>}
 */
async function episodicSearch(args) {
  const chatId = args.chatId;
  const q = args.queryEmbedding;
  const topK = Number.isFinite(args.topK) ? args.topK : 10;
  if (!chatId || !Array.isArray(q) || q.length === 0) return [];
  const pool = getPool();
  const vecLiteral = `[${q.join(',')}]`;
  const params = [vecLiteral, chatId];
  let tsFilter = '';
  if (Number.isFinite(args.minTimestamp)) {
    params.push(args.minTimestamp);
    tsFilter = `AND timestamp >= $${params.length}`;
  }
  // Episodic recall must not reach into another linked account's history.
  params.push(currentAccountId() || '');
  const acctIdx = params.length;
  params.push(topK);
  const r = await pool.query(
    `SELECT id, direction, body, timestamp,
            1 - (embedding <=> $1::vector) AS score
       FROM messages
      WHERE chat_id = $2
        AND account_jid = $${acctIdx}
        AND embedding IS NOT NULL
        ${tsFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    role: row.direction === 'in' ? 'user' : 'assistant',
    body: row.body || '',
    ts: Number(row.timestamp) || 0,
    score: Number(row.score) || 0,
  }));
}

module.exports = {
  embedAndStoreMessage,
  episodicSearch,
};
