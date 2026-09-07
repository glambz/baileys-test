/**
 * REST /api/chats, /api/chats/:id/messages, POST /api/chats/:id/messages
 * Cycle: be-fe-integration-2026-07-16
 * Plan:  docs/maintenance/fe-be-integration-2026-07-16/plan.md §1-2
 *
 * Mirrors src/mock/handler.ts lines 51-115 — the FE has been calling these
 * endpoints and they don't exist on the BE yet. This spec seeds one chat
 * row + verifies the four-shape contract (chat list, chat detail, send).
 *
 * Requires DATABASE_URL (skipped gracefully otherwise).
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

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_CHAT_ID = '6281236012939@s.whatsapp.net';
const NOW = Math.floor(Date.now() / 1000);

let app;
let getPool;
let buildApp;

beforeAll(async () => {
  buildApp = (await import('../src/index.js')).buildApp;
  app = buildApp();

  if (HAS_DB) {
    const dbMod = await import('../src/db/client.js');
    getPool = dbMod.getPool;
  }
});

afterAll(async () => {
  if (HAS_DB) {
    try {
      const pool = getPool();
      await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [TEST_CHAT_ID]);
      await pool.query(`DELETE FROM chats WHERE id = $1`, [TEST_CHAT_ID]);
    } catch (_) {}
  }
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const pool = getPool();
  await pool.query(`DELETE FROM messages WHERE chat_id = $1`, [TEST_CHAT_ID]);
  await pool.query(`DELETE FROM chats WHERE id = $1`, [TEST_CHAT_ID]);
});

describe('GET /api/chats', () => {
  it('returns 200 + chats array with the FE camelCase shape', async () => {
    if (!HAS_DB) {
      throw new Error(
        'DATABASE_URL is not set — this test needs a real Postgres to verify the BE wire-up',
      );
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode, account_jid)
       VALUES ($1, $1, '+6281236012938', '', $2, 0, 'ai', $3)
       ON CONFLICT (account_jid, id) DO UPDATE SET ai_mode = EXCLUDED.ai_mode,
                                       last_message_at = EXCLUDED.last_message_at`,
      [TEST_CHAT_ID, NOW, TEST_ACCOUNT],
    );

    const r = await request(app).get('/api/chats');

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.chats)).toBe(true);
    expect(r.body.chats.length).toBeGreaterThanOrEqual(1);
    const found = r.body.chats.find((c) => c.id === TEST_CHAT_ID);
    expect(found).toBeTruthy();
    expect(found.jid).toBe(TEST_CHAT_ID);
    expect(found.phone).toBe('+6281236012938');
    expect(found.lastMessagePreview).toBe('');
    expect(typeof found.lastMessageAt).toBe('number');
    expect(Math.abs(found.lastMessageAt - NOW)).toBeLessThanOrEqual(5);
    expect(found.unreadCount).toBe(0);
  });
});

describe('GET /api/chats/:id/messages', () => {
  it('returns 200 + messages array (empty when no rows)', async () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode, account_jid)
       VALUES ($1, $1, '+6281236012938', '', $2, 0, 'ai', $3)`,
      [TEST_CHAT_ID, NOW, TEST_ACCOUNT],
    );

    const r = await request(app).get(
      `/api/chats/${encodeURIComponent(TEST_CHAT_ID)}/messages`,
    );

    expect(r.status).toBe(200);
    expect(r.body.chatId).toBe(TEST_CHAT_ID);
    expect(Array.isArray(r.body.messages)).toBe(true);
  });
});

describe('POST /api/chats/:id/messages', () => {
  it('returns 200 + inserts a row when body is a non-empty string', async () => {
    if (!HAS_DB) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode, account_jid)
       VALUES ($1, $1, '+6281236012938', '', $2, 0, 'ai', $3)`,
      [TEST_CHAT_ID, NOW, TEST_ACCOUNT],
    );

    const r = await request(app)
      .post(`/api/chats/${encodeURIComponent(TEST_CHAT_ID)}/messages`)
      .send({ body: 'test' });

    expect(r.status).toBe(200);
    expect(r.body.message).toBeTruthy();
    expect(r.body.message.body).toBe('test');
    expect(r.body.message.chatId).toBe(TEST_CHAT_ID);
    expect(r.body.message.direction).toBe('out');
    expect(r.body.message.isFallback).toBe(false);

    const inserted = await pool.query(
      `SELECT body FROM messages WHERE id = $1`,
      [r.body.message.id],
    );
    expect(inserted.rows.length).toBe(1);
    expect(inserted.rows[0].body).toBe('test');
  });
});
