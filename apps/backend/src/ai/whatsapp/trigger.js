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
const { createChatCompletion, buildUserPrompt } = require('../llm');

// BUG-DUPLICATE-REPLIES fix (2026-07-23): Baileys fires messages.upsert
// multiple times for the same message id (e.g. once as a notify stub,
// once with hasMessage=true, once on history sync). Without dedup the
// trigger processes the same inbound 2-3x, sending 2-3 duplicate
// replies. Track seen ids in-process (matches inbox.wasLogged's pattern).
const SEEN_IDS = new Set();
const SEEN_IDS_MAX = 1000;
function alreadySeen(id) {
  if (!id) return false;
  if (SEEN_IDS.has(id)) return true;
  // Bounded growth: when SEEN_IDS gets large, swap in a fresh Set.
  if (SEEN_IDS.size >= SEEN_IDS_MAX) SEEN_IDS.clear();
  SEEN_IDS.add(id);
  return false;
}
const {
  BAILEYS_AI_SYSTEM_PROMPT_ID,
  BAILEYS_AI_SYSTEM_PROMPT_EN,
} = require('../llm/base-prompts');
const audit = require('../audit/log');
const inbox = require('../../inbox/writer');
const episodic = require('../store/episodic');
const summaryStore = require('../settings/summary');
const escalationStore = require('../settings/escalation');
const { startTyping } = require('../../whatsapp/typing');
const { runInternalChat } = require('../chat/internalAgent');
const { SCOPE_CHAT } = require('../tools/dbTools');
const { currentAccountId } = require('../../whatsapp/account');

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

// Smallest figure we will try to derive. Below this, ids ("rec_t1"),
// quantities and field counts dominate the source text, and a pool of small
// integers makes almost any small number "derivable" — so those keep the
// literal check only.
const DERIVABLE_MIN = 1000;
const DERIVABLE_POOL_MAX = 40;   // distinct operands considered
const DERIVABLE_STATES_MAX = 50000; // reachable-sum ceiling; over it we bail to escalation

/**
 * True if `target` is the exact sum of some subset of `pool`.
 *
 * The numerical gate was written when every fact in an answer was a literal
 * quote from a KB chunk, so `sources.includes(n)` was the whole test. With
 * the read-only tool layer that premise broke: asked "total tagihan saya",
 * the model calls query_records, gets 7500000 and 2500000, and answers
 * 10000000 — arithmetic that is correct and fully traceable to the contact's
 * own rows, but appears verbatim nowhere, so the gate suppressed a good
 * reply at random. Prompting the model to always route totals through
 * aggregate_records is not a gate (it disobeyed, then over-corrected into
 * the fallback phrase). This is: a derived figure is accepted only when it
 * provably adds up out of figures that ARE in the sources.
 *
 * Bailing out (returning false) escalates to a human, so every bound here
 * fails safe.
 */
function isDerivableSum(target, pool) {
  if (!Number.isFinite(target) || target < DERIVABLE_MIN) return false;
  const operands = Array.from(new Set(pool))
    .filter((v) => Number.isFinite(v) && v > 0 && v <= target)
    .sort((a, b) => b - a)
    .slice(0, DERIVABLE_POOL_MAX);
  if (operands.length < 2) return false;
  let reachable = new Set([0]);
  for (const v of operands) {
    const next = new Set(reachable);
    for (const sum of reachable) {
      const acc = sum + v;
      if (acc === target) return true;
      if (acc < target) next.add(acc);
    }
    if (next.size > DERIVABLE_STATES_MAX) return false; // too wide to verify
    reachable = next;
  }
  return false;
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
  // BUG-DUPLICATE-REPLIES fix (2026-07-23): Baileys fires
  // messages.upsert 2-3x for the same message id (once as a notify
  // stub, once with hasMessage=true, once on history sync). Without dedup
  // the trigger sends 2-3 duplicate replies. Skip if we've already
  // processed this id in this process lifetime. The Set is bounded so
  // a long-running BE doesn't leak memory.
  const dedupKey = inboundMsg.key && inboundMsg.key.id;
  if (dedupKey && alreadySeen(dedupKey)) {
    return { decision: 'none', reason: 'duplicate_inbound' };
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
          `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status, account_jid)
           VALUES ($1, $2, 'in', $3, $4::jsonb, $5, 'received', $6)
           ON CONFLICT (id) DO UPDATE
             SET body = EXCLUDED.body, timestamp = EXCLUDED.timestamp`,
          [
            inboundMsgId,
            chatId,
            body,
            JSON.stringify({ id: inboundMsgId, fromMe: false }),
            lastMessageAt,
            currentAccountId() || '',
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
  //
  // CRM records count as grounding too (spec 2026-09-04 Gap A): now that
  // entity_records are indexed, a number the LLM legitimately took from a
  // record (an invoice amount, a quantity) must not be treated as a
  // hallucination and suppress the reply. The record_embeddings read is
  // guarded separately so a missing table (migration not yet run) still
  // leaves the KB grounding intact.
  let allKbText = '';
  try {
    const pool = require('../../db/client').getPool();
    const r = await pool.query("SELECT text FROM knowledge_chunks");
    allKbText = r.rows.map((row) => row.text || '').join('\n');
  } catch (_) {
    // DB unavailable — fall through; the check below will use only the
    // retrieved chunks, which is no worse than before.
  }
  try {
    const pool = require('../../db/client').getPool();
    const r = await pool.query('SELECT text FROM record_embeddings');
    allKbText += '\n' + r.rows.map((row) => row.text || '').join('\n');
  } catch (_) {
    // record_embeddings absent — KB-only grounding, same as before Gap A.
  }

  // Single escalation path (spec 2026-09-04 Gap B). Every hold reason -
  // turbo_cutoff, parse_failure, confidence_low, fallback_handoff,
  // ungrounded_number - routes through here, so the agent briefing is
  // generated in exactly one place and a future sixth reason gets it for
  // free. The briefing is awaited, not fire-and-forget: the operator is
  // alerted by the mode change and must not beat the context to the UI.
  async function escalate(reason, auditExtra, escOpts) {
    escOpts = escOpts || {};
    try {
      await transitionChatMode(chatId, 'ai', 'human_pending_flag', reason);
    } catch (_) {}
    await audit0.write(escOpts.auditEvent || 'auto_reply_hold', Object.assign(
      { chatId, tenantId, reason },
      auditExtra || {}
    ));
    try {
      await escalationStore.generateEscalationBriefing({
        chatId,
        tenantId,
        reason,
        reasoning: escOpts.reasoning || null,
        confidence: escOpts.confidence != null ? escOpts.confidence : null,
        retrievedChunks: chunks,
        currentMessage: body,
      });
    } catch (_) {
      // generateEscalationBriefing swallows its own failures and stores a
      // degraded briefing; this guard is belt-and-braces so a handoff can
      // never be blocked by briefing generation.
    }
    return { decision: 'hold', reason };
  }

  // Step 5: turbo cutoff.
  if (retrievalScore < TAU_TURBO) {
    return escalate('turbo_cutoff', { retrievalScore });
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
  let parsed;
  // Tool output the model actually saw this turn. The numerical grounding
  // check below validates every figure in the reply against retrieved text;
  // now that the auto-reply can look records up, that text has to include
  // tool results or a correct answer would read as a hallucination.
  let toolGroundingText = '';
  let agentToolCalls = [];
  try {
    // The auto-reply now runs the same tool loop as the internal assistant,
    // but at CHAT scope: read-only, and restricted to this contact's own
    // conversation and CRM records. Cross-contact tools are refused by
    // runTool itself, not by asking the prompt nicely. The safety envelope
    // is unchanged — every gate below still applies.
    const agentResult = await runInternalChat({
      question: body,
      llm: { createChatCompletion },
      scope: { mode: SCOPE_CHAT, chatId, contactPhone: phone },
      // Keep the persona/base prompt and the already-assembled CONTEXT
      // (retrieved chunks, running summary, episodic history) in play.
      basePrompt: systemPrompt,
      extraContext: userPrompt,
    });
    toolGroundingText = agentResult.groundingText || '';
    agentToolCalls = agentResult.toolCalls || [];

    // A missing confidence means the decision contract was not honoured. Do
    // NOT default it — defaulting high would bypass the confidence gate and
    // send an unvetted reply to a customer. Treat it as a parse failure so
    // the chat escalates to a human instead.
    if (typeof agentResult.confidence !== 'number') {
      stopTyping();
      return escalate('parse_failure', {
        error: 'agent returned no confidence',
        rounds: agentResult.rounds,
      });
    }
    parsed = {
      answer: agentResult.answer,
      citations: agentResult.citations || [],
      confidence: agentResult.confidence,
      fallback_used: agentResult.fallback_used === true,
      reasoning: agentResult.reasoning,
    };
  } catch (err) {
    stopTyping();
    return escalate('parse_failure', { error: String(err.message) });
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
      return escalate(
        'confidence_low',
        { confidence: parsed.confidence },
        { confidence: parsed.confidence, reasoning: parsed.reasoning }
      );
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
      // Return value deliberately ignored - the locked fallback phrase is
      // still sent to the contact below.
      await escalate(
        'fallback_handoff',
        { confidence: parsed.confidence, fallback_used: parsed.fallback_used },
        { auditEvent: 'auto_reply_handoff', confidence: parsed.confidence, reasoning: parsed.reasoning }
      );
    }

    // Step 10: citation grounding (skipped for MVP unless we have embeddings).
    // Step 11: numerical consistency.
    // A number is "grounded" if it appears in any KB chunk for this tenant,
    // not just the top-K the retriever returned. This distinguishes a real
    // hallucination (number not in the KB) from a retrieval miss (number
    // exists in the KB but didn't make the top-5).
    const nums = extractNumbers(parsed.answer);
    // Operand pool for the derived-figure check below: every number that
    // appears in a source, normalised the same way the answer's numbers are.
    const groundedPool = extractNumbers(
      chunks.map((c) => c.chunk.text || '').join('\n') + '\n' + allKbText + '\n' + toolGroundingText
    ).map(Number);
    for (const n of nums) {
      const inRetrieved = chunks.some((c) => (c.chunk.text || '').includes(n));
      const inKb = allKbText.includes(n);
      // A figure the model read out of a tool result is grounded too — it
      // came from this contact's own row, which is exactly what the tools
      // exist to surface.
      const inTools = toolGroundingText.includes(n);
      // … and so is a total it added up out of those rows.
      const derived = !inRetrieved && !inKb && !inTools && isDerivableSum(Number(n), groundedPool);
      if (!inRetrieved && !inKb && !inTools && !derived) {
        return escalate(
          'ungrounded_number',
          { number: n },
          { confidence: parsed.confidence, reasoning: parsed.reasoning }
        );
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
        tools: agentToolCalls.map((t) => t.name),
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

module.exports = { processInboundMessage, derivePhone, isDerivableSum, extractNumbers };