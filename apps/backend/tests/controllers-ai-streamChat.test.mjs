/**
 * streamChat controller integration tests.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * These tests stub the LLM gateway so we don't hit a real provider.
 * Skipped when DATABASE_URL is not set (the controller hits the DB).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';

const HAS_DB = !!process.env.DATABASE_URL;

async function startServer() {
  // Use createRequire so we patch the SAME module instance the route uses.
  const { createRequire } = await import('node:module');
  const requireFromTest = createRequire(import.meta.url);
  const streamChat = requireFromTest('../src/controllers/ai/streamChat.js');
  streamChat.setLlmForTesting({
    createChatCompletion: async () => ({ content: 'Hello world. This is a streamed answer.' }),
    buildUserPrompt: ({ question }) => question,
    parseStructuredOutput: async ({ rawText }) => ({
      parsed: { answer: rawText, confidence: 0.85, citations: [] },
    }),
    RagAnswerSchema: {},
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
    const text = await postStream(port, { question: 'What is the return policy?' });
    expect(text).toMatch(/event: chunk\n/);
    expect(text).toMatch(/event: done\n/);
    // The done payload should include the assembled answer + confidence.
    const doneLine = text.split('\n').find((l) => l.startsWith('data:') && l.includes('"answer"'));
    expect(doneLine).toBeTruthy();
    const done = JSON.parse(doneLine.replace(/^data: /, ''));
    expect(done.answer).toMatch(/Hello world/);
    expect(done.confidence).toBe(0.85);
  });

  it('rejects empty body with a 400 error event', async () => {
    const text = await postStream(port, { question: '' });
    expect(text).toMatch(/event: error\n/);
    expect(text).toMatch(/ValidationError/);
  });
});
