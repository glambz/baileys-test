<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/features/ai-whatsapp-trigger/spec.md
-->

# AI WhatsApp Trigger — PRD

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md).

The PRD for the BE's WhatsApp auto-reply handler. This is internal
infrastructure (no UI changes this run).

## WAT-1. Inbound message triggers the auto-reply pipeline

- **As the** BE,
- **when** Baileys fires `messages.upsert` with an inbound 1:1
  message,
- **I want** to run the 13-step pipeline described in
  [`spec.md` §2](spec.md),
- **so that** the operator's auto-reply setting is honoured per
  chat.

**Acceptance**

- The Baileys socket is NEVER blocked by the handler (fire-and-forget).
- The handler catches all thrown errors and writes an audit row
  tagged `auto_reply_error`.

## WAT-2. Chat in `human` or `human_pending_flag` mode is skipped

- **As the** BE,
- **when** the chat's `chats.ai_mode ∈ {human, human_pending_flag}`,
- **I want** to skip the LLM call and write an audit row
  `auto_reply_skipped_mode`,
- **so that** the operator's manual ownership is preserved.

**Acceptance**

- No outbound message is sent.
- `chats.ai_mode` is NOT mutated.
- The audit row includes the chat id and the previous mode.

## WAT-3. Chat in `ai` mode but `whatsappAutoReply.enabled = false` is skipped

- **As the** BE,
- **when** `ai_settings.whatsappAutoReply.enabled = false`,
- **I want** to skip the LLM call and write `auto_reply_skipped_disabled`,
- **so that** the operator can disable auto-reply globally without
  flipping every chat.

**Acceptance**

- No outbound message is sent.
- The audit row includes the settings row's `updated_at`.

## WAT-4. Low retrieval score triggers turbo cutoff

- **As the** BE,
- **when** the hybrid retrieval's top score is `< 0.30`,
- **I want** to skip the LLM call, set `aiMode = 'human_pending_flag'`,
  and write `auto_reply_turbo_cutoff`,
- **so that** we don't burn tokens on a guess.

**Acceptance**

- The threshold `0.30` is the locked `TAU_RETRIEVAL`.
- The chat moves to `human_pending_flag` only if it was `ai`; never
  overrides a `human` chat.

## WAT-5. Low LLM confidence flags for human review

- **As the** BE,
- **when** the LLM's `confidence < τ_user`,
- **I want** to set `aiMode = 'human_pending_flag'` and write
  `auto_reply_low_confidence`,
- **so that** the operator reviews before sending.

**Acceptance**

- The threshold `τ_user` is read from
  `ai_settings.whatsappAutoReply.confidenceThreshold`.
- The fallback phrase (Indonesian, byte-identical) is the chat's
  last outbound message preview, NOT sent via Baileys.

## WAT-6. Operator sees an audit trail per inbound

- **As an** operator / compliance reviewer,
- **I want** every auto-reply decision logged as an NDJSON row,
- **so that** I can audit what the AI did and why.

**Acceptance**

- Audit log path: `./data/audit/<YYYY-MM-DD>.ndjson`.
- Every row contains: timestamp, event tag, chatId, tenantId,
  contactId, confidence, latency, top chunks, error code (nullable),
  failing step (nullable).