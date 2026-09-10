'use strict';
/**
 * POST /api/crm/ai/chat — streaming AI chat for the in-app workspace.
 *
 * This is the INTERNAL assistant, and it is a different function from the
 * WhatsApp auto-reply. It used to be the same one wearing a different URL:
 * it borrowed the auto-reply's system prompt (which forbids general
 * reasoning and mandates a locked customer apology), gated on
 * `settings.whatsappAutoReply.confidenceThreshold` — the CUSTOMER-facing
 * setting — and on a low score replaced the answer with that literal
 * Indonesian apology, shown to internal staff. It also saw only knowledge-base
 * vector hits, so questions like "how many invoices over 5 million" or
 * "which chats are waiting on a human" were structurally unanswerable.
 *
 * It now runs the tool agent at INTERNAL scope: read-only access to every
 * entity, record, conversation and message belonging to the connected
 * account, including aggregates. No confidence gate and no customer
 * fallback — when the data is absent it says so.
 *
 * Wire protocol (SSE), unchanged so the FE needs no migration:
 *   event: tool      { name, input, resultCount, why?, error? }
 *   event: chunk     { delta }
 *   event: done      { answer, confidence, grounded, evidence, kind }
 *   event: error     { message }
 */
const { z } = require('zod');
const { attachSse } = require('../../api/stream');
const llm = require('../../ai/llm');
const { runInternalChat } = require('../../ai/chat/internalAgent');
const { SCOPE_INTERNAL } = require('../../ai/tools/dbTools');
const audit = require('../../ai/audit/log');

// Test hook: tests inject a stub so they never reach the real gateway.
let _llmOverride = null;
function setLlmForTesting(override) {
  _llmOverride = override;
}
function getLlm() {
  return _llmOverride || llm;
}

const BodySchema = z.object({
  question: z.string().min(3).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
  topK: z.number().int().min(1).max(10).optional(),
});

// The gateway returns one payload, not a stream, so the answer is chunked
// here. Small deltas keep the FE animation smooth, and the wire shape stays
// stable for a future real stream.
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
    const { question, history = [] } = parsed.data;
    const tenantId = req.tenantId || 'default';
    const sse = attachSse(res, { heartbeatMs: HEARTBEAT_MS });

    // 'close' on the RESPONSE is the disconnect signal; the request's own
    // 'close' fires once the body is read and is not a disconnect.
    let aborted = false;
    res.on('close', () => {
      aborted = true;
    });

    let result;
    try {
      result = await runInternalChat({
        question,
        history,
        llm: getLlm(),
        scope: { mode: SCOPE_INTERNAL },
        isAborted: () => aborted,
        // Emit each tool call as it happens. The FE already renders these as
        // chips through ToolCallCard, so progress is visible mid-answer.
        onTool: (evt) => {
          sse.send('tool', {
            name: evt.name,
            input: evt.input,
            resultCount: evt.resultCount,
            why: evt.why,
            error: evt.error,
          });
        },
      });
    } catch (err) {
      await audit.write('stream_chat_error', { tenantId, error: String(err.message) });
      sse.send('error', { message: 'LlmError', reason: String(err.message) });
      return;
    }
    if (aborted) return sse.end();

    const answer = String(result.answer || '');
    for (const d of chunkString(answer, DELTA_CHARS)) {
      if (aborted) break;
      sse.send('chunk', { delta: d });
    }

    // Evidence is the tool trail rather than citation markers: for an
    // internal answer, what matters is which queries it was built from.
    const evidence = result.toolCalls.map((t) => ({
      kind: 'tool',
      entryId: t.name,
      excerpt: t.why || `${t.name}(${JSON.stringify(t.input).slice(0, 160)})`,
      source: t.name,
      confidence: result.grounded ? 1 : 0,
    }));

    sse.send('done', {
      answer,
      // `grounded` is the useful signal for an internal tool — "did this come
      // from your data?" — where the old self-reported float was being used
      // to suppress answers outright. Kept as `confidence` too so the
      // existing FE contract still parses.
      confidence: result.grounded ? 1 : 0,
      grounded: result.grounded,
      evidence,
      kind: 'answered',
      generatedAt: Date.now(),
    });

    await audit.write('stream_chat_answered', {
      tenantId,
      grounded: result.grounded,
      rounds: result.rounds,
      tools: result.toolCalls.map((t) => t.name),
    });
  } catch (err) {
    if (res.headersSent) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: String(err.message) })}\n\n`);
      } catch (_) {
        /* the socket is already gone */
      }
      try {
        res.end();
      } catch (_) {
        /* ditto */
      }
      return;
    }
    return next(err);
  }
}

module.exports = { streamChatHandler, setLlmForTesting };
