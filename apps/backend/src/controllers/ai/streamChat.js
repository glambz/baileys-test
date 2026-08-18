'use strict';
/**
 * POST /api/ai/chat — streaming AI chat endpoint for the in-app workspace.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * Wire protocol (SSE):
 *   event: tool      { name, input, resultCount }
 *   event: chunk     { delta }
 *   event: done      { answer, confidence, evidence }
 *   event: error     { message }
 *
 * The existing LLM gateway returns a single { content } payload, not a
 * stream. We simulate streaming by chunking the final answer into
 * delta-sized pieces. This keeps the wire shape stable so the FE can
 * be upgraded to a real stream (Vercel AI SDK 5) later without changes.
 */
const { z } = require('zod');
const { attachSse } = require('../../api/stream');
const { getSettings } = require('../../ai/settings/store');
const { hybridRetrieval } = require('../../ai/retrieval/hybrid');
const llm = require('../../ai/llm');
const {
  BAILEYS_AI_SYSTEM_PROMPT_ID,
  BAILEYS_AI_SYSTEM_PROMPT_EN,
} = require('../../ai/llm/base-prompts');
const { buildSystemPrompt } = require('../../ai/settings/composer');
const audit = require('../../ai/audit/log');
const { AI_FALLBACK_MESSAGE_ID } = require('../../i18n/ai-fallback');

// Test hook: tests inject a stub via this setter to avoid hitting the
// real LLM gateway. Production code never calls this.
let _llmOverride = null;
function setLlmForTesting(override) {
  _llmOverride = override;
}
function getLlm() {
  return _llmOverride || llm;
}

const BodySchema = z.object({
  question: z.string().min(3).max(500),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).optional(),
  topK: z.number().int().min(1).max(10).optional(),
});

// Simulated-stream chunk size. Real byte streams can be 1-N chars;
// we keep small deltas so the FE sees a smooth animation.
const DELTA_CHARS = 4;
const HEARTBEAT_MS = 15_000;

function chunkString(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) {
    out.push(s.slice(i, i + size));
  }
  return out;
}

async function streamChatHandler(req, res, next) {
  try {
    const parsed = BodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      const sse = attachSse(res, { heartbeatMs: HEARTBEAT_MS });
      sse.send('error', { message: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const { question, history = [], topK = 5 } = parsed.data;
    const tenantId = req.tenantId || 'default';
    const sse = attachSse(res, { heartbeatMs: HEARTBEAT_MS });

    // If the client disconnects mid-stream, abort the LLM call.
    let aborted = false;
    // res.on('close') is the right event: the EXPRESS response writes have
    // started, and 'close' fires when the underlying socket ends. The
    // request's 'close' event fires earlier (when the request body is
    // fully read) and is not actually a disconnect signal.
    res.on('close', () => {
      aborted = true;
    });

    const settings = await getSettings();
    const basePrompt = settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
    const systemPrompt = buildSystemPrompt({
      settings,
      tenantName: 'Tenant',
      language: settings.language,
      basePrompt,
    });

    // Tool event: retrieval. We call team-scope retrieval (in-app chat sees
    // everything). Emit a tool event the FE can render as a chip.
    const { chunks, retrievalScore } = await hybridRetrieval({
      query: question,
      scope: 'team',
      chatId: null, // Spec 1: team scope = opt out of chat filter.
      topK,
    });
    if (aborted) return sse.end();
    sse.send('tool', {
      name: 'hybridRetrieval',
      input: { query: question, scope: 'team', topK },
      resultCount: chunks.length,
      retrievalScore,
    });

    const userPrompt = getLlm().buildUserPrompt({
      question,
      contextChunks: chunks,
      chatHistory: history,
      contactPhone: undefined,
    });

    let parsedResult;
    try {
      const activeLlm = getLlm();
      const r = await activeLlm.createChatCompletion({
        systemPrompt,
        userPrompt,
        jsonSchema: { name: 'rag_answer', schema: { type: 'object', additionalProperties: true } },
      });
      const parsedR = await activeLlm.parseStructuredOutput({
        rawText: r.content,
        schema: activeLlm.RagAnswerSchema,
        llmClient: { createChatCompletion: activeLlm.createChatCompletion },
        systemPrompt,
        userPrompt,
      });
      parsedResult = parsedR.parsed;
    } catch (err) {
      await audit.write('stream_chat_error', { tenantId, error: String(err.message) });
      sse.send('error', { message: 'LlmError', reason: String(err.message) });
      return;
    }
    if (aborted) return sse.end();

    // Below the confidence threshold -> emit a fallback answer (no chunks).
    const confThresh = settings.whatsappAutoReply?.confidenceThreshold ?? 0.3;
    if (parsedResult.fallback_used || parsedResult.confidence < confThresh) {
      sse.send('tool', { name: 'fallback', input: { reason: 'low_confidence' }, resultCount: 0 });
      sse.send('done', {
        answer: AI_FALLBACK_MESSAGE_ID,
        confidence: parsedResult.confidence,
        evidence: [],
        kind: 'fallback',
        generatedAt: Date.now(),
      });
      await audit.write('stream_chat_fallback', { tenantId, confidence: parsedResult.confidence });
      return;
    }

    // Stream the assembled answer as delta chunks.
    const answer = String(parsedResult.answer || '');
    const deltas = chunkString(answer, DELTA_CHARS);
    for (const d of deltas) {
      if (aborted) break;
      sse.send('chunk', { delta: d });
    }

    const evidence = (parsedResult.citations || []).map((marker, i) => {
      const c = chunks[marker - 1] || chunks[i];
      return {
        kind: 'kb',
        entryId: c && c.chunk && c.chunk.id,
        excerpt: c && c.chunk && c.chunk.text ? c.chunk.text.slice(0, 300) : '',
        source: (c && c.chunk && c.chunk.metadata && c.chunk.metadata.file) || 'kb',
        confidence: parsedResult.confidence,
      };
    });

    sse.send('done', {
      answer,
      confidence: parsedResult.confidence,
      evidence,
      kind: 'answered',
      generatedAt: Date.now(),
    });
    await audit.write('stream_chat_sent', { tenantId, confidence: parsedResult.confidence, retrievalScore });
  } catch (err) {
    if (res.headersSent) {
      try { res.write(`event: error\ndata: ${JSON.stringify({ message: String(err.message) })}\n\n`); } catch (_) {}
      try { res.end(); } catch (_) {}
      return;
    }
    return next(err);
  }
}

module.exports = { streamChatHandler, setLlmForTesting };
