'use strict';
/**
 * AI history routes: GET /api/crm/ai/history, POST /api/crm/ai/history,
 * DELETE /api/crm/ai/history/:id.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
const express = require('express');
const { z } = require('zod');
const { requireTenant } = require('./_middleware');
const store = require('../../ai/history/store');

const router = express.Router();
router.use(requireTenant);

const BodySchema = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
  kind: z.enum(['answered', 'fallback']).optional(),
  evidence: z.array(z.any()).optional(),
});

router.get('/history', async (req, res, next) => {
  try {
    const items = await store.listHistory({ tenantId: req.tenantId });
    res.json({ items });
  } catch (err) { return next(err); }
});

router.post('/history', async (req, res, next) => {
  try {
    const parsed = BodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const entry = await store.addHistory({ tenantId: req.tenantId, ...parsed.data });
    res.status(201).json({ entry });
  } catch (err) { return next(err); }
});

router.delete('/history/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ValidationError', message: 'id must be a number' });
    }
    const ok = await store.deleteHistory({ tenantId: req.tenantId, id });
    if (!ok) return res.status(404).json({ error: 'NotFound' });
    res.json({ ok: true });
  } catch (err) { return next(err); }
});

module.exports = router;
