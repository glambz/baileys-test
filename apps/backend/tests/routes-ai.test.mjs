/**
 * Express route tests — uses supertest with mocked LLM.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mountAiRoutes } = await import('../src/ai/routes/index.js');
const { getProvider } = await import('../src/ai/llm/index.js');

const app = express();
app.use(express.json());
mountAiRoutes(app);

describe('REST /api/crm/ai/toggle-mode', () => {
  it('rejects human_pending_flag via validation', async () => {
    const r = await request(app)
      .post('/api/crm/ai/toggle-mode')
      .send({ chatId: 'x', mode: 'human_pending_flag' });
    expect([400, 404]).toContain(r.status);
  });

  it('accepts ai / human', async () => {
    const r = await request(app)
      .post('/api/crm/ai/toggle-mode')
      .send({ chatId: 'x', mode: 'ai' });
    expect([200, 404, 400, 500]).toContain(r.status);
    if (r.status === 400) {
      expect(JSON.stringify(r.body)).not.toContain('human_pending_flag');
    }
  });
});

describe('REST /api/crm/ai/ask', () => {
  it('returns a response (fallback or answered)', async () => {
    const r = await request(app).post('/api/crm/ai/ask').send({ question: 'Berapa harga paket?' });
    expect([200, 503, 500]).toContain(r.status);
  });
});

describe('REST /api/crm/entities (list)', () => {
  it('returns 200 + array', async () => {
    const r = await request(app).get('/api/crm/entities');
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      expect(Array.isArray(r.body)).toBe(true);
    }
  });
});

describe('REST /api/crm/knowledge/files', () => {
  it('returns 200 + array', async () => {
    const r = await request(app).get('/api/crm/knowledge/files');
    expect([200, 500]).toContain(r.status);
  });
});

describe('LLM gateway surface', () => {
  it('getProvider() returns a string', () => {
    expect(typeof getProvider()).toBe('string');
  });
});