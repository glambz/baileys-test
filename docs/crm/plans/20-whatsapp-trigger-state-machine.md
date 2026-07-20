# Plan 20: WhatsApp Trigger + AIReplyMode State Machine + Send

**Goal**: Wire the AI auto-reply into Baileys's `messages.upsert` event — `src/ai/whatsapp/{trigger,handoff,send}.js`. On each inbound WhatsApp message, run the full MVP.md §2.4 step-1-through-13 pipeline (load chat state → load settings → compose prompt → retrieve → turbo cutoff → LLM → parse-retry → confidence gate → citation grounding → numerical consistency → contact-scope post-validate → send → audit). Persist `chats.ai_mode` transitions via the `AIReplyMode` state machine and the SQL CHECK constraint.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- Plan 16 (`16-settings-store-composer-hardened.md`) — needs `getSettings()` + `buildSystemPrompt()` for the composed system prompt.
- Plan 19 (`19-retrieval-pipeline.md`) — needs `hybridRetrieval()` for the scoped retrieval.

## Micro-Tasks

1. **Author `src/ai/whatsapp/handoff.js` (AIReplyMode state machine + DB transition)**
   - Export `loadChatMode(chatId): Promise<AIReplyMode>`, `transitionChatMode(chatId, fromMode, toMode, reason): Promise<void>`, `assertTransitionAllowed(fromMode, toMode): void`.
   - Allowed transitions (MVP.md §3.4):
     - `ai → human_pending_flag` (BE system: confidence / turbo / parse / scope violation).
     - `ai → human` (operator toggle).
     - `human_pending_flag → ai` (operator toggle).
     - `human_pending_flag → human` (operator toggle).
     - `human → *` is FORBIDDEN. Only an operator can re-enable `human → ai` via Plan 21's `POST /api/crm/ai/toggle-mode` (which sets `toMode='ai'` only when the operator is overriding a prior `human` decision; the BE never auto-flags a human-mode chat).
   - `assertTransitionAllowed` throws `ForbiddenTransitionError` for any disallowed pair; `transitionChatMode` runs the UPDATE inside a transaction and reads back the row to confirm the new value matches `toMode`.
   - The `chats.ai_mode` column is constrained by the SQL CHECK from Plan 15 (`IN ('ai','human','human_pending_flag')`); the state machine enforces the **transition** rules, the DB enforces the **value** rules.
   - **Acceptance**: vitest spec asserts: (a) `ai → human_pending_flag` succeeds and persists; (b) `human → human_pending_flag` throws `ForbiddenTransitionError` (the literal forbidden case from MVP.md §3.4); (c) `human_pending_flag → human` succeeds; (d) the DB row reflects the new mode after each successful transition.

2. **Author `src/ai/whatsapp/send.js` (Baileys sendMessage wrapper)**
   - Export `sendReply({ sock, chatId, body }): Promise<{ messageId: string, timestamp: number }>`.
   - Calls `sock.sendMessage(chatId, { text: body })`. On `429` (rate-limit) or `500`/`503` from the WhatsApp socket, retries up to 3 times with exponential backoff (base 1s, factor 2, jitter ±20%).
   - On success, persists an outbound `messages` row with `direction='out'`, `key.fromMe=true`, the `messageId` from Baileys, and the current `unix_seconds` timestamp.
   - On success, updates `chats.last_message_preview`, `chats.last_message_at`, and resets `chats.unread_count` to `0`.
   - On permanent failure (after 3 retries), throws `SendFailedError` and writes an audit log row (Plan 22).
   - **Acceptance**: vitest spec mocks `sock.sendMessage`; (a) one successful call returns the messageId and persists a `messages` row; (b) a 429 then 200 returns the second result; (c) three 500s throw `SendFailedError` and write an audit row.

3. **Author `src/ai/whatsapp/trigger.js` (the main entry point)**
   - Export `processInboundMessage(inboundMsg: { chatId: string, body: string, key: any, senderPn?: string }): Promise<{ decision: 'send'|'hold'|'none', reason?: string }>`.
   - This function is **not awaited** by Baileys — it's registered as the `messages.upsert` listener in `src/index.js` and runs fire-and-forget (errors caught + audit-logged, never crash the socket).
   - Pipeline (MVP.md §2.4 steps 1–13):
     1. **Load chat state.** `const aiMode = await loadChatMode(chatId)`. If `aiMode === 'human'`, return `{ decision: 'none', reason: 'human_mode' }`.
     2. **Load settings.** `const settings = await getSettings()`. If `!settings.whatsappAutoReply.enabled`, return `{ decision: 'none', reason: 'auto_reply_disabled' }`.
     3. **Compose system prompt** via `buildSystemPrompt({ settings, tenantName, language: settings.language, basePrompt: settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID })`.
     4. **Run retrieval** (`hybridRetrieval`): `const { chunks, retrievalScore, contactScopeApplied } = await hybridRetrieval({ query: inboundMsg.body, scope: 'whatsapp', chatId, contactPhone: derivePhone(inboundMsg) })`.
     5. **Turbo cutoff.** If `retrievalScore < 0.30`, call `transitionChatMode(chatId, 'ai', 'human_pending_flag', 'turbo_cutoff')` and return `{ decision: 'hold', reason: 'turbo_cutoff' }`.
     6. **Build user prompt** via `buildUserPrompt({ question: inboundMsg.body, contextChunks: chunks, chatHistory: <last 6 turns from DB>, contactPhone: derivePhone(inboundMsg) })`.
     7. **Call LLM** via `createChatCompletion({ systemPrompt, userPrompt, jsonSchema: WhatsAppAutoReplyDecisionSchema })`.
     8. **Parse + retry** via `parseStructuredOutput({ rawText, schema: WhatsAppAutoReplyDecisionSchema, llmClient, systemPrompt, userPrompt, maxAttempts: 3 })`.
     9. **Confidence gate.** If `parsed.confidence < settings.whatsappAutoReply.confidenceThreshold`, call `transitionChatMode(chatId, 'ai', 'human_pending_flag', 'confidence_low')` and return `{ decision: 'hold', reason: 'confidence_low' }`.
     10. **Citation grounding** — for each `parsed.citations[i]`, look up the chunk and compute cosine similarity between the cited span and the chunk text. Drop citations with cosine `< 0.85`. If after dropping, `parsed.citations.length === 0`, hold.
     11. **Numerical consistency** — extract numbers from `parsed.answer`; assert each number appears in at least one cited chunk's `text`. If any number is ungrounded, hold.
     12. **Contact-scope post-validate** — for each citation whose source is an `entity_records` row, assert `entity.contact_id === derivePhone(inboundMsg)`. If any citation fails, hold.
     13. **Send** via `sendReply({ sock, chatId, body: parsed.answer })`.
     14. Return `{ decision: 'send' }`. Audit log row per Plan 22.
   - **Acceptance**: vitest spec mocks LLM + Baileys + DB; (a) `aiMode='human'` short-circuits with `decision='none'`; (b) `auto_reply.enabled=false` short-circuits; (c) `retrievalScore=0.25` holds with reason `turbo_cutoff` and DB mode is now `human_pending_flag`; (d) `confidence=0.5` holds with reason `confidence_low`; (e) a well-formed answer sends, persists the message, updates `last_message_*`, and writes the audit row.

4. **Wire `src/index.js` to subscribe `messages.upsert`**
   - Import `processInboundMessage` from `src/ai/whatsapp/trigger.js`.
   - Register `sock.ev.on('messages.upsert', ({ messages }) => { for (const m of messages) { processInboundMessage({ chatId: m.key.remoteJid, body: m.message?.conversation ?? '', key: m.key, senderPn: m.key.senderPn }).catch(err => logger.error({ err }, 'ai_trigger_error')); } })`.
   - The listener is **not** awaited; errors are caught and logged (never crash the Baileys socket).
   - The `sock` instance is the existing one from `src/whatsapp/client.js`.
   - **Acceptance**: a manual smoke test starts the BE, triggers a mock `messages.upsert` event (using Baileys's test hook), and observes the audit log row within 2 seconds.

5. **Author `src/test/state-machine.test.js` (Plan 23 contract; this plan plants the seeds)**
   - Specs covering the 5 allowed transitions + the 1 forbidden `human → human_pending_flag` case.
   - The forbidden-case spec asserts HTTP 400 when the operator's API request tries `human → human_pending_flag` (Plan 21's `POST /api/crm/ai/toggle-mode` rejects this).
   - **Acceptance**: `pnpm vitest run src/test/state-machine.test.js` is green; total spec count is ≥ 5.

## Cross-References
- Trigger pipeline steps 1–13: `docs/be/MVP.md` §2.4 (the numbered list).
- Defense-in-depth layers 3, 4, 6, 7: `docs/be/MVP.md` §3.5 (citation grounding, numerical consistency, contact-scope, confidence + turbo cutoff).
- `AIReplyMode` state machine: `docs/tech/ai-reply-state-machine.md` §1 + §2 (canonical transition table).
- SQL CHECK constraint on `chats.ai_mode`: `docs/crm/plans/15-db-layer-postgresql.md` (migration 001).
- Settings + composer: `docs/crm/plans/16-settings-store-composer-hardened.md`.
- Retrieval: `docs/crm/plans/19-retrieval-pipeline.md`.
- LLM gateway: `docs/crm/plans/17-llm-gateway.md`.
- Audit log: `docs/crm/plans/22-audit-log.md`.
- REST endpoint that the operator uses to toggle mode: `docs/crm/plans/21-rest-endpoints.md` (POST /api/crm/ai/toggle-mode).
- Cross-contact leak test: `docs/crm/plans/23-defense-in-depth-tests.md`.
- Existing Baileys event registration pattern: `src/index.js` + `src/whatsapp/client.js` (referenced, not modified).

## Notes
- **`AIReplyMode` state machine per MVP.md §3.4.** The BE enforces the transition rules in `handoff.js`; the SQL CHECK constraint in Plan 15 enforces the value rules. Two layers, both required.
- **Forbidden transition `human → human_pending_flag`.** The state machine rejects this with `ForbiddenTransitionError`. The REST endpoint in Plan 21 maps this to HTTP 400. This is **defense-in-depth layer 6** complementing the data-layer filter.
- **`processInboundMessage` is non-awaited.** The Baileys socket must not block on AI responses. Errors are caught and audit-logged.
- The 5 defense-in-depth layers (out of 7 from MVP.md §3.5) live in this file: layers 3 (citation grounding), 4 (numerical consistency), 6 partial (contact-scope post-validate — the data-layer half is in Plan 19), 7 (turbo + confidence). Layers 1, 2, 5 live in Plan 16/17/Phase-2 respectively.
- **NLI entailment (layer 5) is Phase 2** per MVP.md §7. This plan does NOT implement it; the step is documented as `// TODO Phase 2: NLI entailment check` in the trigger flow.
- `derivePhone(inboundMsg)` reads `inboundMsg.key.senderPn` first (the display-source phone), falling back to `inboundMsg.key.remoteJid` parsed as `<phone>@s.whatsapp.net`. The `senderPn` rule is the same locked value used by the FE per `docs/frontend/features/chats/spec.md`.
- The 6-turn chat history is read from `messages` ordered by `timestamp DESC LIMIT 12` (6 inbound + 6 outbound, then trimmed). Plan 21's read endpoint uses the same query.
- The trigger NEVER sends to a chat in `human` mode — that's the whole point of the mode. The `human` mode is a hard stop.