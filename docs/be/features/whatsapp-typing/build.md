<!--
owner: @be-engineer
cycle_id: be-typing-indicators-2026-07-10
attempt_id: ATT-SEQ1-BE-1
doc_id: BUILD-TYPING-1
linked_prd: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_spec: docs/be/features/whatsapp-typing/spec.md (SPEC-TYPING-1)
linked_plan: docs/be/features/whatsapp-typing/plan.md (PLAN-TYPING-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
purpose: MIGRATION ARTIFACT — per-feature Build record for the
         typing-indicator cycle. Documents the code as it shipped: the
         1 new utility module, the 1 new test file, and the 3 modified
         integration sites. Code is the source of truth. The Build
         record is the as-built evidence — NOT a forward-looking scope.
-->

# Typing Indicator — Build (`be-typing-indicators-2026-07-10`)

> **Migration artifact.** This Build record is the **as-built evidence**
> for the typing-indicator cycle shipped in the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run. It documents the files that were created and modified in this
> session, the exact changes (with line cites and code excerpts), the
> unit-test names that prove the build is correct, and the verification
> command that was run. **Code is the source of truth.**
>
> **Linked upstream**:
> [`PRD-TYPING-1`](./prd.md) (cycle PRD),
> [`SPEC-TYPING-1`](./spec.md) (cycle SPEC),
> [`PLAN-TYPING-1`](./plan.md) (cycle Plan),
> [`PRD-001`](../../../../sot/general/PRD.md) (project PRD),
> [`FRD-001`](../../../../sot/general/FRD.md) (project FRD — F-5, F-7,
> F-21, F-40).

## Document Metadata

```yaml
---
doc_id: BUILD-TYPING-1
build_id: BUILD-TYPING-1
version: 1.0.0
status: in-review
created: 2026-07-10
updated: 2026-07-10
author: @be-engineer
attempt_id: ATT-SEQ1-BE-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-typing-indicators-2026-07-10
linked_prd_cycle: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_spec: docs/be/features/whatsapp-typing/spec.md (SPEC-TYPING-1)
linked_plan: docs/be/features/whatsapp-typing/plan.md (PLAN-TYPING-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
classification: EXISTING_PROJECT
mode: full
source_of_truth:
  utility: src/whatsapp/typing.js
  tests: src/test/typing.test.mjs
  integration_sites:
    - src/controllers/messageController.js
    - src/whatsapp/broadcaster.js
    - src/ai/whatsapp/trigger.js
files_created:
  - src/whatsapp/typing.js       # new utility module (72 lines)
  - src/test/typing.test.mjs     # new vitest spec (158 lines)
files_modified:
  - src/controllers/messageController.js  # single-send integration
  - src/whatsapp/broadcaster.js            # broadcast integration
  - src/ai/whatsapp/trigger.js             # AI auto-reply integration
verification_command: "pnpm test -- src/test/typing.test.mjs"
verification_result:
  test_files: 1
  tests_passed: 10
  tests_failed: 0
  tests_skipped: 0
---
```

## 1. Purpose

`PRD-TYPING-1` is the cycle intent. `SPEC-TYPING-1` is the contract
decomposed per integration site. `PLAN-TYPING-1` is the as-built
sequence of 6 implementation tasks (T1–T6). **This Build record
documents what landed in code**, with:

- **File-level sections** (one per file touched).
- **Per-section: exact code excerpts (not "added typing")** with
  src-line ranges.
- **Per-section: the test(s) that prove the change** (named by the
  vitest `describe > it` path).
- **A Verification section** with the actual test command run, the
  pass count, and the explicit list of all 10 test names.

This record exists so the seq 4 SoT-fidelity audit can diff the
`PRD-TYPING-1` FRs, the `SPEC-TYPING-1` ACs, the `PLAN-TYPING-1` tasks,
and the actual code by reading one document — this one.

## 2. Files Created (2)

### 2.1 NEW — `src/whatsapp/typing.js` (72 lines, the shared utility)

This is the single new module created in the typing-indicator cycle.
It exports `startTyping(sock, jid)` (the cross-cutting helper consumed
by all three integration sites) plus an `_internal` surface for
unit-test access.

#### Change

The entire file is new (72 lines). It contains:

| Region | Lines | What it does | Cites |
|---|---|---|---|
| Constants | `typing.js:29-31` | `COMPOSING_PRESENCE = 'composing'`, `PAUSED_PRESENCE = 'paused'`, `REFRESH_MS = 4_000`. | SPEC-TYPING-1 §2 "Locked values" |
| `safeSend(sock, jid, type)` | `typing.js:33-45` | Defensive guard on `sock` / `sendPresenceUpdate` / `jid`; fire-and-forget via `Promise.resolve().then(...)`; swallows rejections at `logger.debug` level. | SPEC-TYPING-1 §3 INV-X2; PRD-TYPING-1 §4 T-FR-1 |
| `startTyping(sock, jid)` body | `typing.js:47-58` | Fires first `'composing'` immediately (line 51); arms `setInterval(REFRESH_MS)` that re-emits `'composing'` (lines 53-56); calls `interval.unref()` when available (line 58). (The `stop` closure returned by `startTyping` is at `typing.js:60-65`, cited in the row below.) | SPEC-TYPING-1 §3 INV-X3 + INV-X4 |
| `stop` closure | `typing.js:60-65` | Idempotent: guarded by `stopped` flag (lines 61-62); clears interval and emits `'paused'` on first call only. | SPEC-TYPING-1 §3 INV-X1 + INV-X5 |
| Module exports | `typing.js:68-72` | `startTyping` (the public surface) and `_internal: { safeSend, REFRESH_MS, COMPOSING_PRESENCE, PAUSED_PRESENCE }` for test access. | — |

#### Code excerpt (the whole `startTyping` + `safeSend` body)

```javascript
// src/whatsapp/typing.js:29-66

const COMPOSING_PRESENCE = 'composing';
const PAUSED_PRESENCE = 'paused';
const REFRESH_MS = 4_000;

function safeSend(sock, jid, type) {
  if (!sock || typeof sock.sendPresenceUpdate !== 'function') return;
  if (!jid) return;
  // Fire-and-forget. The send layer must not block on a presence packet.
  Promise.resolve()
    .then(() => sock.sendPresenceUpdate(type, jid))
    .catch((err) => {
      logger.debug(
        { err: err && err.message, jid, type },
        'sendPresenceUpdate failed (ignored)'
      );
    });
}

function startTyping(sock, jid) {
  let stopped = false;
  // Fire the first composing state immediately so the user sees the
  // indicator as soon as we know we're going to send.
  safeSend(sock, jid, COMPOSING_PRESENCE);

  const interval = setInterval(() => {
    if (stopped) return;
    safeSend(sock, jid, COMPOSING_PRESENCE);
  }, REFRESH_MS);
  // Do not keep the event loop alive solely for the indicator.
  if (typeof interval.unref === 'function') interval.unref();

  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    safeSend(sock, jid, PAUSED_PRESENCE);
  };
}
```

#### Tests that prove this file is correct

Every test in `src/test/typing.test.mjs` exercises this module (10 of
10 specs). The mapping:

| Test (`describe > it`) | File / Lines | What it proves |
|---|---|---|
| `whatsapp/typing — safeSend > calls sock.sendPresenceUpdate with the given type and jid` | `typing.test.mjs:38-46` | INV-X6 — first emit arrives with the right args. |
| `whatsapp/typing — safeSend > is a no-op when the socket is null` | `typing.test.mjs:48-50` | INV-X2 — null sock guard. |
| `whatsapp/typing — safeSend > is a no-op when sendPresenceUpdate is missing` | `typing.test.mjs:52-54` | INV-X2 — missing-method guard. |
| `whatsapp/typing — safeSend > is a no-op when jid is missing` | `typing.test.mjs:56-61` | INV-X2 — null jid guard. |
| `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate` | `typing.test.mjs:63-71` | INV-X2 — rejection swallow at debug level. |
| `whatsapp/typing — startTyping / stop > emits composing immediately on start` | `typing.test.mjs:82-93` | INV-X6 — immediate first emit. |
| `whatsapp/typing — startTyping / stop > refreshes composing on the REFRESH_MS cadence` | `typing.test.mjs:95-118` | INV-X3 — 4 s refresh cadence. |
| `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval` | `typing.test.mjs:120-139` | INV-X5 — `stop` semantics. |
| `whatsapp/typing — startTyping / stop > stop() is idempotent` | `typing.test.mjs:141-151` | INV-X1 — idempotent guard. |
| `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null` | `typing.test.mjs:153-157` | INV-X2 — no-op start/stop on null sock. |

#### Verification line range

`src/whatsapp/typing.js:1-72` — the complete file, 72 lines.

---

### 2.2 NEW — `src/test/typing.test.mjs` (158 lines, the vitest spec)

The single new test file. Covers the utility exhaustively (10 specs: 5
for `safeSend`, 5 for `startTyping`/`stop`).

#### Change

The entire file is new (158 lines). It contains:

| Region | Lines | What it tests |
|---|---|---|
| Imports + helpers (`makeFakeSock`, `drainMicrotasks`) | `typing.test.mjs:20-35` | Vi fn-based fake socket, microtask drain helper. |
| `describe('whatsapp/typing — safeSend', …)` block | `typing.test.mjs:37-72` | 5 specs: arg-passthrough; no-op on null sock / missing method / null jid; rejection swallow. |
| `describe('whatsapp/typing — startTyping / stop', …)` block | `typing.test.mjs:74-157` | 5 specs: immediate first emit; cadence; `stop` emits `paused` and clears interval; idempotent; no-op on null sock. Uses `vi.useFakeTimers` / `vi.advanceTimersByTime`. |

#### The 10 test names (verbatim, in execution order)

1. `whatsapp/typing — safeSend > calls sock.sendPresenceUpdate with the given type and jid`
2. `whatsapp/typing — safeSend > is a no-op when the socket is null`
3. `whatsapp/typing — safeSend > is a no-op when sendPresenceUpdate is missing`
4. `whatsapp/typing — safeSend > is a no-op when jid is missing`
5. `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate`
6. `whatsapp/typing — startTyping / stop > emits composing immediately on start`
7. `whatsapp/typing — startTyping / stop > refreshes composing on the REFRESH_MS cadence`
8. `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval`
9. `whatsapp/typing — startTyping / stop > stop() is idempotent`
10. `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null`

#### Code excerpt (the cadence test — the most behaviorally rich spec)

```javascript
// src/test/typing.test.mjs:95-118
it('refreshes composing on the REFRESH_MS cadence', async () => {
  const sock = makeFakeSock();
  startTyping(sock, '12345@s.whatsapp.net');
  // Initial call dispatched as a microtask.
  await Promise.resolve();
  expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
  // Just under one interval: no new call.
  vi.advanceTimersByTime(_internal.REFRESH_MS - 1);
  expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
  // Cross the interval boundary: 1 more call.
  vi.advanceTimersByTime(1);
  // Drain the microtask from the interval's safeSend dispatch.
  await Promise.resolve();
  expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(2);
  // Several more intervals.
  for (let i = 0; i < 3; i += 1) {
    vi.advanceTimersByTime(_internal.REFRESH_MS);
    await Promise.resolve();
  }
  expect(sock.sendPresenceUpdate.mock.calls.length).toBeGreaterThanOrEqual(4);
  for (const call of sock.sendPresenceUpdate.mock.calls) {
    expect(call[0]).toBe('composing');
  }
});
```

#### Tests that prove this file itself is correct

The vitest runner is the proof — see the **Verification** section
below for the actual command and output (all 10 specs pass).

#### Verification line range

`src/test/typing.test.mjs:1-158` — the complete file, 158 lines.

---

## 3. Files Modified (3)

### 3.1 MODIFIED — `src/controllers/messageController.js` (single-send)

Integration site A. Adds `startTyping`/`stopTyping` around the
anti-ban-then-send-and-inbox-record window of a single `POST
/api/messages/send` request.

#### Change summary

Three additions to the existing file:

| ID | What | Lines |
|---|---|---|
| M-1 | **New import**: `const { startTyping } = require('../whatsapp/typing');` | `messageController.js:6` |
| M-2 | **Start indicator**: `const stopTyping = startTyping(wa.sock, jid);` placed inside the outer `try`, **after** the `wa.isConnected()` guard (lines 38-44) and **before** `antiBan.check(jid, contentHash)`. | `messageController.js:52-55` |
| M-3 | **Stop indicator in `finally`**: `stopTyping();` placed inside `finally { … }` of the inner `try { ... }` block, so it fires on every exit path (200, 429, 503-from-wait, 503-from-NotConnected, unexpected `sendMessage` rejection bubbled via `next(err)`). | `messageController.js:114-116` |

#### Code excerpt — the import

```javascript
// src/controllers/messageController.js:6
const { startTyping } = require('../whatsapp/typing');
```

#### Code excerpt — start

```javascript
// src/controllers/messageController.js:52-57
    // Show "typing…" for the whole send window. startTyping refreshes
    // every 4s so the indicator survives the anti-ban throttle wait.
    // stopTyping is wired via try/finally so it always fires.
    const stopTyping = startTyping(wa.sock, jid);

    try {
      const check = antiBan.check(jid, contentHash);
```

#### Code excerpt — stop in `finally`

```javascript
// src/controllers/messageController.js:114-116
    } finally {
      stopTyping();
    }
```

#### Tests that prove this change

This site has **no dedicated unit test** in `src/test/typing.test.mjs`
(the controller-level wiring is too tightly coupled to `wa.sock` and
`antiBan` to unit-test in isolation — see SPEC-TYPING-1 §4.A.7). The
integration evidence is the line cite itself plus the utility's unit
tests, which prove the `startTyping`/`stopTyping` contract that the
controller relies on:

| Evidence | Test name (proof the contract holds) |
|---|---|
| `startTyping` fires `'composing'` immediately and refreshes every 4 s | `whatsapp/typing — startTyping / stop > emits composing immediately on start`, `… refreshes composing on the REFRESH_MS cadence` |
| `stop()` is idempotent and fires `'paused'` | `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval`, `… stop() is idempotent` |
| Network rejection from `sendPresenceUpdate` does NOT propagate (typing never breaks a send) | `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate` |
| Socket is null → no-op (defensive — and the controller's `wa.isConnected()` guard at line 38 short-circuits before `startTyping` is reached anyway) | `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null`, `… is a no-op when the socket is null` |

#### Verification line range

`src/controllers/messageController.js:6, 52-55, 114-116`.

---

### 3.2 MODIFIED — `src/whatsapp/broadcaster.js` (broadcast per-recipient loop)

Integration site B. Adds per-recipient `startTyping`/`stopTyping` around
`_sendWithRetry`, with a deferred-return flag (`shouldReturnAfterCatch`)
that lets the transient-error branch fire `stopTyping()` AND exit the
loop without clobbering the per-recipient bookkeeping.

#### Change summary

| ID | What | Lines |
|---|---|---|
| M-4 | **New import**: `const { startTyping } = require('./typing');` (note the `./typing` form — same module as in messageController, sibling directory). | `broadcaster.js:9` |
| M-5 | **Start indicator (per-recipient)**: `const stopTyping = startTyping(wa.sock, recipient.jid);` **after** the anti-ban `skip`/`wait` gates (lines 149-170) and **immediately before** the nested `try { try { ... } catch { ... } } finally { ... }` block wrapping `_sendWithRetry` (lines 181-247). The `wait` branch (lines 161-170) returns BEFORE this line, so the indicator is OFF across the inter-recipient anti-ban throttle (see PRD-TYPING-1 §3.2 NG-T4). | `broadcaster.js:179` |
| M-6 | **Deferred-return flag**: `let shouldReturnAfterCatch = false;` declared BEFORE the outer `try` (line 181). | `broadcaster.js:180` |
| M-7 | **Transient branch sets the flag**: `shouldReturnAfterCatch = true;` inside the inner `catch`, ONLY for the transient status-code branch (NOT for terminal codes or `NOT_CONNECTED`). | `broadcaster.js:229-233` (flag flip specifically at 233) |
| M-8 | **Stop indicator in `finally`**: `stopTyping();` inside the outer `finally` block — fires on EVERY per-recipient exit path (success, terminal, NOT_CONNECTED, transient — the last because the flag only defers the return, not the stop). | `broadcaster.js:245-247` |
| M-9 | **Deferred return AFTER the `finally`**: `if (shouldReturnAfterCatch) { return; }` runs AFTER the `finally` closes (JS guarantee), so the indicator stops before the worker exits the loop. | `broadcaster.js:248-250` |

#### Code excerpt — the import

```javascript
// src/whatsapp/broadcaster.js:9
const { startTyping } = require('./typing');
```

#### Code excerpt — start, flag declaration, and the deferred-return pattern

```javascript
// src/whatsapp/broadcaster.js:176-254 (relevant slice)
      // Per-recipient typing indicator. Scoped to this single send so
      // the indicator is on only for the actual message, not across
      // the inter-recipient throttle wait.
      const stopTyping = startTyping(wa.sock, recipient.jid);
      let shouldReturnAfterCatch = false;
      try {
        try {
          const sent = await this._sendWithRetry(
            active,
            recipient.jid,
            active.message
          );
          // ... (success path: inbox.markLogged, inbox.record, status='sent') ...
        } catch (err) {
          // ... (terminal / transient / NOT_CONNECTED branches) ...
          } else if (code && TRANSIENT_STATUS_CODES.has(code)) {
            active._queue.unshift(recipient);
            active._nextAt = Date.now() + 60_000;
            this._scheduleTick(60_000);
            shouldReturnAfterCatch = true;
          }
          // ...
        }
      } finally {
        stopTyping();
      }
      if (shouldReturnAfterCatch) {
        return;
      }
      active._finalizeRecipient(recipient);
      active._nextAt = Date.now() + 1_000;
      this._scheduleTick(1_000);
      return;
```

#### Tests that prove this change

| Evidence | Test name (proof the contract holds) |
|---|---|
| `stop()` is idempotent — defense-in-depth for the deferred-return pattern | `whatsapp/typing — startTyping / stop > stop() is idempotent` |
| `stop()` always fires `'paused'` and clears the interval, regardless of how many times it's called | `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval` |
| `startTyping` fires `'composing'` immediately so the indicator is on before any possible `sendPresenceUpdate` error | `whatsapp/typing — startTyping / stop > emits composing immediately on start` |
| `safeSend` is defensive against null socket / missing method / null jid | `whatsapp/typing — safeSend > is a no-op when the socket is null`, `… is a no-op when sendPresenceUpdate is missing`, `… is a no-op when jid is missing` |

#### Verification line range

`src/whatsapp/broadcaster.js:9, 179-180, 229-233, 245-250`.

---

### 3.3 MODIFIED — `src/ai/whatsapp/trigger.js` (AI auto-reply pipeline)

Integration site C. Adds `startTyping`/`stopTyping` around the LLM +
parse + post-LLM-gates + send window of the 13-step
`processInboundMessage` pipeline. Uses an **asymmetric stop pattern**:
explicit `stopTyping()` in the parse-failure `catch` (so the indicator
disappears in lockstep with the `transitionChatMode` to
`human_pending_flag`) plus an outer `finally` covering steps 9-12 (so
the indicator clears on every post-LLM-gate return path).

#### Change summary

| ID | What | Lines |
|---|---|---|
| M-10 | **New import**: `const { startTyping } = require('../../whatsapp/typing');` (note the `../../` — the typing utility sits at `src/whatsapp/typing.js`). | `trigger.js:29` |
| M-11 | **Start indicator**: `const stopTyping = startTyping(sock, chatId);` placed **after** the chat-mode / settings / compose / retrieval / turbo-cutoff / user-prompt gates (steps 1-6) and **immediately before** `createChatCompletion` (step 7). | `trigger.js:264` |
| M-12 | **Explicit stop on parse failure**: inside the LLM/parse `catch`, `stopTyping()` is called BEFORE the `transitionChatMode(...)` flip to `human_pending_flag` and the `audit.write(...)`, so the indicator's disappearance is in lockstep with the chat-mode flip (not 200 ms later, while the awaits run). | `trigger.js:282` |
| M-13 | **Stop indicator in `finally` (outer)**: `stopTyping();` inside the `finally` of the outer `try { ... }` block wrapping steps 9-12 (confidence gate, numerical consistency, send). Fires on every post-LLM-gate return path: `confidence_low`, `ungrounded_number`, `send_failure`, successful `send`. | `trigger.js:357-359` |
| M-14 (no code change, by design) | The double-call (line 282 in the `catch` + line 358 in `finally`) is safe because `startTyping` returns an idempotent `stop` (SPEC-TYPING-1 §3 INV-X1). This is the contract that makes the asymmetric-stop pattern free. | — |

#### Code excerpt — the import

```javascript
// src/ai/whatsapp/trigger.js:29
const { startTyping } = require('../../whatsapp/typing');
```

#### Code excerpt — start (right before the LLM call)

```javascript
// src/ai/whatsapp/trigger.js:260-272
  // Step 7 + 8: call LLM + parse with retry.
  // Show a "typing…" indicator for the whole LLM-think-then-send window.
  // The LLM call can take 5-30s, well past Baileys' ~5s presence auto-clear,
  // so startTyping() refreshes the indicator on a fixed cadence.
  const stopTyping = startTyping(sock, chatId);
  const llmClient = { createChatCompletion };
  let parsed;
  try {
    const r = await createChatCompletion({
      systemPrompt,
      userPrompt,
      jsonSchema: { name: 'wa_decision', schema: zodSchemaShape(WhatsAppAutoReplyDecisionSchema) },
    });
```

#### Code excerpt — explicit stop in the parse-failure `catch`

```javascript
// src/ai/whatsapp/trigger.js:281-288
  } catch (err) {
    stopTyping();
    try {
      await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'parse_failure');
    } catch (_) {}
    await audit0.write('auto_reply_hold', { chatId, tenantId, reason: 'parse_failure', error: String(err.message) });
    return { decision: 'hold', reason: 'parse_failure' };
  }
```

#### Code excerpt — stop in the outer `finally` (steps 9-12)

```javascript
// src/ai/whatsapp/trigger.js:298-359 (relevant slice)
  // Step 9-12: post-LLM gates + send. Wrapped in try/finally so the
  // typing indicator is always stopped, regardless of which gate fires
  // (confidence_low, ungrounded_number, send_failure) or whether the
  // send succeeds.
  try {
    // ... confidence gate (step 9) returns 'confidence_low' ...
    // ... citation grounding (step 10) ...
    // ... numerical consistency (step 11) returns 'ungrounded_number' ...
    try {
      const send = await sendReply({ sock, chatId, body: parsed.answer, tenantId });
      // ... audit.write('auto_reply_sent', ...) ...
      return { decision: 'send', messageId: send.messageId };
    } catch (err) {
      return { decision: 'none', reason: 'send_failure' };
    }
  } finally {
    stopTyping();
  }
```

#### Tests that prove this change

| Evidence | Test name (proof the contract holds) |
|---|---|
| `stop()` is idempotent — **the contract that makes the two-call pattern safe** (explicit `catch` at 282 + outer `finally` at 358) | `whatsapp/typing — startTyping / stop > stop() is idempotent` |
| `stop()` emits `'paused'` and clears the interval — the contract that makes both call sites do the right thing | `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval` |
| `startTyping` fires `'composing'` immediately, before the 5-30 s LLM call begins | `whatsapp/typing — startTyping / stop > emits composing immediately on start` |
| `setInterval(REFRESH_MS)` keeps the indicator on across the 5-30 s LLM wait and the 3× parse retries | `whatsapp/typing — startTyping / stop > refreshes composing on the REFRESH_MS cadence` |
| `safeSend` swallows `sendPresenceUpdate` rejections — typing never breaks the trigger flow | `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate` |
| Socket is null / missing `sendPresenceUpdate` → no-op; trigger still completes | `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null`, `… safeSend > is a no-op when the socket is null`, `… safeSend > is a no-op when sendPresenceUpdate is missing` |

#### Verification line range

`src/ai/whatsapp/trigger.js:29, 264, 281-282, 357-359`.

---

## 4. Verification

> Per orchestrator Iron Law 4 (verification before completion): the
> Build record must include the **actual** test command run and its
> output, not a "should work" claim.

### 4.1 Command run

```bash
pnpm test -- src/test/typing.test.mjs
```

### 4.2 Output (verbatim, captured during this attempt)

```
> baileys-whatsapp-api@0.7.0-be-ai-auto-reply.0 test C:\Users\indocyber\Desktop\agent\projects\baileys test
> vitest run "src/test/typing.test.mjs"

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 C:/Users/indocyber/Desktop/agent/projects/baileys test

 ✓ src/test/typing.test.mjs (10 tests) 30ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  11:51:56
   Duration  683ms (transform 40ms, setup 0ms, collect 131ms, tests 30ms, environment 0ms, prepare 189ms)
```

### 4.3 Result

| Metric | Value |
|---|---|
| Test files | 1 passed / 0 failed / 0 skipped |
| **Tests passed** | **10** (5 `safeSend` + 5 `startTyping`/`stop`) |
| Tests failed | 0 |
| Tests skipped | 0 |
| Wall-clock duration | 683 ms (transform 40 ms; collect 131 ms; tests 30 ms) |

### 4.4 The 10 test names — explicit enumeration (matches `typing.test.mjs` in execution order)

`safeSend` (5 specs):

1. `calls sock.sendPresenceUpdate with the given type and jid` — `typing.test.mjs:38-46`
2. `is a no-op when the socket is null` — `typing.test.mjs:48-50`
3. `is a no-op when sendPresenceUpdate is missing` — `typing.test.mjs:52-54`
4. `is a no-op when jid is missing` — `typing.test.mjs:56-61`
5. `swallows rejections from sendPresenceUpdate` — `typing.test.mjs:63-71`

`startTyping / stop` (5 specs):

6. `emits composing immediately on start` — `typing.test.mjs:82-93`
7. `refreshes composing on the REFRESH_MS cadence` — `typing.test.mjs:95-118`
8. `stop() emits paused and clears the interval` — `typing.test.mjs:120-139`
9. `stop() is idempotent` — `typing.test.mjs:141-151`
10. `returns a no-op when the socket is null` — `typing.test.mjs:153-157`

All 10 specs passed. **No skips, no failures.**

### 4.5 Iron-Law 4 acceptance check

| Iron Law 4 requirement | This record |
|---|---|
| Test command run, not asserted | **Met** — `pnpm test -- src/test/typing.test.mjs` was run; output is captured verbatim above. |
| Pass count recorded | **Met** — 10 passed. |
| Skipped tests recorded | **Met** — 0 skipped. |
| Failures recorded (if any) | **Met** — 0 failures. |
| Test names enumerated | **Met** — §4.4 lists all 10 by name with line cites. |

## 5. Cross-References

- **Cycle PRD**: [`docs/be/features/whatsapp-typing/prd.md`](./prd.md)
  (PRD-TYPING-1) — particularly §4 T-FR-1..T-FR-9.
- **Cycle SPEC**: [`docs/be/features/whatsapp-typing/spec.md`](./spec.md)
  (SPEC-TYPING-1) — particularly §3 INV-X1..INV-X6 and §4-§6 per-site
  patterns.
- **Cycle Plan**: [`docs/be/features/whatsapp-typing/plan.md`](./plan.md)
  (PLAN-TYPING-1) — task breakdown T1..T6, integration sequencing.
- **Project PRD**: [`sot/general/PRD.md`](../../../../sot/general/PRD.md)
  (PRD-001).
- **Project FRD**: [`sot/general/FRD.md`](../../../../sot/general/FRD.md)
  (FRD-001 — see F-5 "Typing indicator (send)", F-7 "Typing indicator
  (broadcast)", F-21 "messages.upsert trigger pipeline", F-40
  "Defense-in-depth layers").
- **Source-of-truth external evidence** (the files this Build record
  documents):
  - `src/whatsapp/typing.js` (new utility)
  - `src/test/typing.test.mjs` (new test file)
  - `src/controllers/messageController.js` (modified — single-send)
  - `src/whatsapp/broadcaster.js` (modified — broadcast)
  - `src/ai/whatsapp/trigger.js` (modified — AI auto-reply)

## 6. Per-File Summary Table

| File | Status | Change | Lines | Test of record |
|---|---|---|---|---|
| `src/whatsapp/typing.js` | **NEW** | New utility module: `safeSend` + `startTyping` + `stop` closure; `REFRESH_MS = 4_000`; defensive guards; rejects swallowed at debug; `unref()` on the interval; idempotent stop. | `typing.js:1-72` (whole file) | 10 specs in `typing.test.mjs` cover it exhaustively (see §2.1 table). |
| `src/test/typing.test.mjs` | **NEW** | Vitest spec: 5 `safeSend` specs + 5 `startTyping`/`stop` specs. | `typing.test.mjs:1-158` (whole file) | The vitest runner itself (see §4). |
| `src/controllers/messageController.js` | **MODIFIED** | Single-send integration: import + `startTyping` before `antiBan.check` + `stopTyping()` in `finally`. | `messageController.js:6, 52-55, 114-116` | Utility contract proven by 10 specs in `typing.test.mjs` (see §3.1 table). |
| `src/whatsapp/broadcaster.js` | **MODIFIED** | Broadcast per-recipient integration: import + per-recipient `startTyping` before `_sendWithRetry` + `stopTyping()` in `finally` + deferred-return flag `shouldReturnAfterCatch` for transient branch. | `broadcaster.js:9, 179-180, 229-233, 245-250` | Idempotent stop (`typing.test.mjs:141-151`) is the contract that makes the deferred-return-safe. |
| `src/ai/whatsapp/trigger.js` | **MODIFIED** | AI auto-reply integration: import + `startTyping` before `createChatCompletion` + explicit `stopTyping()` in parse-failure `catch` (line 282) + `stopTyping()` in outer `finally` (lines 357-359) wrapping steps 9-12. | `trigger.js:29, 264, 281-282, 357-359` | Idempotent stop (`typing.test.mjs:141-151`) is the contract that makes the double-call (line 282 + line 358) safe. |

## 7. Validation Rules (Auditor Checks)

This Build record passes the auditor checks if:

- [ ] **Metadata**: every metadata field in the YAML front matter is
      filled (`doc_id`, `build_id`, `version`, `status`, `created`,
      `updated`, `author`, `attempt_id`, `run_id`, `cycle_id`,
      `linked_prd_cycle`, `linked_spec`, `linked_plan`,
      `linked_prd_project`, `linked_frd_project`,
      `classification`, `mode`, `source_of_truth`, `files_created`,
      `files_modified`, `verification_command`, `verification_result`).
      No `TBD`.
- [ ] **Files created (2)**: `src/whatsapp/typing.js` and
      `src/test/typing.test.mjs`. Both have per-section "Code excerpt"
      + "Tests that prove this change" + "Verification line range".
- [ ] **Files modified (3)**: `messageController.js`, `broadcaster.js`,
      `trigger.js`. Each has per-section "Change summary" with line
      cites, code excerpts of the import / start / stop, and a "Tests
      that prove this change" table citing the unit-test names from
      `src/test/typing.test.mjs`.
- [ ] **Verification (§4)**: the actual test command (`pnpm test --
      src/test/typing.test.mjs`) is recorded, the verbatim output is
      recorded, the pass count (10) and skipped (0) and failed (0) are
      recorded, and the 10 test names are enumerated by name with line
      cites.
- [ ] **Iron-Law-4 acceptance**: G5 (verification before completion)
      is honoured — this record claims the build is correct ONLY by
      reference to the test output captured in §4.2, not by "should
      work".
- [ ] **Cross-references**: PRD-TYPING-1, SPEC-TYPING-1, PLAN-TYPING-1,
      PRD-001, FRD-001 are all cited verbatim and resolve to existing
      files.
- [ ] **No new product scope**: the cycle shipped is documented; no
      forward-looking tasks are added. Drift surfaced by the seq 4
      audit is a finding — not a call to rewrite code.

## 8. Notes

- **Why the unit tests are the cross-cutting invariant proof**: the
  `typing.js` utility is small enough (`~70` lines) and self-contained
  enough (depends only on `sock.sendPresenceUpdate` and `logger`) that
  it can be exhaustively unit-tested in isolation. The three
  integration sites, by contrast, are too coupled to `wa.sock`,
  `antiBan`, the broadcast state machine, and the 13-step trigger
  pipeline to unit-test meaningfully. Per the project's testing
  convention, "test what you can unit-test, cite-by-line what you
  can't" — hence the heavy reliance on line cites for the integration
  sites (with the utility's unit tests as the contract proof).
- **Why three different `try/finally` patterns**: the three integration
  sites have three different control flows (see SPEC-TYPING-1 §7 cross-
  site table). The single-send is linear; the broadcast needs a
  deferred-return flag for the transient branch; the trigger needs an
  explicit early-stop so the indicator disappears in lockstep with the
  `human_pending_flag` flip. The unit tests cover the COMMON building
  block (`safeSend`, `startTyping`, `stop`, idempotency, refresh
  cadence), and each integration site picks the control-flow pattern
  that fits its semantics.
- **The integration line cites in this Build record are the single
  source of truth for "where the indicator is wired"**: the
  per-section line ranges in §3 (e.g. `messageController.js:6, 52-55,
  114-116`) are what an auditor reads to verify the integration. The
  code excerpts are illustrative; the line ranges are authoritative.
- **What the verification proves**: 10/10 specs pass on the just-shipped
  code, in the project root, against `src/test/typing.test.mjs`. The
  test file was authored in this session alongside the utility
  (PLAN-TYPING-1 §4 T6). No env vars were set; no external services
  were mocked beyond `vi.fn().mockResolvedValue(undefined)` for the
  socket — the unit-test surface is the utility's `sock` argument,
  not the real Baileys socket.

## 9. Change Log

| Version | Date       | Author         | Change |
|---------|------------|----------------|--------|
| 1.0.0   | 2026-07-10 | @be-engineer   | Initial draft. Per-cycle Build record for `be-typing-indicators-2026-07-10`. Documents the 1 new utility module (`src/whatsapp/typing.js`), the 1 new test file (`src/test/typing.test.mjs`), and the 3 modified integration sites (`messageController.js`, `broadcaster.js`, `trigger.js`). Enumerates the 10 unit-test names. Records the actual `pnpm test -- src/test/typing.test.mjs` output: 10 passed, 0 skipped, 0 failed. Cites PRD-TYPING-1, SPEC-TYPING-1, PLAN-TYPING-1 (cycle) and PRD-001, FRD-001 (project). attempt_id: `ATT-SEQ1-BE-1`. doc_id: `BUILD-TYPING-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. |

---

**Next step after this Build record lands**: the round-2 seq 1 audit
spawns (e.g. `@a-audit-sot-fidelity` or a specialized per-feature audit)
verify that `PRD-TYPING-1`, `SPEC-TYPING-1`, `PLAN-TYPING-1`, and this
Build record agree against `src/whatsapp/typing.js`,
`src/test/typing.test.mjs`, and the 3 integration sites — line for line.
