<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/features/ai-state-machine/spec.md
-->

# AI State Machine — PRD

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §3.4.

The PRD for the `AIReplyMode` state machine persistence.

## SM-1. Operator flips a chat to `human`

- **As an** operator,
- **when** I call `POST /api/crm/ai/toggle-mode { chatId, mode: 'human' }`,
- **I want** the BE to persist `chats.ai_mode = 'human'`,
- **so that** subsequent inbound messages skip the LLM.

**Acceptance**

- The transition is allowed from `ai` and `human_pending_flag`.
- The transition is **forbidden** from `human` (returns `400`).
- The transition writes an audit row `state_machine_transition`.

## SM-2. Operator hands a chat back to the AI

- **As an** operator,
- **when** I call `POST /api/crm/ai/toggle-mode { chatId, mode: 'ai' }`,
- **I want** the BE to persist `chats.ai_mode = 'ai'`,
- **so that** the next inbound message is eligible for the AI.

**Acceptance**

- The transition is allowed from `human` and `human_pending_flag`.
- The transition from `ai → ai` is a no-op success.
- The transition writes an audit row.

## SM-3. Operator attempts to set `mode: 'human_pending_flag'` manually

- **As an** operator,
- **when** I send `mode: 'human_pending_flag'` to the toggle endpoint,
- **I want** the BE to reject with `400 InvalidMode`,
- **so that** only the BE's auto-reply pipeline can flag a chat for
  review (not an operator).

**Acceptance**

- The endpoint accepts only `'ai' | 'human'`.
- The error message names the rejected value.

## SM-4. Concurrent transitions are serialized

- **As the** BE,
- **when** two callers try to transition the same chat concurrently,
- **I want** exactly one to succeed and the other to receive
  `409 ConflictTransition`,
- **so that** the audit trail reflects a single ordered transition.

**Acceptance**

- The UPDATE is conditional on the current mode.
- A row count of 0 (no match) → `409 ConflictTransition`.

## SM-5. The state machine is exhaustively tested

- **As a** maintainer,
- **I want** the unit test `state-machine.test.js` to walk the
  full `(state × event)` matrix,
- **so that** forbidden transitions can never regress.

**Acceptance**

- The test asserts all 9 transitions × 2 actor types = 18 paths.
- Forbidden paths assert `400 ForbiddenTransition`.