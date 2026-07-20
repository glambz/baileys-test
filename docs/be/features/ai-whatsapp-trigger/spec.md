<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md §2.4
  - docs/be/features/ai-orchestration/spec.md
  - docs/be/features/ai-state-machine/spec.md
  - docs/be/features/crm-store/spec.md
  - frontend/src/lib/ai/systemPrompt.ts (canonical composer)
  - docs/crm/features/ai-chat/systemPrompt.md (canonical rules)
-->

# AI WhatsApp Trigger — Spec

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §2.4.
> If anything in this document conflicts with MVP.md §2.4, MVP.md wins.

The **AI WhatsApp trigger** is the BE's handler for the
`messages.upsert` event from `@whiskeysockets/baileys`. It runs the
13-step pipeline, applies the 7 defense-in-depth layers, and either
sends the reply, flags the chat for human review, or skips — with an
audit log row per path.

## 1. Subscription model (fire-and-forget)

Baileys fires `messages.upsert` synchronously. The BE subscribes with
a non-awaited handler:

```js
// src/index.js (new code in this run)
sock.ev.on('messages.upsert', (event) => {
  // Fire-and-forget; the Baileys socket MUST NOT be blocked.
  for (const msg of event.messages) {
    trigger.processInboundMessage(msg).catch((err) => {
      logger.error({ err, msgId: msg.key?.id }, 'processInboundMessage failed');
      // DO NOT throw — that would crash the BE.
    });
  }
});
```

The handler returns immediately. Each `processInboundMessage` call
runs in its own async scope with its own logger context.

## 2. The 13-step flow

Per `docs/be/MVP.md` §2.4. The flow is implemented in
`src/ai/whatsapp/trigger.js::processInboundMessage(inboundMsg)`.

| # | Step | Where | Failure handling |
|---|---|---|---|
| 1 | Load chat state. Skip if `aiMode ∈ {human, human_pending_flag}`. | `src/ai/store/chats.js::loadMode(chatId)` | Skip → audit row `auto_reply_skipped_mode`. |
| 2 | Load settings. Skip if `whatsappAutoReply.enabled = false`. | `src/ai/settings/store.js::load()` | Skip → audit row `auto_reply_skipped_disabled`. |
| 3 | Compose system prompt (BASE + tenant fragment + HARDENED). | `src/ai/settings/composer.js::compose()` | Any thrown error → fallback phrase + `human_pending_flag`. |
| 4 | Run retrieval (`hybrid.js`) scoped to the chat's contact. | `src/ai/retrieval/hybrid.js` | Empty result → turbo cutoff (step 5). |
| 5 | **Turbo cutoff**: if `retrieval.score < τ_turbo (0.30)`, skip LLM, set `aiMode = 'human_pending_flag'`, return. | `src/ai/whatsapp/trigger.js` | Audit row `auto_reply_turbo_cutoff`. |
| 6 | Call LLM with structured outputs. | `src/ai/llm/openai-compat.js::chat()` | HTTP retry (2 attempts) on 429/5xx; fail-fast on other 4xx. |
| 7 | Parse + reject-and-retry (≤3) on validation failure. | `src/ai/llm/parse.js` | After 3 failures → fallback phrase + `human_pending_flag`. |
| 8 | Confidence gate: `confidence < settings.whatsappAutoReply.confidenceThreshold` → flag for human. | `src/ai/whatsapp/trigger.js` | Audit row `auto_reply_low_confidence`. |
| 9 | Citation grounding (cosine ≥ 0.85 per citation). | `src/ai/llm/parse.js` | First failed cite → fallback phrase + `human_pending_flag`. |
| 10 | Numerical consistency (no foreign numbers in answer). | `src/ai/llm/parse.js` | First failed number → fallback phrase + `human_pending_flag`. |
| 11 | Contact-scope post-validation (defense-in-depth). | `src/ai/whatsapp/trigger.js` | Mismatch → fallback phrase + `human_pending_flag`. |
| 12 | Send via `sock.sendMessage`. Persist outbound `messages` row. Update `chats.last_message_*`, reset `unread_count`. | `src/ai/whatsapp/send.js` | Send failure → audit row `auto_reply_send_failed`; do NOT flag (next inbound retry). |
| 13 | Audit log row. | `src/ai/audit/log.js` | Always written, even on skip paths. |

## 3. Constants

### 3.1 Turbo cutoff

```js
// src/ai/whatsapp/trigger.js
export const TAU_RETRIEVAL = 0.30;
```

Locked; below this score, the BE skips the LLM. Equivalent to
`docs/be/MVP.md` §3.3.

### 3.2 Confidence gate

```js
export const TAU_USER = settings.whatsappAutoReply.confidenceThreshold;
// Default 0.7; range [0.5, 0.95], step 0.05.
```

Mirrors `frontend/src/lib/config-crm.ts:16` (`CRM_AI_CONFIDENCE_THRESHOLD`).
Per-tenant; loaded from `ai_settings` row at step 2.

## 4. Byte-stable system prompt

The composed prompt at step 3 is byte-equivalent to
[`frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt`](../../../frontend/src/lib/ai/systemPrompt.ts).
The three-block composition and the hardened rules are documented in
[`../ai-orchestration/spec.md`](../ai-orchestration/spec.md) §2.

The four hardened rules appear byte-identical here:

```
1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.
```

The same four lines appear in
[`../ai-orchestration/spec.md`](../ai-orchestration/spec.md) §2.2 and in
[`../../../crm/features/ai-chat/systemPrompt.md`](../../../crm/features/ai-chat/systemPrompt.md) §"Per-tenant customization + hardened rules" §3.2 of `docs/tech/ai-settings-data-model.md`. A byte-identical drift check is part of `composer-byte-identity.test.js`.

## 5. AIReplyMode state transitions

The state machine is documented in [`../ai-state-machine/spec.md`](../ai-state-machine/spec.md).
Every transition that the trigger performs (steps 5, 8, 11) writes a
row to `chats.ai_mode` and an audit log entry. The trigger NEVER
performs a `human → *` transition (forbidden — only the operator
can re-enable a chat in `human` mode).

The literal union is:

```ts
type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';
```

Byte-identical in `frontend/src/types/crm.ts:7`,
`docs/tech/crm-data-model.md` §2, `docs/tech/ai-reply-state-machine.md` §1,
`docs/crm/features/ai-autoreply/spec.md` §3, and
[`../ai-state-machine/spec.md`](../ai-state-machine/spec.md) §1.

## 6. Contact-scope post-validation (defense-in-depth layer 6)

Step 11 re-checks the contact scope **after** the LLM emits its
answer. For every cited entity record, the BE asserts
`record.contact_id === chat.contact_id`. If any cite references a
record whose `contact_id` differs (or is null), the BE downgrades
to the fallback phrase, sets `aiMode = 'human_pending_flag'`, and
writes an audit row tagged `auto_reply_scope_violation`.

This is the **second** of three contact-scope guards:
1. SQL layer (predicate on `entity_records`).
2. System prompt (HARDENED rule #1).
3. Post-validation (this step).

## 7. Error-handling policy

Any thrown error in steps 3–12 is caught by the fire-and-forget
wrapper in §1. The handler:

1. Logs the error with the message id and the failing step.
2. Writes the **Indonesian fallback phrase** (byte-identical to
   `frontend/src/i18n/id.json ai.fallback.message`) to the chat.
3. Sets `aiMode = 'human_pending_flag'`.
4. Writes an audit row tagged `auto_reply_error`.

The BE process **never crashes** on a single bad message.

## 8. Audit log

Every path writes a row. The schema (one NDJSON line per row):

```jsonc
{
  "ts": "2026-07-03T00:30:00.000Z",
  "event": "auto_reply_sent",       // see enum below
  "chatId": "...",
  "tenantId": "default",
  "contactId": "6285179652486",
  "confidence": 0.86,
  "latencyMs": 1532,
  "topChunks": ["k-014", "k-007"],
  "errorCode": null,
  "step": 12
}
```

| Event tag | When |
|---|---|
| `auto_reply_sent` | step 12 success |
| `auto_reply_low_confidence` | step 8 fail |
| `auto_reply_turbo_cutoff` | step 5 fail |
| `auto_reply_scope_violation` | step 11 fail |
| `auto_reply_parse_failed` | step 7 fail after 3 retries |
| `auto_reply_citation_grounding_failed` | step 9 fail |
| `auto_reply_numerical_inconsistency` | step 10 fail |
| `auto_reply_skipped_disabled` | step 2 (settings disabled) |
| `auto_reply_skipped_mode` | step 1 (chat not in `ai` mode) |
| `auto_reply_send_failed` | step 12 send failure |
| `auto_reply_error` | any thrown error in steps 3–12 |

## 9. Out of scope (this run)

- Streaming replies (Phase 2).
- "Co-pilot" mode where AI drafts while operator types (deferred).
- Time-based escalation (`human_pending_flag` for > 1h → page operator) —
  Phase 3.
- WebSocket for real-time `ai_mode` updates — Phase 3.

## 10. Cross-references

- Goals: [`docs/be/MVP.md`](../../../be/MVP.md) §2.4.
- AI orchestration: [`../ai-orchestration/spec.md`](../ai-orchestration/spec.md).
- State machine: [`../ai-state-machine/spec.md`](../ai-state-machine/spec.md).
- CRM store: [`../crm-store/spec.md`](../crm-store/spec.md).
- KB ingestion: [`../kb-ingestion/spec.md`](../kb-ingestion/spec.md).
- API: [`../../api/api-spec.md`](../../api/api-spec.md).
- Canonical composer: [`../../../frontend/src/lib/ai/systemPrompt.ts`](../../../frontend/src/lib/ai/systemPrompt.ts).
- Canonical rules: [`../../../crm/features/ai-chat/systemPrompt.md`](../../../crm/features/ai-chat/systemPrompt.md).