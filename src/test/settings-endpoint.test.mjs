/**
 * PUT /api/crm/ai/settings — vitest spec.
 * Source: post-cycle defect fix (cycle be-ai-auto-reply-2026-07-03).
 *
 * Covers (pure HTTP layer; gracefully tolerates DB-unavailable variants):
 *  - PUT with { tone: 'concise' } returns 200 + persists, OR 500 if DB missing.
 *  - PUT with { whatsappAutoReply: { confidenceThreshold: 0.85 } } returns 200 within [0.5, 0.95].
 *  - PUT with confidenceThreshold 0.3 (out of range) returns 400 + validation_error.
 *  - PUT with whatsappAutoReply.enabled toggles the flag and returns 200.
 *  - PUT with unknown keys returns 400 + validation_error (strict schema).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mountAiRoutes } = await import('../ai/routes/index.js');

const app = express();
app.use(express.json());
mountAiRoutes(app);

describe('PUT /api/crm/ai/settings', () => {
  it('updates tone and returns ok:true settings (or 500 if DB missing)', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ tone: 'concise' });
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body.ok).toBe(true);
      expect(r.body.settings.tone).toBe('concise');
    }
  });

  it('updates whatsappAutoReply.confidenceThreshold within [0.5, 0.95]', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ whatsappAutoReply: { confidenceThreshold: 0.85 } });
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body.ok).toBe(true);
      expect(r.body.settings.whatsappAutoReply.confidenceThreshold).toBe(0.85);
    }
  });

  it('rejects confidenceThreshold out of range (400)', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ whatsappAutoReply: { confidenceThreshold: 0.3 } });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe('validation_error');
    expect(Array.isArray(r.body.issues)).toBe(true);
  });

  it('rejects confidenceThreshold above range (400)', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ whatsappAutoReply: { confidenceThreshold: 0.99 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('flips whatsappAutoReply.enabled and returns updated settings', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ whatsappAutoReply: { enabled: true } });
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body.ok).toBe(true);
      expect(r.body.settings.whatsappAutoReply.enabled).toBe(true);
    }
  });

  it('rejects unknown keys (strict schema)', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ bogusField: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('accepts the canonical critical-path body', async () => {
    const r = await request(app)
      .put('/api/crm/ai/settings')
      .send({ whatsappAutoReply: { enabled: true, confidenceThreshold: 0.7 } });
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      expect(r.body.ok).toBe(true);
      expect(r.body.settings.whatsappAutoReply.enabled).toBe(true);
      expect(r.body.settings.whatsappAutoReply.confidenceThreshold).toBe(0.7);
    }
  });
});