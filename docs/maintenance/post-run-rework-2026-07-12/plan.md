# MaintPlan.md — Post-Run Rework Application

> **Cycle id**: post-run-rework-2026-07-12
> **Run id**: WF_MAINTENANCE-apply-post-run-rework-2026-07-12
> **Source of truth for each remediation**: `sot/audit/sot-fidelity-cross-cycle.md` (AUD-SOTFIDELITY-CROSS-CYCLE-1) §"Findings" + §"Triage" sub-sections, lines 436–622.
> **Status**: todo
> **Mode**: full (audit lens per `AUDIT_FRAMEWORK.md` §3)

## 1. Scope and boundary

### 1.1 In scope (15 fixes)

The closed retro-fit run (`WF_EXISTING-retrofit-all-features-2026-07-10`) ended 2026-07-12T01:55:00+07:00 with 15 triaged post-run rework items per the cross-cycle audit. The user directive at 2026-07-12T02:02:41+07:00 was: **"Apply the 15-item post-run rework"**.

| # | ID | Severity | Doc | Line | Fix |
|---|---|---|---|---|---|
| 1 | RW-SEQ1-1 | Low | `docs/be/features/whatsapp-typing/spec.md` | 286 | `§5` → `§7.2` (anti-ban default cite for AC-11.5) |
| 2 | RW-SEQ1-2 | Low | `docs/be/features/whatsapp-typing/spec.md` | 380–381 | `§5` → `§7.2` (anti-ban default cite for AC-11.7) |
| 3 | RW-SEQ1-3 | Low | `docs/be/features/whatsapp-typing/prd.md` | 113 | `trigger.js:76-80` → `trigger.js:81-83` (NG-T3 self-echo filter) |
| 4 | RW-SEQ1-4 | Low | `docs/be/features/whatsapp-typing/build.md` | 116 | tighten `startTyping` body cite to `typing.js:47-58` + add parenthetical that `stop` closure is at `typing.js:60-65` |
| 5 | RW-SEQ2-1 | Low | `docs/be/features/mvp/{prd,spec,plan,build}.md` | sweep | `§5` → `§7.2` for anti-ban default cites |
| 6 | RW-SEQ2-2 | Low | `docs/be/features/mvp/spec.md` | 119 | header cite `antiBan.js:42` → `config/index.js:41-61` |
| 7 | RW-SEQ2-3 | Low | `docs/be/features/mvp/build.md` | 355 | add parenthetical to §3.3: "(call site: `messageController.js:38-44`; function definition: `client.js:38-47`)" |
| 8 | RW-SEQ2-4 | Low | `docs/be/features/mvp/build.md` | §2.7 | add `src/whatsapp/typing.js` row (PRE-EXISTING cross-cutting; 72 lines; F-5/F-7) |
| 9 | RW-SEQ2-5 | Low | `docs/be/features/mvp/build.md` | 229 | `errorHandler.js` line count `19` → `26` |
| 10 | RW-SEQ2-6 | Low | `docs/be/features/mvp/build.md` | 232–233 | `instanceLock.js` `(small)` → `74 lines`; `logger.js` `(small)` → `17 lines` |
| 11 | RW-SEQ3-1 | Low | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | 194–205 | "13 steps" → "14 steps" (matches SPEC §9.1.1 + BUILD §3.5) |
| 12 | RW-SEQ3-2 | Low | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | 401 | `trigger.js:94-96` → `trigger.js:93-96` (LID↔PN `resolveJid` full call span) |
| 13 | RW-SEQ3-3 | Low | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | 404 | `trigger.js:194-203` → `trigger.js:195-203` (step 4b fetch full KB text) |
| 14 | RW-SEQ3-4 | Low | `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md` | 427 | add parenthetical to hardened-rules.js cite: "(array at L7-12; export at L18)" |
| 15 | AUD-IMPL-AI-1-2 | Medium | `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md` | 305–309 | rewrite PLAN-AI-1 §T6 (CRM store) to cite `src/ai/routes/crm.js:15-207` (no `src/ai/store/entities.js` exists) — verbatim from audit remediation |

### 1.2 Out of scope

- **No source code changes** (`src/**` is read-only for sanity checks only).
- **No `sot/general/*` changes** (PRD-001, FRD-001, Plan, TaskPlan, AuditReport, _SOT_INDEX — those are the supervisor's coordination artifacts; no rework item targets them).
- **No `DecisionLog.md` / `OrchestratorState.md` writes** from the BE; the supervisor writes those.
- **No new feature work** — this is maintenance, not feature or refactor.
- **G-AI-8 (τ_retrieval)** — confirmed non-finding in the cross-cycle audit; deferred to Phase 2 cycle. NOT in scope.

## 2. Dependencies

- **AUD-SOTFIDELITY-CROSS-CYCLE-1** must exist on disk (it does — see `sot/audit/sot-fidelity-cross-cycle.md`, 50 KB, authored 2026-07-12T01:50:51+07:00). ✅
- The 5 affected cycle docs must exist on disk (they do — verified during this run's rehydration).
- `src/` tree (read-only) for sanity checks (verify line numbers / file existence before / after).

## 3. Task breakdown

### T1 — Read every affected file:line BEFORE editing

For each of the 15 fixes, read the file at the cited line and confirm the audit's claim. If the on-disk content differs from the audit's expectation, STOP and report to supervisor (do NOT guess).

### T2 — Apply edits in this order (lowest-risk first)

1. Single-line cite replacements: 1, 2, 3, 6, 9, 11, 12, 13 (8 atomic edits).
2. Line-range expand/tighten with parenthetical: 4, 14 (2 edits).
3. Sweep (RW-SEQ2-1): grep all 4 MVP docs for `§5` references to anti-ban defaults → `§7.2`.
4. Doc-completeness adds: 7, 8 (2 additions).
5. Line-count replacements: 10.
6. Paragraph rewrite (AUD-IMPL-AI-1-2): 15 (use audit's verbatim text).

### T3 — Verify per fix

After each edit, re-read the file at the cited line and confirm the new content matches the expected text. Build a per-fix before/after snippet table.

### T4 — Smoke test (no `src/**` change, but verify nothing else broke)

Run `pnpm test` and confirm output is `114 passed / 1 failed-pre-existing / 3 skipped` (unchanged). Capture the output verbatim.

### T5 — Build record

Write `docs/maintenance/post-run-rework-2026-07-12/build.md` with:
- §1: 15 fixes applied (each with before/after snippet).
- §2: Smoke test output.
- §3: Diff summary (`git diff --stat` if applicable, else per-file line-count delta).
- §4: Confirmation that no `src/**` files were touched.

## 4. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Doc-cite fixes drift in the wrong direction | medium | T1: re-read before edit; T3: re-read after edit; expected text from audit is verbatim. |
| Backend-engineer crosses into `src/**` changes | low | Brief explicitly forbids `src/**` edits. Build record §4 confirms. |
| RW-SEQ2-1 sweep accidentally hits a non-anti-ban `§5` | low | Grep for context (`anti-ban`, `ANTI_BAN`, `defaults`, `defaults.js`) before replacing. |
| AUD-IMPL-AI-1-2 paragraph rewrite doesn't match surrounding structure | low | Use the audit's verbatim remediation text; don't invent prose. |
| `pnpm test` shows drift after docs change | none (docs don't affect tests) | T4 confirms. |

## 5. Verification gate

After T1–T5 complete, the BE emits the §Acknowledgment Contract. The supervisor then dispatches `@audit` (scoped) for a single verification pass:

- `@audit` reads the audit remediation text for each of the 15 fixes.
- `@audit` reads the post-edit file:line for each fix.
- `@audit` confirms exact match (textual or semantic per the audit's spec).
- `@audit` runs `pnpm test` and confirms unchanged.

The scoped audit verdict (PASS / FAIL) determines whether this maintenance cycle closes.

## 6. Definition of done

1. All 15 fixes applied with exact-text match against the audit remediation.
2. No `src/**` files modified.
3. No `sot/general/*` files modified.
4. `pnpm test` output unchanged: `114 passed / 1 failed-pre-existing / 3 skipped`.
5. `docs/maintenance/post-run-rework-2026-07-12/build.md` authored with §1–§4 sections per T5.
6. Scoped audit verdict: PASS.
7. `sot/general/OrchestratorState.open_findings` cleared of all 15 items.
8. `sot/general/AuditReport.md` updated with the maintenance row.
9. `_SOT_INDEX.md` updated with the maintenance artifacts.
