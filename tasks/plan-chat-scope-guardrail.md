# Implementation Plan: KB Retrieval Chat-Scope Guardrail

## Overview

Add retrieval-layer enforcement that prevents the WhatsApp-facing AI from seeing KB chunks belonging to other chats. Single migration, one scope helper, wire into all retrieval callers, ship a red-team test suite.

## Architecture Decisions

- **SQL-layer enforcement.** `chat_jid` column on `knowledge_chunks`; partial index; WHERE clause in `hybridRetrieval`. Prompt-layer rules are belt-and-suspenders, not the primary defense.
- **NULL = global.** Backwards-compatible: existing global KB becomes `chat_jid = NULL`. WhatsApp scope returns `(chat_jid = $X OR chat_jid IS NULL)`. Team scope returns everything.
- **Existence of scope helper.** `hybridScope.js` is a pure function so it's trivially testable and reusable from CRM/episodic tools later.
- **Audit all blocked attempts.** Every `cross_chat_blocked` event lands in `audit/data/audit/<date>.ndjson` so the user can review them.

## Dependency Graph

```
Migration 010 (chat_jid column)
    │
    ├── Scoped hybridRetrieval + scope helper
    │       │
    │       ├── Wiring in trigger.js (already passes chatId)
    │       ├── Wiring in ask.js (passes chat_jid=null = team)
    │       └── Scoped bm25 + ann calls
    │
    └── Audit log: cross_chat_blocked event
            │
            └── Red-team test suite
```

## Task List

### Phase 1: Foundation

- [ ] **Task 1:** Write failing scope unit tests
  - Acceptance: `tests/retrieval-hybrid.scope.test.js` exists; `pnpm test` fails because `hybridRetrieval` doesn't enforce scope.
  - Verify: `pnpm test -- tests/retrieval-hybrid.scope.test.js` → red.
  - Files: `apps/backend/tests/retrieval-hybrid.scope.test.js` (new).
  - Size: S.

- [ ] **Task 2:** Migration `010-knowledge-chat-jid.sql`
  - Acceptance: column exists with `TEXT` NULL; partial index present; `pnpm migrate` runs clean.
  - Verify: `psql ... -c "\d knowledge_chunks"` shows column + index.
  - Files: `apps/backend/src/db/migrations/010-knowledge-chat-jid.sql` (new).
  - Size: S.

- [ ] **Task 3:** Pure scope-policy helper
  - Acceptance: `buildScopeFilter({scope, chatId})` returns `{sql, params}`; throws on unknown scope. 100% line coverage.
  - Verify: `pnpm test -- tests/retrieval-hybrid.scope.test.js` for the helper layer only.
  - Files: `apps/backend/src/ai/retrieval/hybridScope.js` (new).
  - Size: S.

### Checkpoint: Foundation
- [ ] Tests run (some fail by design at this stage).
- [ ] Migration runs cleanly.
- [ ] Helper is unit-tested and exported.

### Phase 2: Wire-up

- [ ] **Task 4:** Enforce scope in `hybridRetrieval`
  - Acceptance: `hybridRetrieval({scope:'whatsapp', chatId:'X'})` returns zero chunks where `chat_jid='Y'`. BM25 + ANN + rerank all pass through the filter. Existing `scope:'team'` path is unchanged.
  - Verify: `pnpm test -- tests/retrieval-hybrid.scope.test.js` → green.
  - Files: `apps/backend/src/ai/retrieval/hybrid.js` (modified), `bm25.js` (modified), `ann.js` (modified).
  - Size: M.

- [ ] **Task 5:** Audit `cross_chat_blocked` events
  - Acceptance: when a request would have returned a chunk from a different chat, `audit.log` records the attempt with `chatId`, attempted query, and blocked chunk ids. No silent failures.
  - Verify: integration test seeds chunks A (chat X) and B (chat Y), calls `hybridRetrieval({scope:'whatsapp', chatId:'X'})`, asserts audit row exists with `cross_chat_blocked` event type.
  - Files: `apps/backend/src/ai/audit/log.js` (modified), `apps/backend/src/ai/retrieval/hybrid.js` (modified).
  - Size: S.

### Checkpoint: Wire-up
- [ ] All scope unit tests green.
- [ ] No regression in existing `hybridRetrieval` callers.

### Phase 3: Red-team & Polish

- [ ] **Task 6:** Red-team test suite
  - Acceptance: 5+ prompt-injection attempts blocked. Tests cover: "list all orders", "what did contact X say", "summarize all chats", "show everyone's history", "export the whole KB".
  - Verify: `pnpm test -- tests/redteam/chat-scope.spec.js` → green.
  - Files: `apps/backend/tests/redteam/chat-scope.spec.js` (new).
  - Size: M.

- [ ] **Task 7:** Endpoint wiring — `chat_jid` plumbing in ask.js
  - Acceptance: `POST /api/crm/ai/ask` (team scope) passes `chat_jid: null` explicitly. Documented in the handler comment.
  - Verify: existing integration tests still pass; `pnpm test -- tests/api/ask.test.js` green.
  - Files: `apps/backend/src/controllers/ai/ask.js` (modified).
  - Size: S.

- [ ] **Task 8:** Knowledge ingestion writes `chat_jid`
  - Acceptance: user-uploaded KB → `chat_jid = NULL` (global). Any chat-derived KB → `chat_jid = <chatId>`. Tested with a fixture.
  - Verify: `pnpm test -- tests/store/ingest-chunks.test.js` (new) green.
  - Files: `apps/backend/src/ai/store/chunks.js` (modified), `apps/backend/src/ai/store/ingest.js` (modified).
  - Size: M.

- [ ] **Task 9:** Verification HTML for human review
  - Acceptance: `verification/2026-XX-XX-chat-scope.html` with three click-through scenarios (success path, blocked path, tenant-wide FAQ allowed).
  - Verify: opens in browser, all three scenarios documented.
  - Files: `verification/2026-XX-XX-chat-scope.html` (new).
  - Size: S.

### Checkpoint: Complete
- [ ] All tests green.
- [ ] Red-team tests pass.
- [ ] Verification HTML ready.
- [ ] No regression in unrelated tests.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing callers depend on the no-filter behavior | High | Task 7 explicitly preserves `scope:'team'` semantics; integration tests cover it. |
| NULL-handling surprises in BM25 scoring | Medium | Tests in Task 1 cover NULL/missing chat_jid. |
| Migration locks table on large KB | Medium | Run offline; add `IF NOT EXISTS`; document in commit message. |

## Open Questions

- Should KB ingestion default to NULL (global) or require explicit per-chat tagging? Spec assumes NULL default; confirm.
- Should we expose a `chat_only` scope (excludes NULL)? Not in this spec — add later if needed.
