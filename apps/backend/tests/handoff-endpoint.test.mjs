/**
 * GET /api/crm/ai/handoff?chatId=... — vitest spec.
 *
 * Cycle: be-handoff-summary-2026-07-15
 * Plan:  docs/maintenance/handoff-summary-2026-07-15/plan.md §4.1
 *
 * The handoff endpoint returns the conversation summary + last 3 messages
 * + flag reason for a chat that has been transitioned to
 * `human_pending_flag`. The endpoint is gated on that mode so the
 * operator can only view handoff context for chats that have been
 * handed off (404 otherwise).
 *
 * The route reads from:
 *   - `chats` (SQL) — for ai_mode, phone, last_message_at, conversation_summary, summary_updated_at
 *   - `messages` (SQL) — for the last 3 messages
 *   - `audit/log.js` NDJSON file — for the latest auto_reply_handoff /
 *     auto_reply_hold event (the flag reason).
 *
 * The tests use a real Postgres (DATABASE_URL required) and an isolated
 * AUDIT_DIR so they're independent of the answer-policy tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import request from 'supertest';
import express from 'express';

// Account scoping (migration 014): chats are keyed on
// (account_jid, id) and every read filters by account, so a seed row
// must carry the same account the code under test will resolve.
// Derived from the app's own resolver rather than hardcoded, so the
// seed and the query can never disagree.
const { currentAccountId } = await import('../src/whatsapp/account.js');
const TEST_ACCOUNT = currentAccountId() || '';

dotenv.config();

const AUDIT_TMP = path.join(process.cwd(), 'tmp', 'handoff-endpoint-audit');
fs.mkdirSync(AUDIT_TMP, { recursive: true });
process.env.AUDIT_DIR = AUDIT_TMP;

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_CHAT_ID = 'handoff-ep-628555111222@s.whatsapp.net';
const NOW = Math.floor(Date.now() / 1000);
const SEED_SUMMARY = 'Pelanggan menanyakan harga paket landing page';
const SEED_SUMMARY_UPDATED_AT = NOW - 60;

let app;
let getPool;
let audit;

beforeAll(async () => {
  const { mountAiRoutes } = await import('../src/ai/routes/index.js');
  app = express();
  app.use(express.json());
  mountAiRoutes(app);

  if (HAS_DB) {
    const dbMod = await import('../src/db/client.js');
    getPool = dbMod.getPool;
  }
  audit = (await import('../src/ai/audit/log.js')).default;
});

afterAll(async () => {
  try { fs.rmSync(AUDIT_TMP, { recursive: true, force: true }); } catch (_) {}
  if (HAS_DB) {
    const pool = getPool();
    await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [TEST_CHAT_ID]);
    await pool.query(`DELETE FROM chats WHERE id = $1`, [TEST_CHAT_ID]);
  }
});

async function seedChat({ aiMode, summary, summaryUpdatedAt }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode, conversation_summary, summary_updated_at, account_jid)
     VALUES ($1, $1, '+6281236012938', '', $2, 0, $3, $4, $5, $6)
     ON CONFLICT (account_jid, id) DO UPDATE SET ai_mode = EXCLUDED.ai_mode,
                                     conversation_summary = EXCLUDED.conversation_summary,
                                     summary_updated_at = EXCLUDED.summary_updated_at,
                                     last_message_at = EXCLUDED.last_message_at`,
    [TEST_CHAT_ID, NOW, aiMode, summary || '', summaryUpdatedAt || 0, TEST_ACCOUNT],
  );
}

async function seedMessages(rows) {
  const pool = getPool();
  for (const r of rows) {
    await pool.query(
      // account_jid must match, or the endpoint's account-scoped read
      // returns zero messages for a chat that visibly has some.
      `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status, account_jid)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, 'sent', $6)
       ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, timestamp = EXCLUDED.timestamp,
                                      account_jid = EXCLUDED.account_jid`,
      [r.id, TEST_CHAT_ID, r.direction, r.body, r.timestamp, TEST_ACCOUNT],
    );
  }
}

function todayAuditPath() {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(AUDIT_TMP, `${today}.ndjson`);
}

function appendAuditRow(row) {
  const p = todayAuditPath();
  fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8');
}

beforeEach(async () => {
  // Reset audit file for this test day so findLatest can read only this test's rows.
  const p = todayAuditPath();
  if (fs.existsSync(p)) fs.writeFileSync(p, '', 'utf8');
  if (HAS_DB) {
    const pool = getPool();
    await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [TEST_CHAT_ID]);
    await pool.query(`DELETE FROM chats WHERE id = $1`, [TEST_CHAT_ID]);
  }
});

describe('GET /api/crm/ai/handoff', () => {
  it('returns 200 + handoff payload when chat is in human_pending_flag', async () => {
    if (!HAS_DB) {
      throw new Error(
        'DATABASE_URL is not set — this test needs a real Postgres to ' +
        'verify the handoff endpoint behaviour. Set DATABASE_URL in .env ' +
        'and re-run.',
      );
    }

    await seedChat({
      aiMode: 'human_pending_flag',
      summary: SEED_SUMMARY,
      summaryUpdatedAt: SEED_SUMMARY_UPDATED_AT,
    });
    await seedMessages([
      { id: 'h-msg-1', direction: 'in',  body: 'halo kak',                 timestamp: NOW - 30 },
      { id: 'h-msg-2', direction: 'out', body: 'Maaf, belum ada di data kami', timestamp: NOW - 20 },
      { id: 'h-msg-3', direction: 'in',  body: 'berapa harga landing page?',  timestamp: NOW - 10 },
    ]);
    appendAuditRow({
      eventType: 'auto_reply_handoff',
      chatId: TEST_CHAT_ID,
      reason: 'fallback_handoff',
      fallback_used: true,
    });

    const r = await request(app).get(`/api/crm/ai/handoff?chatId=${encodeURIComponent(TEST_CHAT_ID)}`);

    expect(r.status).toBe(200);
    expect(r.body.chatId).toBe(TEST_CHAT_ID);
    expect(r.body.aiMode).toBe('human_pending_flag');
    expect(r.body.conversationSummary).toBe(SEED_SUMMARY);
    expect(typeof r.body.summaryUpdatedAt).toBe('number');
    expect(r.body.summaryUpdatedAt).toBeGreaterThan(0);
    expect(Array.isArray(r.body.lastMessages)).toBe(true);
    expect(r.body.lastMessages.length).toBe(3);
    expect(r.body.lastMessages[0].id).toBe('h-msg-1');
    expect(r.body.lastMessages[2].id).toBe('h-msg-3');
    expect(r.body.flagReason).toBe('fallback_handoff');
    expect(typeof r.body.flagReasonLabel).toBe('string');
    expect(r.body.flagReasonLabel.length).toBeGreaterThan(0);
  });

  it('returns 404 when chat is not in human_pending_flag', async () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set — see the spec for setup.');
    }

    await seedChat({ aiMode: 'ai', summary: '', summaryUpdatedAt: 0 });

    const r = await request(app).get(`/api/crm/ai/handoff?chatId=${encodeURIComponent(TEST_CHAT_ID)}`);

    expect(r.status).toBe(404);
    expect(['NotInHumanPendingFlag', 'ChatNotFound']).toContain(r.body.error);
    expect(r.body.chatId).toBe(TEST_CHAT_ID);
  });

  it('returns 404 when chat does not exist', async () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set — see the spec for setup.');
    }

    const r = await request(app).get(`/api/crm/ai/handoff?chatId=${encodeURIComponent(TEST_CHAT_ID)}`);

    expect(r.status).toBe(404);
    expect(r.body.error).toBe('ChatNotFound');
    expect(r.body.chatId).toBe(TEST_CHAT_ID);
  });

  it('returns 400 when chatId query param is missing', async () => {
    const r = await request(app).get('/api/crm/ai/handoff');

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('ValidationError');
  });
});