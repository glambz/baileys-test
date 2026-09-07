'use strict';
/**
 * Running conversation summary (Layer 1 of the dual-layer memory strategy).
 *
 * Source: post-cycle follow-up on 2026-07-09 — "I love the summary and the
 * top K = 10". The summary is an LLM-generated digest of the running chat,
 * persisted in `chats.conversation_summary` (TEXT, ~1-4 KB) and reloaded
 * on every trigger turn. The episodic store (../store/episodic.js) carries
 * the granular detail; the summary carries the high-level narrative thread.
 *
 * Cost discipline:
 *   - The summary is refreshed at most once every MIN_REFRESH_SECONDS.
 *   - The worker reads at most MAX_CONTEXT_MESSAGES recent messages.
 *   - The summary is capped at MAX_SUMMARY_CHARS (4 KB).
 *
 * Debounce: callers invoke `maybeUpdateSummary(chatId, tenantId, ctx)`
 * which checks `summary_updated_at` and skips the LLM call if the cache
 * is still fresh. The full LLM-driven update lives in `updateChatSummary`.
 */
const { getPool } = require('../../db/client');
const { createChatCompletion } = require('../llm');
const { currentAccountId } = require('../../whatsapp/account');

const MIN_REFRESH_SECONDS = Number(process.env.SUMMARY_MIN_REFRESH_SECONDS || 600); // 10 min
const MAX_CONTEXT_MESSAGES = Number(process.env.SUMMARY_MAX_CONTEXT_MESSAGES || 30);
const MAX_SUMMARY_CHARS = Number(process.env.SUMMARY_MAX_CHARS || 4000);
const MAX_BODY_CHARS = 400;

const SUMMARIZER_SYSTEM = `Anda adalah ringkas percakapan. Tugas Anda: membaca daftar pesan (user/assistant) dan menghasilkan RINGKASAN STRUKTURAL dalam Bahasa Indonesia, maksimal ~${MAX_SUMMARY_CHARS} karakter.

Format output (JSON, no markdown fencing):
{
  "topic": "topik utama percakapan saat ini (1 kalimat)",
  "user_intent": "apa yang user ingin capai (1 kalimat)",
  "key_facts": ["fakta penting 1", "fakta penting 2", ...],
  "decisions": ["keputusan/kesepakatan 1", ...],
  "open_questions": ["pertanyaan yang belum terjawab 1", ...],
  "running_summary": "paragraf 2-4 kalimat yang merangkum percakapan secara kronologis, mempertahankan entity names dan angka penting"
}

Aturan:
- Hanya catat fakta dari pesan, jangan mengarang.
- Jika pesan terlalu tua atau tidak relevan, kompres menjadi 1 baris.
- Pertahankan nama paket, harga, tanggal, dan angka spesifik yang user sebutkan.
- Output JSON valid, tidak ada teks lain di luar JSON.`;

function nowSec() { return Math.floor(Date.now() / 1000); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function loadChatSummary(chatId) {
  if (!chatId) return '';
  const pool = getPool();
  const r = await pool.query(
    'SELECT conversation_summary FROM chats WHERE id = $1 AND account_jid = $2',
    [chatId, currentAccountId() || '']
  );
  return r.rows.length > 0 ? (r.rows[0].conversation_summary || '') : '';
}

async function maybeUpdateSummary(chatId, tenantId, opts) {
  opts = opts || {};
  if (!chatId) return;
  const pool = getPool();
  const r = await pool.query(
    'SELECT summary_updated_at FROM chats WHERE id = $1 AND account_jid = $2',
    [chatId, currentAccountId() || '']
  );
  const lastUpdate = r.rows.length > 0 ? Number(r.rows[0].summary_updated_at || 0) : 0;
  const now = nowSec();
  if (lastUpdate && (now - lastUpdate) < MIN_REFRESH_SECONDS) {
    return; // cache is fresh; skip the LLM call
  }
  if (opts.fireAndForget) {
    // Caller wants non-blocking — schedule and return immediately.
    updateChatSummary(chatId, tenantId).catch(() => {});
    return;
  }
  return updateChatSummary(chatId, tenantId);
}

async function updateChatSummary(chatId, tenantId) {
  if (!chatId) return;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, direction, body, timestamp
       FROM messages
      WHERE chat_id = $1 AND account_jid = $3
      ORDER BY timestamp DESC
      LIMIT $2`,
    [chatId, MAX_CONTEXT_MESSAGES, currentAccountId() || '']
  );
  if (r.rows.length === 0) return;
  const lines = [];
  // Build chronologically (oldest first)
  for (let i = r.rows.length - 1; i >= 0; i -= 1) {
    const row = r.rows[i];
    const who = row.direction === 'in' ? 'user' : 'assistant';
    const body = (row.body || '').slice(0, MAX_BODY_CHARS);
    lines.push(`[${row.timestamp}] ${who}: ${body}`);
  }
  const previousSummary = await loadChatSummary(chatId);
  const userPrompt = [
    previousSummary
      ? `Ringkasan sebelumnya:\n${previousSummary}\n\n---\nPesan-pesan terbaru (terlama -> terbaru):\n${lines.join('\n')}`
      : `Pesan-pesan terbaru (terlama -> terbaru):\n${lines.join('\n')}`,
    '\n\nUpdate ringkasan di atas dengan pesan-pesan baru. Output JSON saja.',
  ].join('');

  let summaryText = '';
  try {
    const r2 = await createChatCompletion({
      systemPrompt: SUMMARIZER_SYSTEM,
      userPrompt,
      jsonSchema: { name: 'conversation_summary', schema: { type: 'object', additionalProperties: true } },
    });
    summaryText = (r2.content || '').trim();
    // Strip markdown fencing if the LLM added it.
    summaryText = summaryText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (summaryText.length > MAX_SUMMARY_CHARS) {
      summaryText = summaryText.slice(0, MAX_SUMMARY_CHARS);
    }
  } catch (err) {
    // LLM failure — keep the previous summary; just bump the timestamp
    // so we don't retry on every turn.
    summaryText = previousSummary;
  }
  await pool.query(
    `UPDATE chats
        SET conversation_summary = $1,
            summary_updated_at    = $2
      WHERE id = $3 AND account_jid = $4`,
    [summaryText, nowSec(), chatId, currentAccountId() || '']
  );
}

module.exports = {
  loadChatSummary,
  updateChatSummary,
  maybeUpdateSummary,
  SUMMARIZER_SYSTEM,
  MIN_REFRESH_SECONDS,
  MAX_CONTEXT_MESSAGES,
  MAX_SUMMARY_CHARS,
};
