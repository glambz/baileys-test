<!--
owner: @technical-planner
cycle_id: be-typing-indicators-2026-07-10
attempt_id: ATT-SEQ1-TP-1
doc_id: PLAN-TYPING-1
linked_prd_cycle: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_spec: docs/be/features/whatsapp-typing/spec.md (SPEC-TYPING-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001, Sprint 1)
purpose: MIGRATION ARTIFACT — per-cycle Plan that documents the
         implementation steps that were actually taken to ship the
         typing-indicator cycle in this session, in the order they were
         taken. This is an AS-BUILT record (retro-fit), not a forward-
         looking plan. Code is the source of truth.
-->

# Typing Indicator — Plan (`be-typing-indicators-2026-07-10`)

> **Migration artifact.** This Plan is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run (Sprint 1 of [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md)).
> It documents the implementation steps that were **actually taken** to
> ship the typing-indicator feature in this same session, in the order
> they were taken. **Code is the source of truth.**
>
> **Linked upstream**: [`PRD-TYPING-1`](./prd.md) (cycle PRD),
> [`SPEC-TYPING-1`](./spec.md) (cycle SPEC),
> [`PRD-001`](../../../../sot/general/PRD.md) (project PRD),
> [`FRD-001`](../../../../sot/general/FRD.md) (project FRD),
> [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md) (project Plan,
> Batch 1),
> [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md) (project
> TaskPlan, Sprint 1). Per-feature Build evidence lives in
> `docs/be/features/whatsapp-typing/build.md`.

## Document Metadata

```yaml
---
doc_id: PLAN-TYPING-1
plan_id: PLAN-TYPING-1
version: 1.0.0
status: in-progress
created: 2026-07-10
updated: 2026-07-10
author: @technical-planner
attempt_id: ATT-SEQ1-TP-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-typing-indicators-2026-07-10
linked_prd_cycle: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_spec: docs/be/features/whatsapp-typing/spec.md (SPEC-TYPING-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001)
source_versions_covered:
  - "be-typing-indicators-2026-07-10 (just-shipped)"
mode: full
classification: EXISTING_PROJECT
---

linked_frd_features:
  - F-5   # Typing indicator (send)
  - F-7   # Typing indicator (broadcast)
  - F-21  # messages.upsert trigger pipeline (integration surface for trigger)
  - F-40  # Defense-in-depth layers (where trigger typing lives)
linked_prd_requirements:
  - T-FR-1 .. T-FR-9 (PRD-TYPING-1 §4)
source_of_truth:
  utility: src/whatsapp/typing.js
  tests: src/test/typing.test.mjs
  integration_sites:
    - src/controllers/messageController.js
    - src/whatsapp/broadcaster.js
    - src/ai/whatsapp/trigger.js
```

## 1. Goal

Document the six implementation steps that were actually taken in this
session to ship the typing-indicator feature, in the order they were
taken. This is the **as-built** record — not a forward-looking plan.
Per the user's clarification on 2026-07-10T10:45:50+07:00
(`DecisionLog.md` §"2026-07-10T10:45:50"): retro-fit means "migrate
from previous system workflow to the current mavis workflow"; the code
is the source of truth. This Plan is the migration output for the
cycle-level implementation steps.

The typing-indicator cycle shipped with **1 new utility module**
(`src/whatsapp/typing.js`), **3 integration sites** in
single-send (`messageController.js`), broadcast (`broadcaster.js`), and
AI auto-reply (`trigger.js`), and **1 new vitest spec**
(`src/test/typing.test.mjs`) covering the utility exhaustively (10
specs: 5 for `safeSend`, 5 for `startTyping`/`stop`).

## 2. Scope and Boundary

### 2.1 In scope

- The new utility module `src/whatsapp/typing.js` (export `startTyping`,
  internal `safeSend`, `REFRESH_MS = 4_000`, `COMPOSING_PRESENCE =
  'composing'`, `PAUSED_PRESENCE = 'paused'`).
- The integration at `src/controllers/messageController.js:55, 114-116`
  (single-send) — `startTyping` before `antiBan.check`; `stopTyping`
  in `finally`.
- The integration at `src/whatsapp/broadcaster.js:179, 245-247`
  (broadcast) — per-recipient `startTyping` immediately before
  `_sendWithRetry`; `stopTyping` in `finally`; deferred-return flag
  `shouldReturnAfterCatch` after `finally` closes.
- The integration at `src/ai/whatsapp/trigger.js:264, 282, 357-359`
  (AI auto-reply) — `startTyping` immediately before
  `createChatCompletion`; explicit `stopTyping()` in the
  parse-failure `catch` (line 282); `stopTyping()` in `finally` around
  steps 9-12 (line 357-359). The double-call pattern is safe because
  `stop` is idempotent.
- The unit tests at `src/test/typing.test.mjs` (10 specs covering
  `safeSend` × 5 and `startTyping`/`stop` × 5).
- Integration sequencing: the 3 integration sites were added in the
  order `messageController → broadcaster → trigger` (verified by
  reading the git diff of this session).

### 2.2 Out of scope

- **Re-implementation of any feature.** This Plan documents the work
  that was done; the seq 4 SoT-fidelity audit may surface drift, which
  becomes a finding — not a call to rewrite code.
- The other 9 BE features in the AI auto-reply cycle
  (`docs/be/features/{crm-store, kb-ingestion, ai-state-machine,
  ai-whatsapp-trigger, ai-orchestration}`) — these are seq 3
  retro-fit work.
- The pre-cycle MVP features (`auth`, `send`, `broadcast`, `inbox`,
  `antiBan`) — these are seq 2 retro-fit work. The typing-indicator
  cycle's three integration sites (the only code touched in this cycle)
  cite the seq 2 features at their integration boundaries; seq 2 will
  cross-reference the typing-indicator lines to confirm the integration
  sites are consistent with the broader send / broadcast / inbox flows.
- Cross-encoder reranker, NLI entailment, KB auto-tag extraction,
  streaming replies with typing indicators (Phase 2 / Phase 3 per
  README §"Deferred") — not in scope of any shipped cycle, including
  this one.
- FE wiring of the typing indicator. The FE mockup is mock-only per
  `PRD-001 §2.2 NG4`. No FE integration of the indicator exists; the
  indicator is purely a BE → WhatsApp-server concern.

### 2.3 Boundary decisions inherited from upstream artifacts

| ID | Decision | Drives |
|---|---|---|
| D1 | Retro-fit, not re-implementation. Code is the source of truth; this Plan is the as-built record. | Plan body cites `src/<path>:<line>` for every step. |
| D2 | Per-cycle Plans live under `docs/be/features/<feature>/plan.md`. Per-feature Plans are migration outputs; per-cycle Plans are shipped work breakdown. | This file lives at `docs/be/features/whatsapp-typing/plan.md`. |
| D3 | Cycle id = `be-typing-indicators-2026-07-10`. | Cited verbatim throughout. |
| D4 | Single feature = typing indicator. The cross-cutting nature (3 integration sites) is a Plan / SPEC / Build concern; the PRD / SPEC decompose it by integration site. | T3/T4/T5 are the 3 integration sites. |
| D5 | Three integration sites were added in the order `messageController → broadcaster → trigger`. The reverse order (trigger first) was rejected because: (a) the utility is the shared dependency; (b) the broadcast path is the natural extension of single-send; (c) the AI trigger has the most state to set up and benefits from the other two sites being settled. | T3 → T4 → T5 ordering. |
| D6 | Tests are written alongside the utility, not after all three sites. The utility's contract is the cross-cutting invariant (INV-X1 … INV-X6 in SPEC §3); locking it down first means every integration site can be code-reviewed against a known contract. | T6 (tests) is documented as "written alongside T2", not as a separate task at the end. |

## 3. Dependencies

### 3.1 Hard dependencies (must exist before this Plan's tasks)

- **`PRD-001`** (`sot/general/PRD.md`) — defines the project's goals,
  NFRs, and explicitly defers typing-indicator details to seq 1
  (`PRD-001 §8` "Forward-looking note"; `PRD-001 §7 OQ3`).
- **`FRD-001`** (`sot/general/FRD.md`) — captures F-5 (Typing indicator
  integration — send) and F-7 (Typing indicator integration —
  broadcast) with full ACs and `src/<path>:<line>` citations; F-21
  / F-40 carry the trigger-side integration surface.
- **`PLAN-RETROFIT-001`** (`sot/general/Plan.md`) — Batch 1 (seq 1)
  is the retro-fit batch for this cycle; this Plan is the per-cycle
  Plan that Batch 1 mandates.
- **`TaskPlan-RETROFIT-001`** (`sot/general/TaskPlan.md`) — Sprint 1
  (seq 1) is the per-cycle sprint; this Plan fits Sprint 1's
  documentation deliverables.
- **`PRD-TYPING-1`** (`docs/be/features/whatsapp-typing/prd.md`) —
  cycle-level PRD, authored in this session in parallel.
- **`SPEC-TYPING-1`** (`docs/be/features/whatsapp-typing/spec.md`) —
  cycle-level SPEC, authored in this session in parallel. SPEC §3
  pins the cross-cutting invariants (INV-X1 … INV-X6) that T2's
  utility must satisfy.
- The Baileys socket (`src/whatsapp/client.js::wa.sock`) and the
  anti-ban module (`src/whatsapp/antiBan.js`) — both already exist;
  the typing utility integrates with them but does not modify them.
- The 13-step trigger pipeline in `src/ai/whatsapp/trigger.js` (steps
  1–8 pre-LLM, 9 confidence gate, 10 citation grounding, 11 numerical
  consistency, 12 send) — the typing integration wraps steps 7–12.

### 3.2 Parallel/serial relationships

- T1 (design) → T2 (utility impl) — strict serial.
- T3 (single-send integration) → T4 (broadcaster integration) → T5 (AI
  trigger integration) — strict serial by D5.
- T6 (tests) — written alongside T2 (T2 lands first; the test file is
  the cross-cutting-invariant evidence). Each test in T6 locks in one
  invariant, and the integration sites are then reviewed against the
  locked contract. In practice T6's commits landed interleaved with T2
  through T5 as a single-feature TDD loop.

### 3.3 Cycle-level retro-fit context

Per `PLAN-RETROFIT-001 §3 Batch 1`:

- **Goal**: Produce a mavis per-cycle bundle that describes the typing
  indicator exactly as it shipped in this session.
- **Source of truth**: `src/whatsapp/typing.js`,
  `src/test/typing.test.mjs`, and the 3 integration sites listed
  above.
- **Deliverable**: `docs/be/features/whatsapp-typing/{prd.md, spec.md,
  plan.md, build.md}` (this file is `plan.md`).

## 4. Task Breakdown

The cycle shipped as **6 discrete implementation tasks** (T1–T6), in
the order they were taken. Each task records its id, title, goal,
status (done), acceptance criteria, files touched (with line ranges),
and verification (test names from `src/test/typing.test.mjs`).

### T1 — Design the utility API

| Field | Value |
|---|---|
| **id** | T1 |
| **title** | Design the `startTyping(sock, jid) → stop()` utility API |
| **goal** | Decide the function signature, return type (idempotent `stop` closure), refresh cadence, error-swallow policy, no-op preconditions, and the three integration patterns (`try/finally` for single-send, nested `try/finally` with deferred-return for broadcast, explicit-then-`finally` for the trigger). |
| **status** | done |
| **acceptance criteria** | (1) Signature chosen: `startTyping(sock, jid) → stop`. (2) Returned `stop` is idempotent (`stopped` flag). (3) Refresh cadence picked: `REFRESH_MS = 4_000` (rationale: 1–2 s safety margin under Baileys' ~5–6 s server-side auto-clear). (4) All `sendPresenceUpdate` calls are routed through `safeSend`, which no-ops on null `sock` / missing `sendPresenceUpdate` / null `jid` and swallows rejections at debug level. (5) The interval is `unref()`-ed. (6) Three integration patterns chosen and documented: (a) single-send `try/finally`; (b) broadcast nested `try/finally` + deferred-return via `shouldReturnAfterCatch`; (c) trigger explicit-then-`finally` for parse-failure lockstep with `transitionChatMode`. |
| **files touched** | None — design step only. Captured in `PRD-TYPING-1 §6` and `SPEC-TYPING-1 §3`. |
| **verification** | `PRD-TYPING-1 §6` (the call-flow diagram), `SPEC-TYPING-1 §3` (INV-X1 … INV-X6). |

### T2 — Implement the `typing.js` utility

| Field | Value |
|---|---|
| **id** | T2 |
| **title** | Implement `src/whatsapp/typing.js` (the `startTyping` utility) |
| **goal** | Build the shared utility module that all three integration sites consume. Locks the invariants INV-X1 … INV-X6 (SPEC §3) in code. |
| **status** | done |
| **acceptance criteria** | (1) Module exports `startTyping`. (2) `_internal` re-exports `safeSend`, `REFRESH_MS`, `COMPOSING_PRESENCE`, `PAUSED_PRESENCE` for test access. (3) `safeSend` checks `sock`, `sendPresenceUpdate`, `jid` before invoking; swallows rejections at debug level. (4) `startTyping` fires `'composing'` synchronously (microtask via `Promise.resolve().then`), arms `setInterval(REFRESH_MS)`, calls `interval.unref()` when available, returns a `stop` closure that is guarded by a `stopped` flag and emits `'paused'` on the first call only. |
| **files touched** | `src/whatsapp/typing.js:1-72` (new file, 72 lines) |
| **verification** | Unit tests written in T6 (`src/test/typing.test.mjs:38-71` for `safeSend`, `src/test/typing.test.mjs:82-157` for `startTyping`/`stop`). All 10 specs pass. |

### T3 — Integrate into `messageController.js` (single-send)

| Field | Value |
|---|---|
| **id** | T3 |
| **title** | Wire `startTyping`/`stopTyping` into `POST /api/messages/send` |
| **goal** | First integration site. The recipient sees "typing…" for the entire anti-ban-throttle-then-send window of a single-send request. |
| **status** | done |
| **acceptance criteria** | (1) `const stopTyping = startTyping(wa.sock, jid)` called inside the outer `try` block, **before** `antiBan.check` and the throttle wait, **after** the `wa.isConnected()` guard. (2) The inner `try { ... } finally { stopTyping(); }` covers every exit path: 200, 429, 503 (wait-then-not-connected), unexpected `sendMessage` rejection bubbled to `next(err)`. (3) The outer `catch` (line 117) routes to `next(err)`; the inner `finally` still runs `stopTyping()` before that. (4) The `wa.isConnected()` guard at line 38 throws 503 BEFORE `startTyping` is called — so the indicator does not start when the socket is null. |
| **files touched** | `src/controllers/messageController.js:6` (import), `src/controllers/messageController.js:55` (start), `src/controllers/messageController.js:114-116` (stop in `finally`) |
| **verification** | `grep -n 'startTyping\|stopTyping' src/controllers/messageController.js` → lines 55, 115. Unit tests in `src/test/typing.test.mjs` cover the utility; integration evidence is the line cites themselves (controller-level wiring is too coupled to `wa.sock` and `antiBan` to unit-test in isolation — see SPEC §4.A.7). |

### T4 — Integrate into `broadcaster.js` (per-recipient loop)

| Field | Value |
|---|---|
| **id** | T4 |
| **title** | Wire `startTyping`/`stopTyping` into `Broadcaster._tick` per-recipient loop |
| **goal** | Second integration site. The recipient sees "typing…" for the actual `_sendWithRetry` window only (NOT across the inter-recipient anti-ban throttle wait — see NG-T4). The transient branch's deferred-return-after-finally pattern (`shouldReturnAfterCatch`) is the design choice that makes this work. |
| **status** | done |
| **acceptance criteria** | (1) `const stopTyping = startTyping(wa.sock, recipient.jid)` at line 179, **after** the anti-ban `skip`/`wait` gates (lines 149–170) and **immediately before** the `try { try { ... } catch { ... } } finally { ... }` block that wraps `_sendWithRetry`. (2) `let shouldReturnAfterCatch = false` (line 180) declared BEFORE the outer `try`. (3) Inner `catch` sets `shouldReturnAfterCatch = true` ONLY for the transient branch (line 233); terminal and `NOT_CONNECTED` branches fall through to "continue processing". (4) `finally` (lines 245–247) calls `stopTyping()` BEFORE the deferred-return check at line 248. (5) `if (shouldReturnAfterCatch) return;` at lines 248–250 runs AFTER the `finally` closes (JS guarantee). (6) Indicator is OFF between recipients — `wait` branch (line 161–170) returns BEFORE `startTyping` is reached. |
| **files touched** | `src/whatsapp/broadcaster.js:9` (import), `src/whatsapp/broadcaster.js:179` (start), `src/whatsapp/broadcaster.js:245-247` (stop in `finally`) |
| **verification** | `grep -n 'startTyping\|stopTyping' src/whatsapp/broadcaster.js` → lines 179, 246. Integration evidence: `shouldReturnAfterCatch` flag pattern + `finally`-then-return ordering; see SPEC §5.B.1 and §5.B.4 for the wiring diagram. Unit tests in `src/test/typing.test.mjs` cover the utility's `stop` idempotency (INV-X1), which is the contract that makes the broadcast's two-call safety free (one in `finally`, one … actually broadcast has one `stopTyping` site; idempotency is the safety net for any future second-call site). |

### T5 — Integrate into `trigger.js` (AI auto-reply pipeline)

| Field | Value |
|---|---|
| **id** | T5 |
| **title** | Wire `startTyping`/`stopTyping` into `processInboundMessage` (13-step trigger) |
| **goal** | Third integration site. The recipient sees "typing…" for the LLM + parse + gates + send window of an AI auto-reply. The asymmetric stop pattern (explicit stop in parse-failure `catch` + outer `finally` for post-LLM gates) makes the flip to `human_pending_flag` and the indicator disappearance happen in lockstep, not 200 ms apart. |
| **status** | done |
| **acceptance criteria** | (1) `const stopTyping = startTyping(sock, chatId)` at line 264, immediately before `createChatCompletion` (line 268), after the chat-mode / settings / compose / retrieval / turbo-cutoff gates (steps 1–5) and the user-prompt construction (step 6). (2) Parse-failure `catch` (line 281) calls `stopTyping()` EXPLICITLY at line 282 BEFORE `transitionChatMode` (line 284) and `audit.write` (line 286). (3) Outer `try { ... } finally { stopTyping(); }` (lines 302–359) wraps steps 9 (confidence gate), 11 (numerical consistency), and 12 (send), covering every return path inside those steps. (4) Calling `stopTyping()` twice is safe — INV-X1 (idempotent `stop`). (5) Indicator is NEVER started on the early-return paths: self-echo (81-83), status@broadcast (85-87), empty body (98-100), `aiMode ∈ {human, human_pending_flag}` (161-163), `auto_reply_disabled` (167-169), `retrievalScore < TAU_TURBO` (206-212). |
| **files touched** | `src/ai/whatsapp/trigger.js:29` (import), `src/ai/whatsapp/trigger.js:264` (start), `src/ai/whatsapp/trigger.js:282` (explicit stop on parse failure), `src/ai/whatsapp/trigger.js:357-359` (stop in `finally`) |
| **verification** | `grep -n 'startTyping\|stopTyping' src/ai/whatsapp/trigger.js` → lines 264, 282, 358. Integration evidence: the explicit-stop-then-`finally` pattern is documented in SPEC §6.C.1 and §6.C.4. Idempotent stop test (`src/test/typing.test.mjs:141-151`) is the contract that makes the double-call safe. |

### T6 — Write the unit tests (`src/test/typing.test.mjs`)

| Field | Value |
|---|---|
| **id** | T6 |
| **title** | Author the vitest spec covering `safeSend` and `startTyping`/`stop` exhaustively |
| **goal** | Lock the cross-cutting invariants (INV-X1 … INV-X6) in unit tests so every integration site can be reviewed against a known contract. The tests are the verification that the utility honours the PRD §6 call-flow diagram and the SPEC §3 invariants. |
| **status** | done |
| **acceptance criteria** | (1) 10 specs total: 5 for `safeSend`, 5 for `startTyping`/`stop`. (2) `safeSend` specs cover: calls the socket; no-op on null socket; no-op on missing `sendPresenceUpdate`; no-op on null `jid`; swallows rejections. (3) `startTyping`/`stop` specs cover: emits `'composing'` immediately; refreshes on the `REFRESH_MS` cadence; `stop()` emits `'paused'` and clears the interval; `stop()` is idempotent; returns a no-op when the socket is null. (4) Tests use `vi.useFakeTimers` for the cadence test and `vi.advanceTimersByTime` to cross the interval boundary deterministically. (5) Microtask drain via `await Promise.resolve()` is used where `safeSend`'s dispatch matters (since `safeSend` fires the actual call as a microtask). |
| **files touched** | `src/test/typing.test.mjs:1-158` (new file, 158 lines) |
| **verification** | Run `pnpm test src/test/typing.test.mjs`. All 10 specs pass: `whatsapp/typing — safeSend > calls sock.sendPresenceUpdate with the given type and jid`; `… is a no-op when the socket is null`; `… is a no-op when sendPresenceUpdate is missing`; `… is a no-op when jid is missing`; `… swallows rejections from sendPresenceUpdate`; `whatsapp/typing — startTyping / stop > emits composing immediately on start`; `… refreshes composing on the REFRESH_MS cadence`; `… stop() emits paused and clears the interval`; `… stop() is idempotent`; `… returns a no-op when the socket is null`. |

## 5. Integration Sequencing

The 3 integration sites were added in this order (verified by reading
the diff in this session):

```
T3 (single-send)  →  T4 (broadcast)  →  T5 (AI trigger)
     ↓                   ↓                    ↓
messageController  broadcaster          trigger.js
   :55, 115         :179, 246          :264, 282, 358
```

**Rationale (recorded in D5):**

1. **T3 first** (single-send) — simplest control flow (linear
   `try/finally` covering one of 200/429/503/unexpected-throw). It
   proves the utility + the `try/finally` pattern with the smallest
   code surface.
2. **T4 second** (broadcast) — adds complexity (per-recipient loop,
   deferred-return flag for the transient branch). Building on the
   working single-send pattern, the broadcast's `try/finally` extends
   to a nested `try { try { ... } catch { ... } } finally { ... }` so
   the `shouldReturnAfterCatch` flag can fire `stopTyping()` AND exit
   the loop without clobbering the bookkeeping.
3. **T5 third** (AI trigger) — most complex (explicit stop in
   parse-failure `catch` + outer `finally` around 4 independent
   `return` paths; double-call pattern is safe because of INV-X1).
   Building on both working integrations, the trigger's pattern is a
   natural extension: the explicit early-stop is "do what `finally`
   does, but earlier so the indicator stops in lockstep with the
   `human_pending_flag` flip", and the outer `finally` is the
   safety-net for the post-LLM gate stack.

The reverse order was rejected because: (a) the utility must exist
before any integration, so the order is T1 → T2 → (T3, T4, T5); (b)
among T3/T4/T5, the simplest first (D5) is the cleanest TDD path.

## 6. Cross-References

- **Cycle PRD**: [`docs/be/features/whatsapp-typing/prd.md`](./prd.md)
  (PRD-TYPING-1)
- **Cycle SPEC**: [`docs/be/features/whatsapp-typing/spec.md`](./spec.md)
  (SPEC-TYPING-1)
- **Cycle Build** (forthcoming): `docs/be/features/whatsapp-typing/build.md`
- **Project PRD**: [`sot/general/PRD.md`](../../../../sot/general/PRD.md)
  (PRD-001)
- **Project FRD**: [`sot/general/FRD.md`](../../../../sot/general/FRD.md)
  (FRD-001 — see F-5, F-7, F-21, F-40)
- **Project Plan**: [`sot/general/Plan.md`](../../../../sot/general/Plan.md)
  (PLAN-RETROFIT-001 — see §3 Batch 1)
- **Project TaskPlan**: [`sot/general/TaskPlan.md`](../../../../sot/general/TaskPlan.md)
  (TaskPlan-RETROFIT-001 — see §2 Sprint 1)
- **Source-of-truth external evidence**:
  - `src/whatsapp/typing.js` (utility)
  - `src/test/typing.test.mjs` (unit tests)
  - `src/controllers/messageController.js` (single-send site)
  - `src/whatsapp/broadcaster.js` (broadcast site)
  - `src/ai/whatsapp/trigger.js` (AI trigger site)

## 7. Validation Rules (Auditor Checks)

This Plan passes the auditor checks if:

- [ ] **Metadata**: every metadata field in the YAML front matter is
      filled (`doc_id`, `version`, `status`, `created`, `updated`,
      `author`, `attempt_id`, `run_id`, `cycle_id`,
      `linked_prd_cycle`, `linked_spec`, `linked_prd_project`,
      `linked_frd_project`, `linked_plan_project`,
      `linked_task_plan_project`, `source_versions_covered`,
      `linked_frd_features`, `linked_prd_requirements`,
      `source_of_truth`). No `TBD`.
- [ ] **6 discrete tasks**: T1 design, T2 utility, T3 single-send, T4
      broadcaster, T5 trigger, T6 tests. Each task has id, title,
      goal, status (done), acceptance criteria, files touched with
      line ranges, verification (test names from
      `src/test/typing.test.mjs`).
- [ ] **Integration sequencing**: §5 documents the order
      `messageController → broadcaster → trigger`, with the rationale
      recorded (D5). The line numbers cited in §4 (T3/T4/T5) match
      the integration order.
- [ ] **Cross-references**: PRD-TYPING-1, SPEC-TYPING-1, PRD-001,
      FRD-001, PLAN-RETROFIT-001, TaskPlan-RETROFIT-001 are all
      cited verbatim and resolve to existing files.
- [ ] **No new product scope**: the cycle shipped is documented; no
      forward-looking tasks are added. Drift surfaced by the seq 4
      audit is a finding — not a call to rewrite code.
- [ ] **Test coverage**: every T2/T3/T4/T5 acceptance criterion has a
      test name from `src/test/typing.test.mjs` (for INV-X1 … INV-X6)
      or a `grep` verification (for the integration site line cites).
- [ ] **Integration sequencing matches the cycle id's implementation
      order**: the as-built order is T1 → T2 → T3 → T4 → T5, with T6
      tests interleaved across T2–T5 as a TDD loop.

## 8. Notes

- **Why the test file is T6 and not a separate task at the end**: the
  utility's contract (INV-X1 … INV-X6) is the cross-cutting invariant
  every integration site relies on. Writing the tests alongside T2
  (the utility) means T3/T4/T5 can be code-reviewed against a known
  contract; T6 is documented as a separate task for traceability, but
  in practice its commits landed interleaved with T2 through T5.
- **Why three different `try/finally` patterns**: each integration
  site's control flow is different (SPEC §7 cross-site invariants
  table). The single-send is linear (one `finally`); the broadcast
  needs a deferred-return flag for the transient branch; the trigger
  needs an explicit early-stop for parse failure so the indicator
  stops in lockstep with the `human_pending_flag` flip. Documenting
  three patterns explicitly means a future developer adding a fourth
  site can choose deliberately.
- **Why the utility is its own file**: the PRD §2 and SPEC §3 both
  record that the utility is the cross-cutting invariant. Splitting
  it out from the integration sites means (a) the test surface is
  small (no `wa.sock` or `antiBan` mock required), (b) the contract
  is reviewable in isolation, (c) the next integration site just
  imports `startTyping` and follows the pattern table.
- **What "done" looked like for each task**:
  - T1: design committed to PRD §6 + SPEC §3.
  - T2: file passes `pnpm test src/test/typing.test.mjs` (T6's
    `safeSend` × 5 + `startTyping` × 5 = 10 specs green).
  - T3: `grep -n 'startTyping\|stopTyping' src/controllers/messageController.js`
    → 55, 115.
  - T4: `grep -n 'startTyping\|stopTyping' src/whatsapp/broadcaster.js`
    → 179, 246; `shouldReturnAfterCatch` flag pattern + `finally`-then-
    return ordering correct.
  - T5: `grep -n 'startTyping\|stopTyping' src/ai/whatsapp/trigger.js`
    → 264, 282, 358; explicit-stop-then-`finally` pattern correct.
  - T6: `pnpm test src/test/typing.test.mjs` exits 0; all 10 specs
    green.
- **Anti-patterns (do not)**:
  - Do not add a new integration site without picking a pattern from
    SPEC §7's cross-site table deliberately.
  - Do not call `startTyping` and forget `stopTyping` — every site
    uses `try/finally` (or equivalent) to guarantee the stop fires.
  - Do not block graceful shutdown by skipping `interval.unref()` —
    the active indicator must not keep the event loop alive (SPEC
    §3.4 INV-X4).

## 9. Change Log

| Version | Date       | Author             | Change |
|---------|------------|--------------------|--------|
| 1.0.0   | 2026-07-10 | @technical-planner | Initial draft. Cycle-level Plan for `be-typing-indicators-2026-07-10`. Documents the 6 implementation steps that were actually taken to ship the typing-indicator cycle in this session, in the order they were taken. Cites PRD-TYPING-1, SPEC-TYPING-1 (cycle), PRD-001, FRD-001, PLAN-RETROFIT-001, TaskPlan-RETROFIT-001 (project). attempt_id: `ATT-SEQ1-TP-1`. doc_id: `PLAN-TYPING-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. |

---

**Next step after this Plan lands**: the parallel seq 1 dispatch for
`@be-engineer` (`ATT-SEQ1-BE-1`) authors `docs/be/features/whatsapp-typing/build.md`
anchored against this Plan's §4 (task breakdown), §5 (integration
sequencing), and §6 (cross-references). Round 2 (Audit) then verifies
PRD-TYPING-1 / SPEC-TYPING-1 / this Plan / the Build record agree
against `src/whatsapp/typing.js`, `src/test/typing.test.mjs`, and the
3 integration sites.