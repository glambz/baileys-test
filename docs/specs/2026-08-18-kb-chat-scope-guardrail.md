# Spec: KB Retrieval Chat-Scope Guardrail

## Objective

Prevent information leakage across WhatsApp chats by enforcing chat-scope at the **retrieval layer** (not the prompt layer). Today a contact asking "give me details on all my orders" can see answers grounded in another contact's KB chunks because:

1. `hybridRetrieval()` in `apps/backend/src/ai/retrieval/hybrid.js` accepts a `chatId` parameter but never uses it in the WHERE clause (line 60–75: empty try/catch).
2. KB chunks in `knowledge_chunks` are stored **tenant-wide** (no `chat_jid` column). `trigger.js` line 224 runs `SELECT text FROM knowledge_chunks` with no filter.
3. `episodicSearch` is correctly scoped by `chatId` — keep that as the reference implementation.

**Success criteria:**
- Every `hybridRetrieval` call for a WhatsApp surface returns only chunks whose `chat_jid` matches the inbound chat (or is `NULL` = globally shareable knowledge like FAQ).
- A red-team test suite ships in `tests/redteam/chat-scope.spec.js` that proves blocked access for: "list all orders across all chats", "what did contact X say about topic Y", "show me everyone's chat history".
- Existing happy-path tests for `hybridRetrieval` keep passing.
- The in-app AI chat (`/api/crm/ai/ask`) explicitly passes `chat_jid: null` to opt out of the scope filter — its scope is documented as global.
- `audit.log` records every blocked cross-chat retrieval attempt with `chatId`, attempted query, and reason.

## Tech Stack

- Node.js (CommonJS, existing backend)
- Postgres (existing)
- Vitest (existing test runner)
- No new dependencies

## Commands

```
Test:        cd apps/backend && pnpm test
Test redteam:cd apps/backend && pnpm test tests/redteam
Lint:        cd apps/backend && pnpm lint
Migrate:     cd apps/backend && pnpm migrate
Dev:         cd apps/backend && pnpm dev
```

## Project Structure

```
apps/backend/src/ai/retrieval/
├── hybrid.js                  # MODIFIED: enforce chat_jid WHERE clause
├── hybrid.scope.js            # NEW: pure scope-policy helper
├── bm25.js                    # MODIFIED: accept chatJid filter
└── ann.js                     # MODIFIED: accept chatJid filter

apps/backend/src/db/migrations/
└── 010-knowledge-chat-jid.sql # NEW: ADD COLUMN chat_jid, partial index

apps/backend/src/ai/audit/
└── log.js                     # MODIFIED: add 'cross_chat_blocked' event

apps/backend/tests/
├── retrieval-hybrid.scope.test.js # NEW: scope filter unit tests
└── redteam/
    └── chat-scope.spec.js         # NEW: prompt-injection leak tests
```

## Code Style

JavaScript, CommonJS, `'use strict'`. Mirror existing module style — module exports object at the bottom, no classes. Match `hybrid.js` comment header style (Source: ...).

```js
'use strict';
const { getPool } = require('../../db/client');

function buildScopeFilter({ scope, chatId }) {
  if (scope === 'whatsapp' && chatId) {
    return { sql: 'chat_jid = $1 OR chat_jid IS NULL', params: [chatId] };
  }
  if (scope === 'team') {
    return { sql: 'TRUE', params: [] };
  }
  throw new Error(`Unknown scope: ${scope}`);
}

module.exports = { buildScopeFilter };
```

## Testing Strategy

- **Unit (`tests/retrieval-hybrid.scope.test.js`):** `hybridRetrieval` with `scope: 'whatsapp'` never returns a chunk whose `chat_jid` is set to a different chat. Verify with 3 chunks: same chat, different chat, NULL.
- **Integration (`tests/redteam/chat-scope.spec.js`):** End-to-end through `/api/crm/ai/ask` and a new test-only `/api/whatsapp/trigger` endpoint. Seed 2 chats with different KB chunks. Fire a "give me all" prompt. Assert response contains only chat-A's chunks.
- **Regression:** Existing `tests/retrieval-hybrid.test.js` (if it exists) must keep passing — backwards compatibility for `scope: 'team'`.
- **Manual:** Add a `verification/2026-XX-XX-chat-scope.html` checklist with three human-driven scenarios.

Coverage target: 100% of `hybridScope.js` lines, 80%+ of `hybrid.js` after the change.

## Boundaries

- **Always:** Filter at SQL layer (don't trust the LLM). Add a partial index on `chat_jid` for the common case where most KB is tenant-wide. Write audit log for every blocked cross-chat access.
- **Ask first:** Changing the `knowledge_chunks` schema (requires migration). Changing any other retrieval consumer (episodic, CRM).
- **Never:** Filter only at the prompt level. Trust the LLM to scope itself. Ship without red-team tests.

## Migration: `010-knowledge-chat-jid.sql`

```sql
-- Add chat scoping to knowledge chunks. NULL = global/tenant-wide.
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS chat_jid TEXT;

-- Backfill: existing rows are global.
UPDATE knowledge_chunks SET chat_jid = NULL WHERE chat_jid IS NULL;

-- Index for the common retrieval pattern (most KB is global).
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_chat_jid
  ON knowledge_chunks (chat_jid)
  WHERE chat_jid IS NOT NULL;
```

After migration, update `apps/backend/src/ai/store/chunks.js` (or wherever KB is ingested) so user-uploaded knowledge becomes `chat_jid = NULL` (global), and chat-derived knowledge (e.g. message-derived summaries bound to a chat) becomes `chat_jid = <chatId>`.

## Success Criteria

- [ ] `knowledge_chunks.chat_jid` column exists; migration runs clean.
- [ ] `hybridRetrieval({ scope: 'whatsapp', chatId: 'X' })` returns zero chunks where `chat_jid = 'Y'` for any other chat Y.
- [ ] `hybridRetrieval({ scope: 'whatsapp', chatId: 'X' })` returns chunks where `chat_jid = 'X'` and `chat_jid IS NULL`.
- [ ] `hybridRetrieval({ scope: 'team' })` returns all chunks (in-app chat).
- [ ] `tests/redteam/chat-scope.spec.js` passes; 5+ injection attempts blocked.
- [ ] Audit log shows `cross_chat_blocked` events for the redteam attempts.
- [ ] No regression in existing `hybridRetrieval` callers.

## Open Questions

1. Should tenant-wide FAQs (no `chat_jid`) ever be excluded from WhatsApp chat retrieval? (Current spec: no. They're shared knowledge.)
2. Should `chat_jid` column be `NOT NULL` and require explicit marking? (Current spec: no, NULL = global is the least-disruptive rule.)

## TDD Order

1. Write `tests/retrieval-hybrid.scope.test.js` (red).
2. Write migration `010-knowledge-chat-jid.sql`. Run.
3. Implement `hybridScope.js` and wire into `hybrid.js` (green).
4. Write `tests/redteam/chat-scope.spec.js` (red).
5. Wire audit log for `cross_chat_blocked` (green).
6. Run full test suite — no regression.
7. Generate `verification/chat-scope.html` for human verification.
