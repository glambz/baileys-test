'use strict';
/**
 * PUT /api/crm/ai/settings — update the global `ai_settings` row.
 * Source: post-cycle defect fix (cycle be-ai-auto-reply-2026-07-03).
 *
 * The existing toggle-mode endpoint is per-CHAT. This endpoint is for the
 * GLOBAL settings: `whatsappAutoReply.enabled`, `whatsappAutoReply.confidenceThreshold`,
 * `tone`, `language`, `identity`, `scope`, `rules`. Operator-facing.
 *
 * Body: Partial<AiSettings> (any subset of the locked fields). All fields
 * optional; only provided fields are updated. Validation is delegated to
 * `updateSettings()` (which runs the full AiSettingsSchema after merge).
 */
const express = require('express');
const { z } = require('zod');
const { getSettings, updateSettings } = require('../settings/store');
const audit = require('../audit/log');

const router = express.Router();

// zod schema for the partial body. Every field optional. We accept any subset
// and let the store's full schema validate the merged result.
const UpdateSchema = z
  .object({
    identity: z
      .object({
        name: z.string().min(2).optional(),
        role: z.string().min(2).optional(),
        description: z.string().optional(),
      })
      .optional(),
    tone: z.enum(['formal', 'casual', 'friendly', 'concise', 'enthusiastic']).optional(),
    language: z.enum(['id', 'en', 'id-mod']).optional(),
    scope: z
      .object({
        topics: z.array(z.string()).optional(),
        excludedTopics: z.array(z.string()).optional(),
      })
      .optional(),
    rules: z.array(z.string()).optional(),
    whatsappAutoReply: z
      .object({
        enabled: z.boolean().optional(),
        confidenceThreshold: z.number().min(0.5).max(0.95).optional(),
      })
      .optional(),
  })
  .strict();

router.put(
  '/settings',
  express.json({ limit: '256kb' }),
  async (req, res, next) => {
    try {
      const body = UpdateSchema.parse(req.body);
      const before = await getSettings();
      const after = await updateSettings(body);
      await audit.write('ai_settings_updated', {
        changedKeys: Object.keys(body),
        enabledBefore: before.whatsappAutoReply.enabled,
        enabledAfter: after.whatsappAutoReply.enabled,
        thresholdBefore: before.whatsappAutoReply.confidenceThreshold,
        thresholdAfter: after.whatsappAutoReply.confidenceThreshold,
      });
      res.json({ ok: true, settings: after });
    } catch (err) {
      if (err && err.name === 'ZodError') {
        return res
          .status(400)
          .json({ ok: false, error: 'validation_error', issues: err.issues });
      }
      if (err && err.name === 'SettingsValidationError') {
        return res
          .status(400)
          .json({ ok: false, error: 'validation_error', issues: err.issues || String(err.message) });
      }
      next(err);
    }
  }
);

module.exports = router;