'use strict';
/**
 * Zod schema for AiSettings.
 * Source: docs/crm/plans/16-settings-store-composer-hardened.md step 2.
 * Mirror of frontend/src/types/aiSettings.ts.
 */
const { z } = require('zod');

const AiSettingsSchema = z.object({
  identity: z.object({
    name: z.string().min(1).max(80),
    role: z.string().min(1).max(120),
    description: z.string().max(500),
    // NEW (BUG-WARM-PERSONA-1): optional greeting + closing templates.
    // Optional so existing rows without these fields still parse.
    greeting: z.string().max(200).optional(),
    closing: z.string().max(200).optional(),
  }),
  tone: z.enum(['formal', 'casual', 'friendly', 'concise', 'enthusiastic', 'warm-casual-indo']),
  language: z.enum(['id', 'en', 'id-mod']),
  scope: z.object({
    topics: z.array(z.string()),
    excludedTopics: z.array(z.string()),
    // NEW (BUG-WARM-PERSONA-1): optional banned-phrase list (FE-controlled).
    bannedPhrases: z.array(z.string().max(200)).optional(),
  }),
  rules: z.array(z.string()),
  // NEW (BUG-WARM-PERSONA-1): optional style examples (positive/negative).
  styleExamples: z
    .object({
      positive: z.array(z.string().max(300)).optional(),
      negative: z.array(z.string().max(300)).optional(),
    })
    .optional(),
  whatsappAutoReply: z.object({
    enabled: z.boolean(),
    confidenceThreshold: z
      .number()
      .min(0.5)
      .max(0.95)
      .multipleOf(0.05),
  }),
  updatedAt: z.string(),
});

const PartialAiSettingsSchema = AiSettingsSchema.deepPartial();

class SettingsValidationError extends Error {
  constructor(zodError) {
    super('SettingsValidationError');
    this.name = 'SettingsValidationError';
    this.zodError = zodError;
  }
}

module.exports = {
  AiSettingsSchema,
  PartialAiSettingsSchema,
  SettingsValidationError,
};