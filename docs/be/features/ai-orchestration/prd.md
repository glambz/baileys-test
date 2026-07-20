<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/features/ai-orchestration/spec.md
-->

# AI Orchestration — PRD

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md).
> If anything in this document conflicts with MVP.md, MVP.md wins.

The PRD for the BE AI orchestration layer. There are **no UI changes
this run** — the FE keeps its mocks. The BE is independent.

## AI-1. Operator enables WhatsApp auto-reply via `AiSettings`

- **As an** operator,
- **I want** to toggle `whatsappAutoReply.enabled = true` in
  `AiSettings`,
- **so that** the BE auto-replies to inbound WhatsApp messages on
  chats whose `chats.ai_mode = 'ai'`.

**Acceptance**

- The `AiSettings` row is stored in `ai_settings` (Postgres).
- The BE's `trigger.js` reads this row on every inbound message.
- The `enabled` flag is consulted **before** any LLM call; if `false`,
  the BE skips the LLM and writes an audit row tagged `skipped_disabled`.

## AI-2. Operator sets a per-tenant confidence threshold

- **As an** operator,
- **I want** to set `whatsappAutoReply.confidenceThreshold` in
  `[0.5, 0.95]`, step `0.05`, default `0.7`,
- **so that** the BE flags chats for human review when the LLM's
  self-reported confidence falls below my tolerance.

**Acceptance**

- Values outside `[0.5, 0.95]` are rejected with `400 ValidationError`.
- Non-`0.05` multiples are rejected with `400 ValidationError`.
- The default `0.7` is mirrored from the FE's
  `frontend/src/lib/config-crm.ts:16` (`CRM_AI_CONFIDENCE_THRESHOLD`).

## AI-3. Operator previews the auto-reply before flipping a chat

- **As an** operator,
- **I want** to call `POST /api/crm/ai/reply-preview` with
  `{chatId, body}`,
- **so that** I can see what the AI would reply **without** sending
  the message.

**Acceptance**

- The endpoint runs the full 13-step pipeline **minus** the `sendMessage`
  step.
- Returns a `CrmReplyPreview` (mirrors FE's
  `frontend/src/types/crm.ts:143-149`).
- Includes `would_send: boolean` and `reason: string | null`.
- Does NOT mutate `chats.ai_mode` or any other state.

## AI-4. Operator toggles a chat's `ai_mode` manually

- **As an** operator,
- **I want** to call `POST /api/crm/ai/toggle-mode` with
  `{chatId, mode: 'ai' | 'human'}`,
- **so that** I can hand a chat over to a human or hand it back to
  the AI.

**Acceptance**

- `mode: 'human_pending_flag'` is rejected — only the BE sets that.
- Forbidden transitions (e.g. `human → human_pending_flag`) return
  `400 ForbiddenTransition`.
- Idempotent: re-sending the same `{chatId, mode}` is a no-op
  success.

## AI-5. Operator asks the team AI a question

- **As an** operator,
- **I want** to call `POST /api/crm/ai/ask` with `{question, topK?}`,
- **so that** I get a RAG-grounded answer over the entire tenant
  (KB + ALL CRM records, no contact filter).

**Acceptance**

- Returns `CrmAskAiResponse` (mirrors FE's `frontend/src/types/crm.ts:141`).
- `topK` defaults to `5`, range `[1, 10]`.
- The endpoint composes the prompt via `composer.js` (same path as
  the WA trigger) but with `scope = 'team'`.
- The data layer applies NO contact filter.

## AI-6. The system prompt is byte-identical to the FE's

- **As a** maintainer,
- **I want** `src/ai/settings/composer.js` to produce a string
  byte-equal to
  `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt({ settings, tenantName, language })`,
- **so that** the FE's prompt tests and the BE's prompt tests share
  the same byte-stable locked values.

**Acceptance**

- `composer-byte-identity.test.js` passes.
- `getHardenedRulesBlock()` returns the same string on both sides.
- `BAILEYS_AI_SYSTEM_PROMPT_ID` and `_EN` constants are equal across
  both files.

## Out of scope (this run)

- UI changes (the FE keeps its mocks).
- Self-hosted LLM (Phase 3).
- Streaming replies (Phase 2).
- NLI entailment check at scale (Phase 2 — stubbed MVP).