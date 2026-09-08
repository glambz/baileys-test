/**
 * streamChat controller integration tests.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * These tests stub the LLM gateway so we don't hit a real provider.
 * Skipped when DATABASE_URL is not set (the controller hits the DB).
 *
 * 2026-09-08: the internal assistant is no longer the auto-reply wearing a
 * different URL. It runs the read-only tool agent at internal scope, so
 * `confidence` on the done event is now derived from whether the answer came
 * out of the database (grounded), not from a float the model reports about
 * itself — that float was being used to suppress internal answers and to
 * substitute a customer-facing apology for staff.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';

const HAS_DB = !!process.env.DATABASE_URL;

// Successive gateway replies for the next request, shifted one per round.
// The agent loop is multi-turn, so a single canned answer cannot exercise it.
let script = [];
function setScript(replies) {
  script = replies.slice();
}

async function startServer() {
  // Use createRequire so we patch the SAME module instance the route uses.
  const { createRequire } = await import('node:module');
  const requireFromTest = createRequire(import.meta.url);
  const streamChat = requireFromTest('../src/controllers/ai/streamChat.js');
  streamChat.setLlmForTesting({
    createChatCompletion: async () => ({
      content: script.length ? script.shift() : 'Hello world. This is a streamed answer.',
    }),
  });
  const app = express();
  app.use(express.json());
  app.post('/api/ai/chat', streamChat.streamChatHandler);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function postStream(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/ai/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const chunks = [];
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function doneEvent(text) {
  const line = text.split('\n').find((l) => l.startsWith('data:') && l.includes('"answer"'));
  return line ? JSON.parse(line.replace(/^data: /, '')) : null;
}

describe('POST /api/ai/chat (stream)', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }

  let server;
  let port;

  beforeAll(async () => {
    ({ server, port } = await startServer());
  });
  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('returns text/event-stream with at least one chunk event and a final done', async () => {
    setScript([]);
    const text = await postStream(port, { question: 'What is the return policy?' });
    expect(text).toMatch(/event: chunk\n/);
    expect(text).toMatch(/event: done\n/);
    const done = doneEvent(text);
    expect(done).toBeTruthy();
    expect(done.answer).toMatch(/Hello world/);
    // Unparseable prose, no tool call: the answer still streams (an operator
    // would rather see rough output than an error) but it is NOT grounded.
    expect(done.grounded).toBe(false);
    expect(done.confidence).toBe(0);
  });

  it('runs the tool loop and reports the answer as grounded', async () => {
    setScript([
      JSON.stringify({ action: 'tool', tool: 'list_entities', args: {}, why: 'need the entity list' }),
      JSON.stringify({ action: 'answer', answer: 'There are entities defined.', sources: ['list_entities'], grounded: true }),
    ]);
    const text = await postStream(port, { question: 'Which entities exist in the CRM?' });
    // The tool call is surfaced mid-answer so the FE can render it.
    expect(text).toMatch(/event: tool\n/);
    expect(text).toMatch(/list_entities/);
    const done = doneEvent(text);
    expect(done.answer).toMatch(/entities defined/);
    expect(done.grounded).toBe(true);
    expect(done.confidence).toBe(1);
    // Evidence is the tool trail, not KB citation markers.
    expect(done.evidence.some((e) => e.kind === 'tool' && e.source === 'list_entities')).toBe(true);
  });

  it('does not report grounded when the model claims it without calling a tool', async () => {
    setScript([
      JSON.stringify({ action: 'answer', answer: 'Trust me, 42 invoices.', sources: [], grounded: true }),
    ]);
    const text = await postStream(port, { question: 'How many invoices are there?' });
    const done = doneEvent(text);
    expect(done.answer).toMatch(/42 invoices/);
    // The model's own `grounded` flag is never trusted on its own.
    expect(done.grounded).toBe(false);
  });

  it('rejects empty body with a 400 error event', async () => {
    const text = await postStream(port, { question: '' });
    expect(text).toMatch(/event: error\n/);
    expect(text).toMatch(/ValidationError/);
  });
});
