/**
 * Smoke test: POST /api/crm/ai/chat is mounted and reachable.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md (Task 3)
 *
 * Skipped when DATABASE_URL is not set.
 */
import { describe, it, expect } from 'vitest';
import { mountAiRoutes } from '../src/ai/routes/index.js';
import express from 'express';
import http from 'node:http';

function withServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

describe('POST /api/crm/ai/chat route mount', () => {
  it('responds 200 + text/event-stream when the body is valid', async () => {
    if (!process.env.DATABASE_URL) return;
    // Use createRequire to get the SAME module instance the router uses.
    // ESM `import` of a CJS module returns a namespace wrapper that has
    // its own copy of the setters, so the controller's internal state
    // wouldn't see the test's mutation. require() resolves to the same
    // singleton as the router's `require('../../controllers/ai/streamChat')`.
    const { createRequire } = await import('node:module');
    const requireFromTest = createRequire(import.meta.url);
    const streamChat = requireFromTest('../src/controllers/ai/streamChat.js');
    streamChat.setLlmForTesting({
      createChatCompletion: async () => ({ content: 'hi' }),
      buildUserPrompt: ({ question }) => question,
      parseStructuredOutput: async ({ rawText }) => ({
        parsed: { answer: rawText, confidence: 0.9, citations: [] },
      }),
      RagAnswerSchema: {},
    });
    const app = express();
    app.use(express.json());
    mountAiRoutes(app);
    const { server, port } = await withServer(app);
    try {
      const text = await new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          path: '/api/crm/ai/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const chunks = [];
        req.on('response', (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.write(JSON.stringify({ question: 'hello route' }));
        req.end();
      });
      expect(text).toMatch(/event: done/);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
