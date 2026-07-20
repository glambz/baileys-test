<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/crm/features/ai-autoreply/spec.md
-->

# AI Reply State Machine — `crm/`

> Authoritative definition of the `AIReplyMode` state machine that
> governs when the AI may answer a WhatsApp chat and when the
> operator must intervene. This file is the **canonical** source of
> the transition table; the same table is reproduced byte-identical
> in [`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §3.

## 1. The mode type

The mode of a chat is one of three values. The literal union is
byte-identical in this file §1, in
[`crm-data-model.md`](crm-data-model.md) §2, and in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §3.
**No other file is allowed to spell this type any differently.**

```ts
type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';
```

## 2. Transition table (canonical)

The state machine has three states. The table below is the
authoritative source. The same table (byte-identical) is reproduced in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §3.

| from | to | trigger | side-effects | actor |
|---|---|---|---|---|
| `ai` | `human` | operator clicks "Take over" on the chat | future: emit `chat.ownership_changed` event; flush any queued AI draft | operator |
| `ai` | `human_pending_flag` | AI draft produced with `confidence < 0.7` on an inbound message | the AI draft is held for review; the chat moves to `human_pending_flag` | AI (auto) |
| `human` | `ai` | operator clicks "Hand back to AI" on the chat | the next inbound message is eligible for AI; any held draft is discarded | operator |
| `human` | `human_pending_flag` | — | **disallowed**. A human-mode chat never auto-flags. The system must reject any code path that would attempt this transition. | — |
| `human_pending_flag` | `ai` | operator clicks "Send as-is" on the held AI draft | the held draft is sent; mode returns to `ai` | operator |
| `human_pending_flag` | `human` | operator clicks "Edit & send" on the held AI draft | the operator's edited version is sent; the chat is now in `human` (operator-owned) | operator |

### 2.1 Why `human → human_pending_flag` is forbidden

When the chat is in `human` mode, the operator owns every reply. The
AI pipeline is not invoked at all, so it cannot produce a draft and
therefore cannot flag the chat. The system enforces this in two
places:

1. The transition function (`setMode(chatId, 'human_pending_flag')`)
   refuses to execute when the current mode is `human`. The mock
   raises a typed error `ERR_FORBIDDEN_TRANSITION`.
2. The unit test in §5 of
   [`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md)
   asserts the same property at the integration level.

## 3. Confidence threshold (CRM/RAG)

The decision rule that triggers the `ai → human_pending_flag`
transition uses the CRM/RAG confidence threshold declared in
[`crm-data-model.md`](crm-data-model.md) §3. This is distinct from
the legacy WhatsApp module's `0.65` (declared in
[`chat-data-model.md`](chat-data-model.md) §2.6); the two thresholds
coexist.

## 4. Persistence

The current mode of a chat is stored alongside the chat row in the
existing WhatsApp-module `chats` table (column
`ai_reply_mode text NOT NULL DEFAULT 'ai'`). No new table is added.

The state machine is a pure function of `(currentMode, event) →
nextMode`. It has no I/O and no time component; it is exhaustively
tested by the unit test in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §5.

## 5. Out of scope (this run)

- "Co-pilot" mode (the AI drafts while the operator types).
- Automatic mode per contact (the current mode is per chat).
- Time-based escalation (`human_pending_flag` for > 1 h → page the
  operator). This is a future feature.

## 6. Cross-references

- Data model: [`crm-data-model.md`](crm-data-model.md).
- Feature spec (with the byte-identical transition table in §3 and the
  cross-contact test in §5):
  [`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md).
- API contract for the auto-reply endpoint (tagged `[mock]`):
  [`../frontend/api/api-spec.md` §6](../frontend/api/api-spec.md).
