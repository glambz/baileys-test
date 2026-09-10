/**
 * AI history CRUD integration tests.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md (Task 5)
 *
 * Skipped when DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { mountAiRoutes } from '../src/ai/routes/index.js';
import { getPool } from '../src/db/client.js';

const HAS_DB = !!process.env.DATABASE_URL;

async function withServer() {
  const app = express();
  app.use(express.json());
  mountAiRoutes(app);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    });
    const chunks = [];
    r.on('response', (res) => {
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { json = text; }
        resolve({ status: res.statusCode, body: json });
      });
      res.on('error', reject);
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

describe('AI history routes', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }

  let server;
  let port;

  beforeAll(async () => {
    ({ server, port } = await withServer());
    // Clean before — delete any leftover from other tests.
    const pool = getPool();
    await pool.query("DELETE FROM ai_chat_history WHERE question LIKE 'history-test:%'");
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM ai_chat_history WHERE question LIKE 'history-test:%'");
    if (server) await new Promise((r) => server.close(r));
  });

  it('POST /api/crm/ai/history persists an entry', async () => {
    const res = await req(port, 'POST', '/api/crm/ai/history', {
      question: 'history-test: q1',
      answer: 'a1',
      confidence: 0.9,
      kind: 'answered',
      evidence: [{ kind: 'kb', entryId: 'e1' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.id).toBeGreaterThan(0);
    expect(res.body.entry.confidence).toBe(0.9);
    expect(res.body.entry.question).toBe('history-test: q1');
  });

  it('GET /api/crm/ai/history returns the newest entries first', async () => {
    await req(port, 'POST', '/api/crm/ai/history', {
      question: 'history-test: q2',
      answer: 'a2',
      confidence: 0.7,
    });
    const res = await req(port, 'GET', '/api/crm/ai/history');
    expect(res.status).toBe(200);
    const mine = res.body.items.filter((i) => i.question.startsWith('history-test:'));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    // Newest first.
    expect(mine[0].question).toBe('history-test: q2');
  });

  it('DELETE /api/crm/ai/history/:id removes the entry', async () => {
    const created = await req(port, 'POST', '/api/crm/ai/history', {
      question: 'history-test: q3',
      answer: 'a3',
      confidence: 0.6,
    });
    const id = created.body.entry.id;
    const del = await req(port, 'DELETE', `/api/crm/ai/history/${id}`);
    expect(del.status).toBe(200);
    const list = await req(port, 'GET', '/api/crm/ai/history');
    const ids = list.body.items.map((i) => i.id);
    expect(ids).not.toContain(id);
  });

  it('POST /api/crm/ai/history rejects invalid body', async () => {
    const res = await req(port, 'POST', '/api/crm/ai/history', { question: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});
