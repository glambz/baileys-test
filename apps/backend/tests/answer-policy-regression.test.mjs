/**
 * Answer-policy: regression guard — high-score KB matches still answer normally.
 *
 * Cycle: be-answer-policy-2026-07-15
 * Plan:  docs/maintenance/answer-policy-defer-to-human-2026-07-15/plan.md §3.1
 *
 * The TAU_TURBO change must NOT regress the happy path: when the retrieval
 * score is comfortably above 0.30 and the LLM says `fallback_used: false`,
 * the trigger MUST send the LLM's answer, MUST NOT transition the chat
 * to `human_pending_flag`, and MUST NOT write an `auto_reply_handoff`
 * audit row.
 *
 * Today this test passes (the trigger already handles the happy path
 * correctly). After GREEN the test must STILL pass — it guards against
 * an over-aggressive cutoff or an accidental always-on handoff.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const AUDIT_TMP = path.join(process.cwd(), 'tmp', 'answer-policy-audit');
fs.mkdirSync(AUDIT_TMP, { recursive: true });
process.env.AUDIT_DIR = AUDIT_TMP;
process.env.LLM_PROVIDER = 'mock';

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_CHAT_ID = '6289990001111@s.whatsapp.net';

let processInboundMessage;
let loadChatMode;
let getPool;

beforeAll(async () => {
  if (!HAS_DB) return;
  const originalFetch = globalThis.fetch;
  globalThis.__originalFetch = originalFetch;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                answer: 'Paket bulanan harganya Rp 5.000.000 ya kak.',
                citations: [1],
                confidence: 0.92,
                fallback_used: false,
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 5, output_tokens: 8, total_tokens: 13 },
    }),
  }));

  const triggerMod = await import('../src/ai/whatsapp/trigger.js');
  processInboundMessage = triggerMod.processInboundMessage;
  const handoffMod = await import('../src/ai/whatsapp/handoff.js');
  loadChatMode = handoffMod.loadChatMode;
  const dbMod = await import('../src/db/client.js');
  getPool = dbMod.getPool;
});

afterAll(async () => {
  if (globalThis.__originalFetch) globalThis.fetch = globalThis.__originalFetch;
  if (!HAS_DB) return;
  const pool = getPool();
  await pool.query(`UPDATE chats SET ai_mode = 'ai' WHERE id = $1`, [TEST_CHAT_ID]);
  await pool.query(`DELETE FROM knowledge_chunks WHERE id = 'regression-kb-1'`);
  await pool.query(`DELETE FROM knowledge_files WHERE id = 'regression-file-1'`);
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const pool = getPool();
  await pool.query(
    `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode)
     VALUES ($1, $1, '+6289990001111', '', EXTRACT(EPOCH FROM NOW())::int, 0, 'ai')
     ON CONFLICT (id) DO UPDATE SET ai_mode = 'ai', phone = EXCLUDED.phone`,
    [TEST_CHAT_ID]
  );
  // Pre-seed the KB with a chunk that contains the number the LLM cites,
  // so the numerical grounding check (step 11) passes. Schema:
  // knowledge_chunks(id PK, file_id FK, chunk_index, text, text_hash,
  //                   embedding, metadata, created_at).
  // We need a parent knowledge_files row first.
  await pool.query(
    `INSERT INTO knowledge_files (id, filename, mime_type, size_bytes, storage_path)
     VALUES ('regression-file-1', 'regression.txt', 'text/plain', 100, '/tmp/regression.txt')
     ON CONFLICT (id) DO NOTHING`,
  );
  const text = 'paket bulanan harganya Rp 5.000.000 ya kak';
  const crypto = await import('crypto');
  const textHash = crypto.createHash('sha256').update(text).digest('hex');
  await pool.query(
    `INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding)
     VALUES ('regression-kb-1', 'regression-file-1', 0, $1, $2, NULL)
     ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, text_hash = EXCLUDED.text_hash`,
    [text, textHash]
  );
});

afterAll(async () => {
  if (!HAS_DB) return;
  const pool = getPool();
  // Cleanup so we don't pollute dev DB.
  await pool.query(`DELETE FROM knowledge_chunks WHERE id = 'regression-kb-1'`);
  await pool.query(`DELETE FROM knowledge_files WHERE id = 'regression-file-1'`);
});

describe('answer-policy — happy-path regression guard (BUGFIX RED)', () => {
  it('runs end-to-end with a real DB and stubbed LLM', () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set — this test needs a real Postgres. Set it in .env.');
    }
  });

  it('when LLM returns fallback_used=false with high confidence, sends without handoff transition or audit row', async () => {
    if (!HAS_DB) return;

    const result = await processInboundMessage(
      {
        key: { id: 'ap-regression-1', fromMe: false, remoteJid: TEST_CHAT_ID },
        messageTimestamp: Math.floor(Date.now() / 1000),
        body: 'paket bulanan',
      },
      { sock: { sendMessage: async () => ({ key: { id: 'mock-out-r1' }, messageTimestamp: Math.floor(Date.now() / 1000) }) } },
    );

    expect(result.decision).toBe('send');

    const afterMode = await loadChatMode(TEST_CHAT_ID);
    // MUST NOT have transitioned to human_pending_flag.
    expect(afterMode).toBe('ai');

    // MUST NOT have written an auto_reply_handoff row for this chat.
    const today = new Date().toISOString().slice(0, 10);
    const auditPath = path.join(AUDIT_TMP, `${today}.ndjson`);
    if (fs.existsSync(auditPath)) {
      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      const handoffRow = lines
        .map((l) => JSON.parse(l))
        .find((r) => r.eventType === 'auto_reply_handoff' && r.chatId === TEST_CHAT_ID);
      expect(handoffRow, 'must NOT write auto_reply_handoff when fallback_used=false').toBeFalsy();
    }
  });
});