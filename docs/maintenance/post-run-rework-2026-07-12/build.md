# BuildRecord.md — Post-Run Rework Application

> **Cycle id**: post-run-rework-2026-07-12
> **Run id**: WF_MAINTENANCE-apply-post-run-rework-2026-07-12
> **Attempt id**: ATT-MAINT-BE-1
> **Agent**: @backend
> **Mode**: full (maintenance dispatch)
> **Plan**: `docs/maintenance/post-run-rework-2026-07-12/plan.md`
> **Audit source**: `sot/audit/sot-fidelity-cross-cycle.md` §"Findings" (lines 436–622)
> **Status**: done
> **Executed at**: 2026-07-12T02:09:38+07:00

## §1. Files touched (5 affected cycle docs)

| File | Path | Lines (before→after) | Δ | Note |
|---|---|---|---:|---|
| whatsapp-typing/spec.md | `docs/be/features/whatsapp-typing/spec.md` | 718 → 718 | 0 | §5→§7.2 ×2 (RW-SEQ1-1, RW-SEQ1-2); single-line replacements, no net line change |
| whatsapp-typing/prd.md | `docs/be/features/whatsapp-typing/prd.md` | 236 → 236 | 0 | trigger.js:76-80 → :81-83 (RW-SEQ1-3); single-line replacement |
| whatsapp-typing/build.md | `docs/be/features/whatsapp-typing/build.md` | 692 → 692 | 0 | `startTyping` row parenthetical added (RW-SEQ1-4); same-line, longer text |
| mvp/spec.md | `docs/be/features/mvp/spec.md` | 956 → 956 | 0 | `§2` header line-range `41-59` → `41-61` (RW-SEQ2-2); no net line change |
| mvp/build.md | `docs/be/features/mvp/build.md` | 1022 → 1024 | +2 | §2.7 `typing.js` row added (RW-SEQ2-4); §3.3 parenthetical added (RW-SEQ2-3); `errorHandler.js` `19→26`, `instanceLock.js`/`logger.js` `(small)→74/17` (RW-SEQ2-5, RW-SEQ2-6) |
| be-ai-auto-reply-2026-07-03/prd.md | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | 782 → 782 | 0 | "13 steps" → "14 steps" with reconciliation parenthetical (RW-SEQ3-1); cite ranges tightened (RW-SEQ3-2, RW-SEQ3-3); `hardened-rules.js` parenthetical (RW-SEQ3-4); all in-place edits |
| be-ai-auto-reply-2026-07-03/plan.md | `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md` | 1053 → 1057 | +4 | §T6 CRM store paragraph rewritten verbatim from audit remediation (AUD-IMPL-AI-1-2) |

Plus this Build record: `docs/maintenance/post-run-rework-2026-07-12/build.md` (new file).

**Files touched**: 7 doc files + 1 new build record = **8 files** (5 affected cycle docs + this record + 1 in-cycle prd.md per plan §1.1).

## §2. Per-fix table (15 rows)

| # | ID | File:line | Before quote | After quote | Verification |
|---|---|---|---|---|---|
| 1 | RW-SEQ1-1 | `docs/be/features/whatsapp-typing/spec.md:286` | `` `sot/general/FRD.md §5 AC-11.5` `` | `` `sot/general/FRD.md §7.2 AC-11.5` `` | ✅ PASS — re-read L286 confirms `§7.2 AC-11.5` |
| 2 | RW-SEQ1-2 | `docs/be/features/whatsapp-typing/spec.md:380-381` | `` `sot/general/FRD.md` `` (next line) `` `§5 AC-11.7` `` | `` `sot/general/FRD.md` `` (next line) `` `§7.2 AC-11.7` `` | ✅ PASS — re-read L379-382 confirms `§7.2 AC-11.7` |
| 3 | RW-SEQ1-3 | `docs/be/features/whatsapp-typing/prd.md:113` | `` upstream (`trigger.js:76-80`) `` | `` upstream (`trigger.js:81-83`) `` | ✅ PASS — re-read L112-113 confirms `trigger.js:81-83` |
| 4 | RW-SEQ1-4 | `docs/be/features/whatsapp-typing/build.md:116` | (no parenthetical; range `47-58`) | `(The `stop` closure returned by `startTyping` is at `typing.js:60-65`, cited in the row below.)` (range unchanged at `47-58`) | ✅ PASS — re-read L115-118 confirms parenthetical appended; cite range `47-58` preserved (audit permits either tighten to `47-58` with stop-closure note OR expand to `47-66`; chose the former per the existing-row-at-`60-65` convention in the same table) |
| 5 | RW-SEQ2-1 | `docs/be/features/mvp/{prd,spec,plan,build}.md` (sweep) | (no qualifying anti-ban-default `§5` cites found) | (no changes) | ✅ PASS (no-op with rationale) — Grep for `§5` + context (`anti-ban`, `ANTI_BAN`, `defaults`) across all 4 MVP docs returned exactly 1 candidate: `build.md:790` which says `"PRD §5 NFR row says `0.3` — drift noted"`. That `§5` correctly points at the **PRD §5 NFR table** (deliberate drift reference per FRD-001 §7.4 OQ-A1), NOT at the FRD broadcast section. The next `§7.2 AC-11.5` reference in the same cell is the corrected value. Swapping `§5` → `§7.2` here would invert the audit's intent. No other matches. **Sweep result: 0 edits needed.** |
| 6 | RW-SEQ2-2 | `docs/be/features/mvp/spec.md:119` | `## 2. Locked values (verbatim from `src/config/index.js:41-59`)` | `## 2. Locked values (verbatim from `src/config/index.js:41-61`)` | ✅ PASS — re-read L119 confirms `41-61` |
| 7 | RW-SEQ2-3 | `docs/be/features/mvp/build.md:354-355` (was L355) | `The canonical example from the\nsingle-send handler:` | `The canonical example from the\nsingle-send handler (call site: `messageController.js:38-44`;\nfunction definition: `client.js:38-47`):` | ✅ PASS — re-read L353-355 confirms parenthetical |
| 8 | RW-SEQ2-4 | `docs/be/features/mvp/build.md:233` (new row, was §2.7 last file list) | (no `typing.js` row) | `| `src/whatsapp/typing.js` | PRE-EXISTING (cross-cutting) | n/a (owned by BUILD-TYPING-1) | 72 lines | F-5/F-7 — `src/whatsapp/typing.js` |` | ✅ PASS — re-read L232-234 confirms row inserted at correct position (between `instanceLock.js` and `logger.js` rows) |
| 9 | RW-SEQ2-5 | `docs/be/features/mvp/build.md:229` | `| `src/middleware/errorHandler.js` | PRE-EXISTING | n/a | 19 lines | ... |` | `| `src/middleware/errorHandler.js` | PRE-EXISTING | n/a | 26 lines | ... |` | ✅ PASS — re-read L229 confirms `26 lines` (sanity: `(Get-Content src/middleware/errorHandler.js).Count` = 26) |
| 10 | RW-SEQ2-6 | `docs/be/features/mvp/build.md:232, 234` | `instanceLock.js` `(small)`; `logger.js` `(small)` | `instanceLock.js` `74 lines`; `logger.js` `17 lines` | ✅ PASS — re-read L232 + L234 confirm 74 + 17 lines (sanity: `instanceLock.js`=74 lines, `logger.js`=17 lines on disk) |
| 11 | RW-SEQ3-1 | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md:193-205` | `The 13 steps are: ...` | `The 14 steps are: ... (14 distinct gates per SPEC-AI-1 §9.1.1 + BUILD-AI-1 §3.5; ...)` | ✅ PASS — re-read L193-205 confirms "14 steps" + reconciliation parenthetical explaining the inflation (early-return guards = 1 gate; step 0.5 message persist + episodic embed + step 4b full-KB fetch inflate the otherwise 12-step core) |
| 12 | RW-SEQ3-2 | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md:401` (was L401, now L402 after RW-SEQ3-1's line expansion) | `Source: `src/ai/whatsapp/trigger.js:94-96`;` | `Source: `src/ai/whatsapp/trigger.js:93-96`;` | ✅ PASS — re-read confirms `trigger.js:93-96` |
| 13 | RW-SEQ3-3 | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md:404` (was L404, now L405) | `Source: `src/ai/whatsapp/trigger.js:194-203`;` | `Source: `src/ai/whatsapp/trigger.js:195-203`;` | ✅ PASS — re-read confirms `trigger.js:195-203` |
| 14 | RW-SEQ3-4 | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md:427` (now L428) | `` `src/ai/settings/hardened-rules.js:7-12` `` | `` `src/ai/settings/hardened-rules.js:7-12` (array at L7-12; export at L18) `` | ✅ PASS — re-read confirms parenthetical appended |
| 15 | AUD-IMPL-AI-1-2 | `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md:305-309` (now L305-313) | ```- **CRM store** (T6):\n  - `src/ai/store/entities.js` — CRUD for `entity_definitions`,\n    `entity_records`, `entity_relationships`; schema-versioned;\n    zod-validated against `entity.schema_json` (mirrors FE\n    `zodFromSchema.ts`).``` | ```- **CRM store** (T6): all 7 endpoints wired inline in\n  `src/ai/routes/crm.js` (209 lines), zod-validated;\n  `src/db/migrations/002-ai-tables.sql:117-154` carries the\n  `entity_definitions` + `entity_records` + `entity_relationships`\n  table definitions. **No separate `src/ai/store/entities.js` was\n  created** — the CRUD is colocated with the route handlers per\n  the seq-1 cross-cycle convention (`messageController.js` +\n  `routes/messages.js` are likewise co-located, not split into a\n  `store/` module).``` | ✅ PASS — re-read L305-313 confirms verbatim audit remediation text (lines 609-617 of `sot/audit/sot-fidelity-cross-cycle.md`) is in place. Sanity check: `Get-ChildItem src\ai\store` returns `chunks.js, episodic.js, ingest-worker.js, ingest.js` (no `entities.js`); CRM endpoints are routed inline at `src/ai/routes/crm.js:15-207` (matches audit). |

**Summary**: 14 PASS + 1 PASS-no-op (RW-SEQ2-1 sweep: zero qualifying cites to swap). **Zero FAILs.**

## §3. Smoke test output

Command: `pnpm test` (workdir = project root; `C:\Users\indocyber\Desktop\agent\projects\baileys test`).

```
> baileys-whatsapp-api@0.7.0-be-ai-auto-reply.0 test C:\Users\indocyber\Desktop\agent\projects\baileys test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 C:/Users/indocyber/Desktop/agent/projects/baileys test

 ✓ src/test/episodic.test.mjs (6 tests) 87ms
 ❯ src/test/composer-byte-identity.test.mjs (7 tests | 1 failed) 215ms
   × composer byte identity (BE mirrors FE) > BE base prompts match FE source byte-for-byte when FE source is available 98ms
     → expected 'Anda adalah Baileys Studio AI Assista…' to be 'Anda adalah Baileys Studio AI Assista…' // Object.is equality
 ✓ src/test/inbox-history.test.mjs (5 tests) 1175ms
 ✓ src/test/typing.test.mjs (10 tests) 227ms
 ✓ src/test/db-preflight.test.mjs (18 tests) 129ms
 ✓ src/test/parse.test.mjs (4 tests) 18ms
 ✓ src/test/audit.test.mjs (4 tests) 638ms
 ✓ src/test/hardened-rules.test.mjs (4 tests) 16ms
 ✓ src/test/contact-scope.test.mjs (5 tests | 3 skipped) 3212ms
 ✓ src/test/settings-defaults.test.mjs (6 tests) 19ms
 ✓ src/test/llm-retry.test.mjs (8 tests) 7409ms
 ✓ src/test/hybrid.test.mjs (5 tests) 11ms
 ✓ src/test/ai-settings-roundtrip.test.mjs (3 tests) 27ms
 ✓ src/test/settings-endpoint.test.mjs (7 tests) 3607ms
 ✓ src/test/chunker.test.mjs (4 tests) 18ms
 ✓ src/test/db-migrations.test.mjs (5 tests) 1239ms
 ✓ src/test/state-machine.test.mjs (7 tests) 44ms
 ✓ src/test/ingest.test.mjs (4 tests) 3005ms
 ✓ src/test/routes-ai.test.mjs (6 tests) 2966ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/test/composer-byte-identity.test.mjs > composer byte identity (BE mirrors FE) > BE base prompts match FE source byte-for-byte when FE source is available
AssertionError: expected 'Anda adalah Baileys Studio AI Assista…' to be 'Anda adalah Baileys Studio AI Assista…' // Object.is equality

  - Expected
  + Received

   ... (diff is the BE-vs-FE composer fallback string divergence: BE has the generic `"Maaf, saya tidak memiliki informasi yang cukup yakin..."`; FE has the post-hotfix #3 friendly `"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"`) ...

 Test Files  1 failed | 18 passed (19)
      Tests  1 failed | 114 passed | 3 skipped (118)
   Start at  02:09:38
   Duration  23.37s (transform 2.71s, setup 0ms, collect 45.53s, tests 24.07s, environment 25ms, prepare 25.61s)
```

**Result**: `114 passed / 1 failed-pre-existing (composer-byte-identity, intentional FE divergence) / 3 skipped (contact-scope MVP-disabled)` — matches `plan.md` §T4 expected output exactly. No drift introduced.

## §4. No `src/**` touched

Confirmed. The only files modified during this dispatch are:

| # | Path | Type | Lines Δ |
|---|---|---|---:|
| 1 | `docs/be/features/whatsapp-typing/spec.md` | edit (2 in-place cite replacements) | 0 |
| 2 | `docs/be/features/whatsapp-typing/prd.md` | edit (1 in-place cite replacement) | 0 |
| 3 | `docs/be/features/whatsapp-typing/build.md` | edit (1 in-place parenthetical append) | 0 |
| 4 | `docs/be/features/mvp/spec.md` | edit (1 in-place line-range update) | 0 |
| 5 | `docs/be/features/mvp/build.md` | edit (4 fixes: §2.7 row added, §2.7 line-count corrections ×3, §3.3 parenthetical) | +2 |
| 6 | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | edit (4 fixes: count + cite ranges + parenthetical) | 0 |
| 7 | `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md` | edit (1 paragraph rewrite, verbatim from audit) | +4 |
| 8 | `docs/maintenance/post-run-rework-2026-07-12/build.md` | new file (this record) | — |

No `git diff --stat` available (this is not a git repo — confirmed at session start). Above table is the substitute.

**`src/**` integrity**: `Get-ChildItem src\whatsapp\typing.js`, `src\middleware\errorHandler.js`, `src\utils\instanceLock.js`, `src\utils\logger.js`, `src\ai\routes\crm.js`, `src\ai\store\` were read for sanity checks ONLY (line counts + file-existence verification). No writes to any file under `src/`.

**`sot/general/*` integrity**: untouched. The supervisor writes those (DecisionLog.md, OrchestratorState.md, _SOT_INDEX.md, AuditReport.md). This dispatch only READ from `sot/audit/sot-fidelity-cross-cycle.md`.

## §5. Open issues

**None.** All 15 fixes applied cleanly. RW-SEQ2-1 sweep was a documented no-op (zero qualifying cites to swap; the only `§5` candidate was a deliberate PRD-NFR drift reference, not the broadcast-section default-cite pattern the audit flagged).

### Out-of-scope drift observed (not acted on)

Two minor prose inconsistencies surfaced during T3 verification but are **not in the 15-fix scope** and remain for a future maintenance cycle:

1. **`docs/be/features/be-ai-auto-reply-2026-07-03/plan.md:317`** still reads `"the 13-step pipeline"` after PRD was updated to "14 steps" (RW-SEQ3-1). The plan's prose at §T7 was not in the audit's 15-item list; per the brief ("DO NOT touch any file not in the 15-fix list"), this is left for a future rework.
2. **`docs/be/features/be-ai-auto-reply-2026-07-03/spec.md:937`** still uses "step 11" and "step 12" nomenclature without the "14-step total" framing the PRD now uses. Same rationale — out of scope.

These are flagged here for the supervisor's awareness; they are not findings raised by this dispatch (the BE's authority boundary ends at the 15-fix list).

---

## §6. Acknowledgment contract

```
FROM: @backend
STATUS: Complete
SUMMARY: Applied 14 doc-cite fixes + 1 paragraph rewrite verbatim from audit remediation across 7 cycle docs; RW-SEQ2-1 sweep was a documented no-op (0 qualifying cites to swap). Smoke test (`pnpm test`) result: 114 passed / 1 failed-pre-existing (composer-byte-identity FE divergence, unchanged) / 3 skipped — matches plan §T4 expected.
ARTIFACTS: docs/be/features/whatsapp-typing/spec.md, docs/be/features/whatsapp-typing/prd.md, docs/be/features/whatsapp-typing/build.md, docs/be/features/mvp/spec.md, docs/be/features/mvp/build.md, docs/be/features/be-ai-auto-reply-2026-07-03/prd.md, docs/be/features/be-ai-auto-reply-2026-07-03/plan.md, docs/maintenance/post-run-rework-2026-07-12/build.md
ISSUES: none (RW-SEQ2-1 no-op documented; 2 out-of-scope prose drift items flagged in §5 for the supervisor's awareness)
NEXT-STEP: @audit (scoped) verification pass per plan §5
```