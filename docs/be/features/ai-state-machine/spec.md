<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md §3.4
  - docs/tech/ai-reply-state-machine.md
  - docs/tech/crm-data-model.md
  - frontend/src/types/crm.ts:7 (locked literal union)
-->

# AI State Machine — Spec

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §3.4.
> If anything in this document conflicts with MVP.md §3.4, MVP.md wins.

The **`AIReplyMode` state machine** governs when the AI may answer a
chat and when the operator must intervene. The state lives on
`chats.ai_mode` (TEXT column on the existing `chats` table) with a
SQL CHECK constraint that mirrors the TS literal union.

## 1. The mode type (byte-identical literal union)

```ts
type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';
```

The same literal appears in:

- `frontend/src/types/crm.ts:7`
- `docs/tech/crm-data-model.md` §2
- `docs/tech/ai-reply-state-machine.md` §1
- `docs/crm/features/ai-autoreply/spec.md` §3
- [`../ai-whatsapp-trigger/spec.md`](../ai-whatsapp-trigger/spec.md) §5

**No other file is allowed to spell this type any differently.** Drift
is a blocker; the vitest spec `state-machine.test.js` asserts
byte-equivalence at test time.

## 2. SQL CHECK constraint

```sql
ALTER TABLE chats
  ADD COLUMN ai_mode         TEXT NOT NULL DEFAULT 'ai'
    CHECK (ai_mode IN ('ai','human','human_pending_flag')),
  ADD COLUMN ai_pending_flag BOOLEAN NOT NULL DEFAULT false;
```

(from MVP.md §2.2)

Any INSERT / UPDATE that violates the CHECK fails at the DB level
with error code `23514` (check violation). The BE catches this and
returns `400 ForbiddenTransition`.

## 3. Allowed-transitions table

Per `docs/be/MVP.md` §3.4:

| From → To | Trigger | Actor | Effect on `chats` row |
|---|---|---|---|
| `ai → human_pending_flag` | confidence `< τ_user` / retrieval `< τ_turbo` / parse invalid / scope violation | BE (system) | `UPDATE chats SET ai_mode = 'human_pending_flag' WHERE id = $chatId AND ai_mode = 'ai'` |
| `ai → human` | operator toggle | Operator | `UPDATE chats SET ai_mode = 'human' WHERE id = $chatId AND ai_mode = 'ai'` |
| `human_pending_flag → ai` | operator toggle (e.g. "Send as-is") | Operator | `UPDATE chats SET ai_mode = 'ai' WHERE id = $chatId AND ai_mode = 'human_pending_flag'` |
| `human_pending_flag → human` | operator toggle (e.g. "Edit & send") | Operator | `UPDATE chats SET ai_mode = 'human' WHERE id = $chatId AND ai_mode = 'human_pending_flag'` |
| `human → *` | **forbidden** | (terminal until operator toggle) | The WHERE clause pins `ai_mode = 'human'` AND the requested mode; transition is rejected with `400 ForbiddenTransition`. |

The transition function (`src/ai/whatsapp/handoff.js::setMode(chatId, mode)`)
**always** uses a conditional UPDATE with the current mode pinned in
the WHERE clause. A row that does not match the expected current
mode is treated as a forbidden transition.

## 4. The 400 response on forbidden transitions

Mirrors FE behavior per
[`docs/crm/features/ai-autoreply/spec.md`](../../../crm/features/ai-autoreply/spec.md)
and the FE vitest spec at `autoReply.test.ts:135-167` (cited by MVP.md
§3.4).

```js
// Express error response shape (mirrors FE)
return res.status(400).json({
  error: 'ForbiddenTransition',
  message: `Transition from '${currentMode}' to '${requestedMode}' is not allowed.`,
  details: { currentMode, requestedMode, chatId },
});
```

The unit test `state-machine.test.js::"human → human_pending_flag returns 400"`
mirrors the FE's assertion verbatim.

## 5. Audit log row per transition

Every successful transition writes an audit row tagged
`state_machine_transition`:

```jsonc
{
  "ts": "2026-07-03T00:30:00.000Z",
  "event": "state_machine_transition",
  "chatId": "...",
  "tenantId": "default",
  "from": "ai",
  "to": "human_pending_flag",
  "trigger": "low_confidence",
  "actor": "be_system",
  "confidence": 0.62
}
```

Failed transitions (`400 ForbiddenTransition`) write `state_machine_forbidden`.

## 6. Implementation notes

- The state machine is a **pure function** of `(currentMode, event) → nextMode`,
  residing in `src/ai/whatsapp/handoff.js`. It has no I/O and no time
  component; the unit test exhaustively walks the `(state × event)` matrix.
- The DB UPDATE is **conditional**: it pins the expected current mode
  in the WHERE clause. If the row count is 0 (the chat was already
  transitioned by a concurrent caller), the transition is rejected
  with `400 ForbiddenTransition` or `409 ConflictTransition` (operator
  toggle case).
- `chats.ai_pending_flag` is a redundant boolean mirror of
  `chats.ai_mode = 'human_pending_flag'`. It exists for backward
  compatibility with the legacy FE mock which queries the boolean
  directly. The BE always writes both columns in the same UPDATE.

## 7. Out of scope (this run)

- WebSocket for real-time `ai_mode` changes (Phase 3).
- Time-based escalation (`human_pending_flag > 1h` → page operator) —
  Phase 3.
- Automatic mode per contact (current mode is per chat).
- "Co-pilot" mode (AI drafts while operator types).

## 8. Cross-references

- Goals: [`docs/be/MVP.md`](../../../be/MVP.md) §3.4.
- FE canonical state machine: [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).
- FE data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- FE literal: [`../../../frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts).
- AI settings data model: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
- WhatsApp trigger: [`../ai-whatsapp-trigger/spec.md`](../ai-whatsapp-trigger/spec.md).
- API: [`../../api/api-spec.md`](../../api/api-spec.md).