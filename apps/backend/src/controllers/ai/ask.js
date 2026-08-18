'use strict';
/**
 * POST /api/crm/ai/ask — team scope, no contact filter.
 * Source: docs/crm/plans/21-rest-endpoints.md + Plan 21 controller ask.js.
 */
const { z } = require('zod');
const { getSettings } = require('../../ai/settings/store');
const { hybridRetrieval } = require('../../ai/retrieval/hybrid');
const { createChatCompletion, buildUserPrompt, parseStructuredOutput } = require('../../ai/llm');
const { BAILEYS_AI_SYSTEM_PROMPT_ID, BAILEYS_AI_SYSTEM_PROMPT_EN } = require('../../ai/llm/base-prompts');
const { buildSystemPrompt } = require('../../ai/settings/composer');
const audit = require('../../ai/audit/log');
const { AI_FALLBACK_MESSAGE_ID } = require('../../i18n/ai-fallback');

const RagAnswerSchema = require('./schemas').RagAnswerSchema;

const BodySchema = z.object({
  question: z.string().min(3).max(500),
  topK: z.number().int().min(1).max(10).optional(),
});

async function handler(req, res, next) {
  try {
    const parsedBody = BodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid body',
        details: parsedBody.error.issues,
      });
    }
    const { question, topK = 5 } = parsedBody.data;
    const tenantId = req.tenantId || 'default';
    const settings = await getSettings();
    const basePrompt = settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
    const systemPrompt = buildSystemPrompt({
      settings,
      tenantName: 'Tenant',
      language: settings.language,
      basePrompt,
    });

    const { chunks, retrievalScore } = await hybridRetrieval({
      query: question,
      scope: 'team',
      chatId: null, // Spec 1: team scope = in-app chat, must opt out of chat filter.
      topK,
    });

    const userPrompt = buildUserPrompt({
      question,
      contextChunks: chunks,
      chatHistory: [],
      contactPhone: undefined,
    });

    let parsed;
    try {
      const r = await createChatCompletion({
        systemPrompt,
        userPrompt,
        jsonSchema: { name: 'rag_answer', schema: { type: 'object', additionalProperties: true } },
      });
      const parsedR = await parseStructuredOutput({
        rawText: r.content,
        schema: RagAnswerSchema,
        llmClient: { createChatCompletion },
        systemPrompt,
        userPrompt,
      });
      parsed = parsedR.parsed;
    } catch (err) {
      await audit.write('auto_reply_hold', { tenantId, reason: 'ask_parse_failure', error: String(err.message) });
      return res.json({
        kind: 'fallback',
        message: AI_FALLBACK_MESSAGE_ID,
        generatedAt: Date.now(),
        question,
      });
    }

    if (parsed.fallback_used || parsed.confidence < (settings.whatsappAutoReply?.confidenceThreshold ?? 0.3)) {
      // eslint-disable-next-line no-console
      console.log(`[ask] LLM returned fallback_used=${parsed.fallback_used} confidence=${parsed.confidence} threshold=${settings.whatsappAutoReply?.confidenceThreshold ?? 0.3}`);
      await audit.write('auto_reply_hold', { tenantId, reason: 'low_confidence_or_fallback', fallback_used: !!parsed.fallback_used, confidence: parsed.confidence });
      return res.json({
        kind: 'fallback',
        message: AI_FALLBACK_MESSAGE_ID,
        generatedAt: Date.now(),
        question,
      });
    }

    const evidence = (parsed.citations || []).map((marker, i) => {
      const c = chunks[marker - 1] || chunks[i];
      return {
        kind: 'kb',
        entryId: c && c.chunk && c.chunk.id,
        excerpt: c && c.chunk && c.chunk.text ? c.chunk.text.slice(0, 300) : '',
        source: (c && c.chunk && c.chunk.metadata && c.chunk.metadata.file) || 'kb',
        confidence: parsed.confidence,
      };
    });

    await audit.write('endpoint_hit', { tenantId, method: 'POST', path: '/api/crm/ai/ask', status: 200 });
    return res.json({
      kind: 'answered',
      answer: parsed.answer,
      confidence: parsed.confidence,
      evidence,
      generatedAt: Date.now(),
      question,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handler };