'use strict';
/**
 * POST /api/crm/ai/ask — the internal knowledge assistant, non-streaming.
 *
 * Same function as POST /api/crm/ai/chat, without SSE: it is for internal
 * staff, and it is NOT the WhatsApp auto-reply. It used to be exactly that,
 * though — it borrowed the customer persona prompt (answer only from the
 * CONTEXT block, cite [n], otherwise emit the locked Indonesian apology),
 * gated on `settings.whatsappAutoReply.confidenceThreshold` (the
 * CUSTOMER-facing setting), and on a low score returned that apology to
 * staff. It also saw only knowledge-base vector hits, so "how many invoices
 * over 5 million" was structurally unanswerable.
 *
 * It now runs the read-only tool agent at internal scope: every entity,
 * record, conversation and message of the connected account, aggregates
 * included. No confidence gate, no customer fallback — when the data is
 * absent it says so.
 *
 * Response shape is unchanged so the FE needs no migration.
 */
const { z } = require('zod');
const llm = require('../../ai/llm');
const { runInternalChat } = require('../../ai/chat/internalAgent');
const { SCOPE_INTERNAL } = require('../../ai/tools/dbTools');
const audit = require('../../ai/audit/log');

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
    const { question } = parsedBody.data;
    const tenantId = req.tenantId || 'default';

    let result;
    try {
      result = await runInternalChat({
        question,
        llm,
        scope: { mode: SCOPE_INTERNAL },
      });
    } catch (err) {
      await audit.write('ask_error', { tenantId, error: String(err.message) });
      return res.status(502).json({
        error: 'LlmError',
        message: 'The assistant could not be reached.',
        question,
      });
    }

    // Evidence is the tool trail rather than KB citation markers: for an
    // internal answer, which queries it was built from is the useful record.
    const evidence = result.toolCalls.map((t) => ({
      kind: 'tool',
      entryId: t.name,
      excerpt: t.why || `${t.name}(${JSON.stringify(t.input).slice(0, 160)})`,
      source: t.name,
      confidence: result.grounded ? 1 : 0,
    }));

    await audit.write('endpoint_hit', {
      tenantId,
      method: 'POST',
      path: '/api/crm/ai/ask',
      status: 200,
      grounded: result.grounded,
      rounds: result.rounds,
      tools: result.toolCalls.map((t) => t.name),
    });
    return res.json({
      kind: 'answered',
      answer: result.answer,
      // "Did this come from your data?" is the signal that matters here. The
      // old self-reported float was being used to suppress answers outright.
      confidence: result.grounded ? 1 : 0,
      grounded: result.grounded,
      evidence,
      generatedAt: Date.now(),
      question,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handler };
