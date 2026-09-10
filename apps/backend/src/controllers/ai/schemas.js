'use strict';
const { z } = require('zod');

const RagAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.number().int().nonnegative()),
  confidence: z.number().min(0).max(1),
  fallback_used: z.boolean(),
});

module.exports = { RagAnswerSchema };