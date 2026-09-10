'use strict';
/**
 * POST /api/crm/ai/reply-preview — preview without sending.
 */
const { z } = require('zod');
const { getSettings } = require('../../ai/settings/store');
const { hybridRetrieval } = require('../../ai/retrieval/hybrid');
const { createChatCompletion, buildUserPrompt, parseStructuredOutput } = require('../../ai/llm');
const { BAILEYS_AI_SYSTEM_PROMPT_ID, BAILEYS_AI_SYSTEM_PROMPT_EN } = require('../../ai/llm/base-prompts');
const { buildSystemPrompt } = require('../../ai/settings/composer');
const { loadChatContactId, loadChatMode } = require('../../ai/whatsapp/handoff');
const { RagAnswerSchema } = require('./schemas');

const BodySchema = z.object({
  chatId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

async function handler(req, res, next) {
  try {
    const parsedBody = BodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid body', details: parsedBody.error.issues });
    }
    const { chatId, body } = parsedBody.data;

    let mode;
    try {
      mode = await loadChatMode(chatId);
    } catch (err) {
      return res.status(404).json({ error: 'ChatNotFound', chatId });
    }
    if (mode === 'human') {
      return res.json({ kind: 'preview_blocked', reason: 'chat_in_human_mode' });
    }

    const contactPhone = await loadChatContactId(chatId).catch(() => null);
    const settings = await getSettings();
    const basePrompt = settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
    const systemPrompt = buildSystemPrompt({
      settings,
      tenantName: 'Tenant',
      language: settings.language,
      basePrompt,
    });

    const { chunks, retrievalScore } = await hybridRetrieval({
      query: body,
      scope: 'whatsapp',
      chatId,
      contactPhone,
    });

    const userPrompt = buildUserPrompt({ question: body, contextChunks: chunks, chatHistory: [], contactPhone });
    let r;
    try {
      r = await createChatCompletion({ systemPrompt, userPrompt });
    } catch (err) {
      return res.status(503).json({ error: 'LlmError', message: err.message });
    }
    let parsed;
    try {
      parsed = (await parseStructuredOutput({
        rawText: r.content,
        schema: RagAnswerSchema,
        llmClient: { createChatCompletion },
        systemPrompt,
        userPrompt,
      })).parsed;
    } catch (err) {
      return res.json({ would_send: false, reason: 'parse_failure' });
    }
    const would_send = parsed.confidence >= settings.whatsappAutoReply.confidenceThreshold && !parsed.fallback_used;
    return res.json({
      would_send,
      answer: parsed.answer,
      confidence: parsed.confidence,
      retrievalScore,
      evidence: (parsed.citations || []).map((m, i) => {
        const c = chunks[m - 1] || chunks[i];
        return {
          kind: 'kb',
          entryId: c && c.chunk && c.chunk.id,
          excerpt: c && c.chunk && c.chunk.text ? c.chunk.text.slice(0, 300) : '',
          source: (c && c.chunk && c.chunk.metadata && c.chunk.metadata.file) || 'kb',
          confidence: parsed.confidence,
        };
      }),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handler };