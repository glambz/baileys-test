'use strict';
/**
 * WhatsApp inbound message trigger.
 * Source: docs/crm/plans/20-whatsapp-trigger-state-machine.md step 3.
 */
const { getSettings } = require('../settings/store');
const { hybridRetrieval, TAU_TURBO } = require('../retrieval/hybrid');
const {
  loadChatMode,
  transitionChatMode,
  upsertChatOnInbound,
  ForbiddenTransitionError,
} = require('./handoff');
const { sendReply } = require('./send');
const {
  createChatCompletion,
  buildUserPrompt,
  parseStructuredOutput,
  WhatsAppAutoReplyDecisionSchema,
} = require('../llm');
const {
  BAILEYS_AI_SYSTEM_PROMPT_ID,
  BAILEYS_AI_SYSTEM_PROMPT_EN,
} = require('../llm/base-prompts');
const audit = require('../audit/log');
const inbox = require('../../inbox/writer');
const episodic = require('../store/episodic');
const summaryStore = require('../settings/summary');
const { startTyping } = require('../../whatsapp/typing');

const EPISODIC_TOPK = Number(process.env.EPISODIC_TOPK || 10);

function derivePhone(msg) {
  if (!msg) return null;
  if (msg.senderPn) return String(msg.senderPn).split('@')[0];
  if (msg.key && msg.key.senderPn) return String(msg.key.senderPn).split('@')[0];
  if (msg.key && msg.key.remoteJid) return String(msg.key.remoteJid).split('@')[0];
  return null;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function extractNumbers(text) {
  // Strip citation markers ([1], [2], …) and currency formatting ("Rp 5.000.000"
  // becomes "5000000") BEFORE extracting numbers, so the consistency check
  // only validates factual numbers — not citation pointers or thousands
  // separators. Without this, the check flags "[4]" as a hallucinated "4"
  // and "5.000" as an ungrounded "5", both of which are correct outputs of
  // the LLM that we don't want to suppress.
  const cleaned = String(text || '')
    .replace(/\[\d+\]/g, '')          // [1], [2][3], [4] -> ''
    .replace(/Rp\s?/gi, '')           // "Rp " or "Rp" prefix
    .replace(/(\d)\.(\d)/g, '$1$2')    // 5.000.000 -> 5000000
    .replace(/(\d),(\d)/g, '$1$2');   // 5,000,000 -> 5000000
  const m = cleaned.match(/-?\d+(\.\d+)?/g);
  return m ? m.map((n) => n.replace(/\.0+$/, '')) : [];
}

async function processInboundMessage(inboundMsg, ctx) {
  ctx = ctx || {};
  const sock = ctx.sock;
  const audit0 = audit;

  // Defense in depth: ignore self-echoes. Baileys fires messages.upsert for
  // every message the socket sends, with fromMe=true. If we don't filter
  // these out, the AI's own reply triggers another LLM call, which tries
  // to send another reply — a feedback loop that spams the contact.
  // Also ignore empty bodies and status broadcasts.
  if (inboundMsg.key && inboundMsg.key.fromMe === true) {
    return { decision: 'none', reason: 'self_echo' };
  }
  const rawChatId0 = inboundMsg.chatId || (inboundMsg.key && inboundMsg.key.remoteJid);
  if (!rawChatId0 || rawChatId0 === 'status@broadcast') {
    return { decision: 'none', reason: 'non_chat_message' };
  }

  // Resolve LID -> PN so the trigger hits the same chats row the inbox writer
  // and the /api/messages/send API use. Without this, messages that Baileys
  // reports as @lid land in a different chats row (or none), and the chat
  // mode lookup returns chat_not_found — silencing the auto-reply.
  const rawChatId = rawChatId0;
  const chatId = (inbox && typeof inbox.resolveJid === 'function')
    ? inbox.resolveJid(rawChatId)
    : rawChatId;
  const body = inboundMsg.body || '';
  if (!body || !body.trim()) {
    return { decision: 'none', reason: 'empty_body' };
  }
  const tenantId = process.env.DEFAULT_TENANT_ID || 'default';
  const phone = derivePhone(inboundMsg);
  const lastMessageAt =
    (inboundMsg.messageTimestamp && Math.floor(inboundMsg.messageTimestamp)) ||
    Math.floor(Date.now() / 1000);

  // Step 0: upsert the chat row (idempotent; ensures loadChatMode works for new contacts).
  // Wrapped in try/catch so a chat-upsert failure does not block the trigger;
  // loadChatMode will return chat_not_found if the row really isn't there.
  try {
    await upsertChatOnInbound(chatId, { phone, lastMessageAt });
  } catch (_err) {
    // swallow; the chat_not_found branch below will catch a genuinely-missing row
  }

  // Step 0.5: persist the inbound message into the messages table + embed it
  // for episodic retrieval. Fire-and-forget so a slow embedder does not
  // block the trigger. The current inbound's message id is also added to the
  // messages table so the episodic search can see "what did the user just say"
  // on the next turn. The write uses the same id from Baileys to keep things
  // idempotent (re-fires of the same event overwrite the same row).
  const inboundMsgId = (inboundMsg.key && inboundMsg.key.id) || null;
  if (inboundMsgId) {
    (async () => {
      try {
        const pool = require('../../db/client').getPool();
        await pool.query(
          `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status)
           VALUES ($1, $2, 'in', $3, $4::jsonb, $5, 'received')
           ON CONFLICT (id) DO UPDATE
             SET body = EXCLUDED.body, timestamp = EXCLUDED.timestamp`,
          [
            inboundMsgId,
            chatId,
            body,
            JSON.stringify({ id: inboundMsgId, fromMe: false }),
            lastMessageAt,
          ]
        );
        await episodic.embedAndStoreMessage({
          id: inboundMsgId,
          chatId,
          body,
          direction: 'in',
          timestamp: lastMessageAt,
        });
      } catch (_) {
        // episodic store is best-effort; the trigger continues regardless
      }
    })();
  }

  // Step 1: load chat mode.
  let aiMode;
  try {
    aiMode = await loadChatMode(chatId);
  } catch (err) {
    await audit0.write('auto_reply_hold', { chatId, tenantId, reason: 'chat_not_found' });
    return { decision: 'none', reason: 'chat_not_found' };
  }
  if (aiMode === 'human' || aiMode === 'human_pending_flag') {
    return { decision: 'none', reason: aiMode === 'human' ? 'human_mode' : 'human_pending_flag' };
  }

  // Step 2: settings.
  const settings = await getSettings();
  if (!settings.whatsappAutoReply.enabled) {
    return { decision: 'none', reason: 'auto_reply_disabled' };
  }

  // Step 3: compose system prompt.
  const basePrompt = settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
  const { buildSystemPrompt } = require('../settings/composer');
  const systemPrompt = buildSystemPrompt({
    settings,
    tenantName: 'Tenant',
    language: settings.language,
    basePrompt,
  });

  // Step 4: retrieval.
  const { chunks, retrievalScore } = await hybridRetrieval({
    query: body,
    scope: 'whatsapp',
    chatId,
    contactPhone: phone,
  });

  // Step 4b: fetch ALL KB chunk text for the tenant so the numerical
  // grounding check (step 11) can verify numbers against the full KB —
  // not just the top-K the retriever surfaced. Without this, the LLM
  // citing a price that exists in the KB but didn't make the top-5
  // gets flagged as hallucination. Single-row, ~2 KB total, fast.
  // (knowledge_chunks is single-tenant in MVP — no tenant_id filter.)
  let allKbText = '';
  try {
    const pool = require('../../db/client').getPool();
    const r = await pool.query("SELECT text FROM knowledge_chunks");
    allKbText = r.rows.map((row) => row.text || '').join('\n');
  } catch (_) {
    // DB unavailable — fall through; the check below will use only the
    // retrieved chunks, which is no worse than before.
  }

  // Step 5: turbo cutoff.
  if (retrievalScore < TAU_TURBO) {
    try {
      await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'turbo_cutoff');
    } catch (_) {}
    await audit0.write('auto_reply_hold', { chatId, tenantId, reason: 'turbo_cutoff', retrievalScore });
    return { decision: 'hold', reason: 'turbo_cutoff' };
  }

  // Step 6: build user prompt.
  // Dual-layer memory (cycle be-ai-auto-reply follow-up, 2026-07-09):
  //   Layer 1 — running summary (chats.conversation_summary, always loaded,
  //            ~1-4 KB) carries the high-level narrative thread.
  //   Layer 2 — episodic top-K by vector similarity (always loaded; K is
  //            tunable via EPISODIC_TOPK env, default 10) carries the
  //            granular facts the LLM needs to resolve follow-up references.
  // The previous "getRecentHistory" approach only returned the last 6 turns
  // verbatim, which is what made "berapa lama" unresolvable when the topic
  // was set 4 turns earlier. The episodic store scales to thousands of turns.
  let chatHistory = [];
  let summary = '';
  try {
    const { embedText } = require('../llm/embed');
    const qEmb = await embedText(body);
    const hits = await episodic.episodicSearch({
      chatId,
      queryEmbedding: qEmb,
      topK: EPISODIC_TOPK,
    });
    // Reformat for buildUserPrompt: { role, content, ts } -> { role, content }.
    chatHistory = hits.map((h) => ({ role: h.role, content: h.body, ts: h.ts, score: h.score }));
  } catch (_) {
    // Embedding or DB failure — fall back to markdown history (last 6)
    // so the LLM still has SOME context. Better than nothing.
    chatHistory = (inbox && typeof inbox.getRecentHistory === 'function')
      ? inbox.getRecentHistory(chatId, 6)
      : [];
  }
  try {
    summary = await summaryStore.loadChatSummary(chatId);
  } catch (_) {
    summary = '';
  }
  const userPrompt = buildUserPrompt({
    question: body,
    contextChunks: chunks,
    chatHistory,
    maxHistory: EPISODIC_TOPK,
    summary,
    contactPhone: phone,
  });

  // Schedule an async summary refresh (debounced by summary_updated_at).
  summaryStore.maybeUpdateSummary(chatId, tenantId, { fireAndForget: true });

  // Step 7 + 8: call LLM + parse with retry.
  // Show a "typing…" indicator for the whole LLM-think-then-send window.
  // The LLM call can take 5-30s, well past Baileys' ~5s presence auto-clear,
  // so startTyping() refreshes the indicator on a fixed cadence.
  const stopTyping = startTyping(sock, chatId);
  const llmClient = { createChatCompletion };
  let parsed;
  try {
    const r = await createChatCompletion({
      systemPrompt,
      userPrompt,
      jsonSchema: { name: 'wa_decision', schema: zodSchemaShape(WhatsAppAutoReplyDecisionSchema) },
    });
    const parsedR = await parseStructuredOutput({
      rawText: r.content,
      schema: WhatsAppAutoReplyDecisionSchema,
      llmClient,
      systemPrompt,
      userPrompt,
    });
    parsed = parsedR.parsed;
  } catch (err) {
    stopTyping();
    try {
      await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'parse_failure');
    } catch (_) {}
    await audit0.write('auto_reply_hold', { chatId, tenantId, reason: 'parse_failure', error: String(err.message) });
    return { decision: 'hold', reason: 'parse_failure' };
  }

  // Step 8.5: fallback augmentation.
  // The LLM returns the locked Indonesian fallback phrase verbatim when it
  // can't answer with confidence. Per U's direction (2026-07-09), we send
  // it as-is — no KB excerpt recommendation, no robotic padding. The
  // contact gets a short, friendly apology and a human takes over.
  // (Previous behaviour: appended the closest KB chunk + 📚 header. Removed
  // because U found it too robotic and unwanted.)

  // Step 9-12: post-LLM gates + send. Wrapped in try/finally so the
  // typing indicator is always stopped, regardless of which gate fires
  // (confidence_low, ungrounded_number, send_failure) or whether the
  // send succeeds.
  try {
    // Step 9: confidence gate.
    // The LLM explicitly chose fallback_used:true -> it has already decided
    // the right reply is the locked Indonesian fallback phrase. Step 8.5 has
    // already enriched that phrase with the closest KB excerpt. Send it.
    // Only hold when the LLM said `answered` but with suspiciously low
    // confidence — that is the case where the answer is questionable.
    const confThresh = settings.whatsappAutoReply.confidenceThreshold;
    if (!parsed.fallback_used && parsed.confidence < confThresh) {
      try {
        await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'confidence_low');
      } catch (_) {}
      await audit0.write('auto_reply_hold', {
        chatId,
        tenantId,
        reason: 'confidence_low',
        confidence: parsed.confidence,
      });
      return { decision: 'hold', reason: 'confidence_low' };
    }

    // Step 9b: fallback handoff (BUGFIX answer-policy-2026-07-15).
    // When the LLM returns fallback_used:true, the chat mode MUST transition
    // to human_pending_flag BEFORE the send so the UI surfaces the
    // "needs human" indicator and the operator knows to take over. The
    // locked fallback phrase is still sent as the visible reply (the
    // contact sees a graceful "kak, butuh bantuan manusia" message) — we
    // do NOT block the send, we just flip the chat mode + write the
    // handoff audit row.
    if (parsed.fallback_used) {
      try {
        await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'fallback_handoff');
      } catch (_) {}
      await audit0.write('auto_reply_handoff', {
        chatId,
        tenantId,
        reason: 'fallback_handoff',
        confidence: parsed.confidence,
        fallback_used: parsed.fallback_used,
      });
    }

    // Step 10: citation grounding (skipped for MVP unless we have embeddings).
    // Step 11: numerical consistency.
    // A number is "grounded" if it appears in any KB chunk for this tenant,
    // not just the top-K the retriever returned. This distinguishes a real
    // hallucination (number not in the KB) from a retrieval miss (number
    // exists in the KB but didn't make the top-5).
    const nums = extractNumbers(parsed.answer);
    for (const n of nums) {
      const inRetrieved = chunks.some((c) => (c.chunk.text || '').includes(n));
      const inKb = allKbText.includes(n);
      if (!inRetrieved && !inKb) {
        try {
          await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'ungrounded_number');
        } catch (_) {}
        await audit0.write('auto_reply_hold', { chatId, tenantId, reason: 'ungrounded_number', number: n });
        return { decision: 'hold', reason: 'ungrounded_number' };
      }
    }

    // Step 12: send.
    try {
      const send = await sendReply({
        sock,
        chatId,
        body: parsed.answer,
        tenantId,
        isFallback: parsed.fallback_used === true,
      });
      await audit0.write('auto_reply_sent', {
        chatId,
        tenantId,
        confidence: parsed.confidence,
        citations: (parsed.citations || []).length,
        retrievalScore,
        messageId: send.messageId,
      });
      return { decision: 'send', messageId: send.messageId };
    } catch (err) {
      return { decision: 'none', reason: 'send_failure' };
    }
  } finally {
    stopTyping();
  }
}

function zodSchemaShape(zodSchema) {
  // Best-effort conversion to plain JSON schema for the LLM gateway.
  // zod doesn't expose its schema directly; we hand off to the parser.
  // The structured outputs call uses the zod schema via parseStructuredOutput.
  return { type: 'object', additionalProperties: true };
}

module.exports = { processInboundMessage, derivePhone };