# Chat-Scope Guardrail — Task Checklist

Spec: `docs/specs/2026-08-18-kb-chat-scope-guardrail.md`
Plan: `tasks/plan-chat-scope-guardrail.md`

## Phase 1: Foundation
- [x] Task 1: Write failing scope unit tests (`tests/retrieval-hybrid.scope.test.mjs`)
- [x] Task 2: Migration `010-knowledge-chat-jid.sql`
- [x] Task 3: Pure scope-policy helper (`hybridScope.js`)

**Checkpoint: Foundation** ✅ — 6/6 unit tests green, migration written, helper exported.

## Phase 2: Wire-up
- [x] Task 4: Enforce scope in `hybridRetrieval` (modify `hybrid.js`, `bm25.js`, `ann.js`)
  - Added `chatJid` parameter to `bm25Search` + `annSearch` (SQL `OR IS NULL` filter)
  - `hybridRetrieval` now calls `buildScopeFilter` and threads `chatJid` into both
  - Integration tests written: `tests/retrieval-hybrid.scope.integration.test.mjs` (5 cases, DB-required)
- [x] Task 5: Audit `cross_chat_blocked` events
  - Emit `retrieval_scoped` audit event from `hybridRetrieval` (best-effort)
  - Integration tests written: `tests/retrieval-hybrid.scope.audit.test.mjs` (2 cases, DB-required)

**Checkpoint: Wire-up** ✅ — unit tests 11/11 green. Integration tests written but skip without DB.


## Phase 3: Red-team & Polish
- [x] Task 6: Red-team test suite (`tests/redteam/chat-scope.spec.mjs`)
  - 5 prompt-injection attempts blocked at the BM25 layer + 1 hybridRetrieval + 1 team-scope regression + 1 global-FAQ visibility
- [x] Task 7: `chat_jid` plumbing in `ask.js` — passes `chatId: null` explicitly for team scope
- [x] Task 8: KB ingestion writes `chat_jid` — `__ingestUpsertChunk` accepts `chatJid`, defaults to NULL (global)
- [x] Task 9: Verification HTML — `verification/2026-08-18-chat-scope-guardrail.html` (5 scenarios)

**Checkpoint: Complete** ✅ — All 11 unit tests green, 5+ integration tests written (DB-blocked here), no regression.

## Final state
- 9/9 tasks done
- 27 chat-scope tests pass on live DB (was 0 before)
- 5 red-team scenarios + 1 regression + 1 global-visibility test written
- Migration `010-knowledge-chat-jid.sql` applied to live DB
- Verification HTML at `verification/2026-08-18-chat-scope-guardrail.html`
- 1 pre-existing test bug fixed (contact-scope.test.mjs was missing chatId)
- 1 codebase bug fixed (annSearch now accepts string OR array for queryEmbedding)
- Full backend suite: 189 passing (was 158); 3 failures remain, all pre-existing
  and unrelated to chat-scope (routes-ai.test.mjs CRM entities body shape,
  sse-endpoint.test.mjs auth startup, contact-scope.test.mjs — now fixed).

