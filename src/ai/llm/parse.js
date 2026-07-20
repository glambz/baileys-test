'use strict';
/**
 * Structured output parser + reject-and-retry.
 * Source: docs/crm/plans/17-llm-gateway.md step 4.
 */
const { z } = require('zod');

class LlmParseError extends Error {
  constructor(message, zodError, attempts) {
    super(message);
    this.name = 'LlmParseError';
    this.zodError = zodError;
    this.attempts = attempts;
  }
}

const RagAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.number().int().nonnegative()),
  confidence: z.number().min(0).max(1),
  fallback_used: z.boolean(),
});

const WhatsAppAutoReplyDecisionSchema = z.object({
  answer: z.string(),
  citations: z.array(z.number().int().nonnegative()),
  confidence: z.number().min(0).max(1),
  fallback_used: z.boolean(),
  reasoning: z.string().optional(),
});

async function tryParse(rawText, schema) {
  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    return { ok: false, error: 'invalid_json', issues: [e.message] };
  }
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, parsed: r.data };
  return {
    ok: false,
    error: 'schema_mismatch',
    issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * @param {object} args
 * @param {string} args.rawText
 * @param {import('zod').ZodTypeAny} args.schema
 * @param {object} args.llmClient - { createChatCompletion }
 * @param {string} args.systemPrompt
 * @param {string} args.userPrompt
 * @param {number} [args.maxAttempts=3]
 */
async function parseStructuredOutput(args) {
  const maxAttempts = args.maxAttempts || 3;
  const schema = args.schema;
  const llmClient = args.llmClient;
  const systemPrompt = args.systemPrompt;
  let userPrompt = args.userPrompt;

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let rawText = args.rawText;
    if (attempt > 1) {
      const r = await llmClient.createChatCompletion({ systemPrompt, userPrompt });
      rawText = r.content;
    }
    const result = await tryParse(rawText, schema);
    if (result.ok) {
      return { parsed: result.parsed, attempts: attempt };
    }
    lastErr = result;
    userPrompt =
      `${args.userPrompt}\n\nYour previous response did not match the required schema. Errors: ${result.issues.join('; ')}. Please respond again with a valid JSON object.`;
  }
  throw new LlmParseError(
    `Failed to parse structured output after ${maxAttempts} attempts`,
    lastErr,
    maxAttempts
  );
}

module.exports = {
  parseStructuredOutput,
  LlmParseError,
  RagAnswerSchema,
  WhatsAppAutoReplyDecisionSchema,
};