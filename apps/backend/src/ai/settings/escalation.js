'use strict';
/**
 * Agent-facing escalation briefing.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap B)
 *
 * Distinct from ../settings/summary.js. That module keeps a *running*
 * conversation digest, debounced to once per 10 minutes and written
 * fire-and-forget — which means at the moment a chat escalates it can be
 * empty or stale. This module answers a different question, asked once,
 * at the escalation: "an agent is picking this up cold — what do they need
 * in the next ten seconds?"
 *
 * Generated synchronously on the escalation path so the briefing exists
 * before the operator is alerted.
 */
const { getPool } = require('../../db/client');
const { createChatCompletion } = require('../llm');

const MAX_CONTEXT_MESSAGES = Number(process.env.ESCALATION_MAX_CONTEXT_MESSAGES || 20);
const MAX_BODY_CHARS = 400;

const REASON_HINTS = {
  confidence_low: 'AI menghasilkan jawaban tapi confidence-nya di bawah threshold.',
  fallback_handoff: 'AI memilih frasa fallback karena tidak menemukan jawaban di knowledge base.',
  ungrounded_number: 'AI menyebut angka yang tidak ada di knowledge base — kemungkinan halusinasi.',
  turbo_cutoff: 'Skor retrieval di bawah cutoff — knowledge base tidak punya materi yang relevan.',
  parse_failure: 'Output LLM tidak bisa di-parse menjadi JSON yang valid.',
};

const BRIEFING_SYSTEM = `Anda menyiapkan CATATAN SERAH TERIMA untuk agent manusia yang baru saja mengambil alih percakapan WhatsApp dari AI. Agent ini belum pernah membaca percakapan ini.

Tulis dalam Bahasa Indonesia. Output HANYA JSON valid, tanpa markdown fencing.

Format:
{
  "headline": "satu kalimat: inti masalahnya apa (maksimal 100 karakter)",
  "customer_wants": "apa yang pelanggan minta, 1-2 kalimat",
  "ai_attempted": "apa yang sudah dicoba AI dan kenapa berhenti, 1-2 kalimat",
  "blocking_gap": "informasi apa yang tidak tersedia sehingga AI tidak bisa lanjut, 1 kalimat",
  "suggested_next_action": "langkah konkret berikutnya untuk agent, 1 kalimat",
  "sentiment": "neutral" | "frustrated" | "urgent"
}

Aturan:
- Hanya gunakan fakta dari percakapan. Jangan mengarang harga, tanggal, atau janji.
- Pertahankan nama produk, angka, dan tanggal persis seperti yang disebut pelanggan.
- "suggested_next_action" harus bisa langsung dikerjakan, bukan saran umum.
- Jika pelanggan terdengar kesal atau mendesak, cerminkan itu di "sentiment".`;

function nowSec() { return Math.floor(Date.now() / 1000); }

/**
 * Strip markdown fencing and parse. Returns null on anything unparseable
 * so the caller can fall back rather than throw on the escalation path.
 */
function parseBriefing(raw) {
  const cleaned = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return o;
  } catch (_) {
    return null;
  }
}

/**
 * A briefing that is still useful when the LLM call fails. The reason and
 * the model's own reasoning are known locally, so an agent is never left
 * with a blank panel.
 */
function fallbackBriefing({ reason, reasoning, confidence }) {
  return {
    headline: REASON_HINTS[reason] || 'Chat dialihkan ke agent manusia.',
    customer_wants: '',
    ai_attempted: reasoning || '',
    blocking_gap: REASON_HINTS[reason] || String(reason || ''),
    suggested_next_action: 'Baca 3 pesan terakhir dan balas manual.',
    sentiment: 'neutral',
    degraded: true,
  };
}

/**
 * Generate and persist the briefing for one escalation.
 *
 * Never throws: escalation must complete even if the LLM is down. On
 * failure a degraded briefing (built from locally-known facts) is stored
 * instead, so `escalation_briefing` is always populated after a handoff.
 *
 * @returns {Promise<object>} the briefing that was persisted
 */
async function generateEscalationBriefing({
  chatId, tenantId, reason, reasoning, confidence, retrievedChunks, currentMessage,
}) {
  const pool = getPool();

  let lines = [];
  try {
    const r = await pool.query(
      `SELECT direction, body, timestamp
         FROM messages
        WHERE chat_id = $1
        ORDER BY timestamp DESC
        LIMIT $2`,
      [chatId, MAX_CONTEXT_MESSAGES]
    );
    // Chronological (oldest first) so the model reads the arc in order.
    lines = r.rows
      .slice()
      .reverse()
      .map((row) => `${row.direction === 'in' ? 'pelanggan' : 'AI'}: ${(row.body || '').slice(0, MAX_BODY_CHARS)}`);
  } catch (_) {
    lines = [];
  }

  // The message that caused the escalation is persisted fire-and-forget by
  // the trigger, so this read can race it and miss the single most
  // important line. Append it explicitly when the DB has not caught up.
  // (Observed: a briefing that said "the customer's actual question was
  // not recorded" because of exactly this race.)
  if (currentMessage) {
    const trimmed = String(currentMessage).slice(0, MAX_BODY_CHARS);
    const already = lines.some((l) => l.startsWith('pelanggan: ') && l.slice(11) === trimmed);
    if (!already) lines.push(`pelanggan: ${trimmed}`);
  }

  let briefing = null;
  try {
    const kbNote = (retrievedChunks && retrievedChunks.length)
      ? `\n\nPotongan knowledge base yang sempat diambil:\n${retrievedChunks
          .slice(0, 3)
          .map((c, i) => `[${i + 1}] ${String((c.chunk && c.chunk.text) || c.text || '').slice(0, 300)}`)
          .join('\n')}`
      : '\n\nTidak ada potongan knowledge base yang relevan ditemukan.';

    const userPrompt = [
      `Alasan eskalasi: ${reason} — ${REASON_HINTS[reason] || 'tidak diketahui'}`,
      confidence != null ? `Confidence AI: ${confidence}` : null,
      reasoning ? `Alasan internal dari AI: ${reasoning}` : null,
      `\nPercakapan (terlama -> terbaru):\n${lines.join('\n') || '(tidak ada pesan tersimpan)'}`,
      kbNote,
      '\n\nBuat catatan serah terima. Output JSON saja.',
    ].filter(Boolean).join('\n');

    const r = await createChatCompletion({
      systemPrompt: BRIEFING_SYSTEM,
      userPrompt,
      jsonSchema: { name: 'escalation_briefing', schema: { type: 'object', additionalProperties: true } },
    });
    briefing = parseBriefing(r.content);
  } catch (_) {
    briefing = null;
  }

  if (!briefing) briefing = fallbackBriefing({ reason, reasoning, confidence });

  // Carry the machine-known facts regardless of what the model produced,
  // so the UI can render the reason badge without trusting the LLM.
  briefing.reason = reason || null;
  briefing.confidence = confidence != null ? confidence : null;
  briefing.ai_reasoning = reasoning || null;

  try {
    await pool.query(
      `UPDATE chats
          SET escalation_briefing = $1::jsonb,
              escalation_reason   = $2,
              escalation_at       = $3
        WHERE id = $4`,
      [JSON.stringify(briefing), reason || null, nowSec(), chatId]
    );
  } catch (_) {
    // Persisting is best-effort; the mode transition already happened and
    // must not be rolled back because the briefing could not be stored.
  }

  return briefing;
}

async function loadEscalationBriefing(chatId) {
  try {
    const r = await getPool().query(
      'SELECT escalation_briefing, escalation_reason, escalation_at FROM chats WHERE id = $1',
      [chatId]
    );
    if (r.rows.length === 0) return null;
    return {
      briefing: r.rows[0].escalation_briefing || null,
      reason: r.rows[0].escalation_reason || null,
      at: Number(r.rows[0].escalation_at || 0),
    };
  } catch (_) {
    return null;
  }
}

module.exports = {
  generateEscalationBriefing,
  loadEscalationBriefing,
  parseBriefing,
  fallbackBriefing,
  BRIEFING_SYSTEM,
};
