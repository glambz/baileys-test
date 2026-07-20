/**
 * GET /api/crm/chats/modes — vitest spec.
 * Cycle: be-fe-integration-2026-07-16
 * Plan:  docs/maintenance/fe-be-integration-2026-07-16/plan.md §3
 *
 * The FE has been calling /api/crm/chats/modes (via
 * src/hooks/crm/useCrmAi.ts useCrmChatsModes) and the route doesn't exist
 * on the BE. Expectation: { modes: { chatId: 'ai' | 'human' | 'human_pending_flag' } }.
 *
 * Requires DATABASE_URL (skipped gracefully otherwise).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import dotenv from 'dotenv';
import request from 'supertest';

dotenv.config();

const HAS_DB = !!process.env.DATABASE_URL;
const CHAT_A = '628444000111@s.whatsapp.net';
const CHAT_B = '628444000222@s.whatsapp.net';
const CHAT_C = '628444000333@s.whatsapp.net';
const NOW = Math.floor(Date.now() / 1000);

let app;
let getPool;
let buildApp;

beforeAll(async () => {
  buildApp = (await import('../index.js')).buildApp;
  app = buildApp();

  if (HAS_DB) {
    const dbMod = await import('../db/client.js');
    getPool = dbMod.getPool;
  }
});

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    const pool = getPool();
    for (const id of [CHAT_A, CHAT_B, CHAT_C]) {
      await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [id]);
      await pool.query(`DELETE FROM chats WHERE id = $1`, [id]);
    }
  } catch (_) {}
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const pool = getPool();
  for (const id of [CHAT_A, CHAT_B, CHAT_C]) {
    await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [id]);
    await pool.query(`DELETE FROM chats WHERE id = $1`, [id]);
  }
});

describe('GET /api/crm/chats/modes', () => {
  it('returns 200 + { modes: { id: aiMode } } seeded from chats.ai_mode', async () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode)
       VALUES ($1, $1, '+628444000111', '', $2, 0, 'ai'),
              ($3, $3, '+628444000222', '', $2, 0, 'human_pending_flag'),
              ($4, $4, '+628444000333', '', $2, 0, 'human')`,
      [CHAT_A, NOW, CHAT_B, CHAT_C],
    );

    const r = await request(app).get('/api/crm/chats/modes');

    expect(r.status).toBe(200);
    expect(r.body.modes).toBeTruthy();
    expect(r.body.modes[CHAT_A]).toBe('ai');
    expect(r.body.modes[CHAT_B]).toBe('human_pending_flag');
    expect(r.body.modes[CHAT_C]).toBe('human');
  });
});
