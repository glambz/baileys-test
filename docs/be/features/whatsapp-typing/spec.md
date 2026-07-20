<!--
owner: @requirements-analyst
cycle_id: be-typing-indicators-2026-07-10
attempt_id: ATT-SEQ1-RA-1
doc_id: SPEC-TYPING-1
linked_prd: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_project_prd: sot/general/PRD.md (PRD-001)
linked_project_frd: sot/general/FRD.md (FRD-001)
purpose: MIGRATION ARTIFACT — per-feature SPEC that decomposes PRD-TYPING-1
         into functional specifications, one per integration site. Code is
         the source of truth; this SPEC documents what IS, not what should be.
         Every acceptance criterion is verifiable by reading the code or by
         running the unit tests in src/test/typing.test.mjs.
-->

# Typing Indicator — SPEC (`be-typing-indicators-2026-07-10`)

> **Migration artifact.** Per-feature SPEC decomposing
> [`PRD-TYPING-1`](./prd.md) into testable functional specifications, one
> per integration site. This SPEC is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> retro-fit run. **Code is the source of truth** — `src/whatsapp/typing.js`
> and its three integration sites are authoritative; `src/test/typing.test.mjs`
> is the unit-test evidence. This SPEC does **not** invent new product scope.
>
> **Linked upstream**: [`PRD-TYPING-1`](./prd.md) (cycle-level),
> [`PRD-001`](../../../../sot/general/PRD.md) (project-level),
> [`FRD-001`](../../../../sot/general/FRD.md) (project-level — see F-5,
> F-7 and the F-21 / F-40 integration surfaces).

## Document Metadata

```yaml
---
doc_id: SPEC-TYPING-1
version: 1.0.0
status: review
created: 2026-07-10
updated: 2026-07-10
author: @requirements-analyst
attempt_id: ATT-SEQ1-RA-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-typing-indicators-2026-07-10
linked_prd_cycle: docs/be/features/whatsapp-typing/prd.md (PRD-TYPING-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
source_of_truth:
  utility: src/whatsapp/typing.js
  tests: src/test/typing.test.mjs
  integration_sites:
    - src/controllers/messageController.js
    - src/whatsapp/broadcaster.js
    - src/ai/whatsapp/trigger.js
mode: full
classification: EXISTING_PROJECT
linked_frd_features:
  - F-5  # Typing indicator (send)
  - F-7  # Typing indicator (broadcast)
  - F-40 # Defense-in-depth layers (where trigger typing lives)
linked_prd_requirements:
  - T-FR-1 .. T-FR-9 (PRD-TYPING-1 §4)
---
```

## 1. Purpose

PRD-TYPING-1 documents the cycle intent ("recipient sees typing for the
whole in-flight send"). This SPEC is the **contract between the PRD
and the code** — for each of the three integration sites, it pins down:

- the exact start trigger,
- the typing window (how long the indicator stays on),
- the stop trigger and stop idempotency,
- the failure modes,
- the test cases (mapped to `src/test/typing.test.mjs` test names),
- the edge cases handled.

Every acceptance criterion is verifiable by **reading the cited code line**
or **running the cited test name**. No criterion is aspirational.

## 2. Locked values (verbatim from code)

These values are locked because the code is the source of truth and the
unit tests assert against them.

| Constant | Locked value | Lives at |
|---|---|---|
| `COMPOSING_PRESENCE` | `'composing'` | `src/whatsapp/typing.js:29` |
| `PAUSED_PRESENCE` | `'paused'` | `src/whatsapp/typing.js:30` |
| `REFRESH_MS` | `4_000` (ms) | `src/whatsapp/typing.js:31` |
| `unref()` on the interval | yes (no event-loop block) | `src/whatsapp/typing.js:58` |

The `REFRESH_MS = 4_000` cadence is cited verbatim in `PRD-TYPING-1 §6`
("Why `4 s` not `5 s`") and is the refresh interval the
`src/test/typing.test.mjs::refreshes composing on the REFRESH_MS cadence`
test asserts.

## 3. Cross-cutting invariants (apply to all 3 integration sites)

These invariants MUST hold at every integration site. They are derived
from the utility (`src/whatsapp/typing.js`) and are exhaustively proven
by `src/test/typing.test.mjs` (10 specs: 5 for `safeSend`, 5 for
`startTyping` / `stop`).

### 3.1 INV-X1 — startTyping returns an idempotent stop

`src/whatsapp/typing.js:47-66`. The returned `stop()` flips a
`stopped` flag on first call, clears the interval, and fires the
`paused` presence. On second call, the flag short-circuits and the
function is a no-op. This is the contract that makes
`try/finally + early-return` and `try/finally + shouldReturnAfterCatch`
both safe.

| Test | Location |
|---|---|
| `whatsapp/typing — startTyping / stop > stop() is idempotent` | `src/test/typing.test.mjs:141-151` |

### 3.2 INV-X2 — typing must never break a real send

`src/whatsapp/typing.js:33-45`. All `sendPresenceUpdate` calls go
through `safeSend`, which checks `sock`, `sendPresenceUpdate`, and
`jid` before invoking, and swallows any rejection at debug level. When
any precondition fails, `safeSend` is a no-op and the `stop` returned
from `startTyping` is also a no-op.

| Test | Location |
|---|---|
| `whatsapp/typing — safeSend > calls sock.sendPresenceUpdate with the given type and jid` | `src/test/typing.test.mjs:38-46` |
| `whatsapp/typing — safeSend > is a no-op when the socket is null` | `src/test/typing.test.mjs:48-50` |
| `whatsapp/typing — safeSend > is a no-op when sendPresenceUpdate is missing` | `src/test/typing.test.mjs:52-54` |
| `whatsapp/typing — safeSend > is a no-op when jid is missing` | `src/test/typing.test.mjs:56-61` |
| `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate` | `src/test/typing.test.mjs:63-71` |
| `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null` | `src/test/typing.test.mjs:153-157` |

### 3.3 INV-X3 — refresh cadence preserves the indicator across long waits

`src/whatsapp/typing.js:53-58`. `setInterval(() => safeSend(sock, jid, 'composing'), REFRESH_MS)`
re-emits `'composing'` every 4 s. WhatsApp server auto-clears presence
after ~5–6 s; a 4 s refresh leaves a 1–2 s safety margin. The unit test
asserts the exact cadence (`< REFRESH_MS` produces no new call; `≥
REFRESH_MS` produces exactly one new call; each call carries
`'composing'`).

| Test | Location |
|---|---|
| `whatsapp/typing — startTyping / stop > refreshes composing on the REFRESH_MS cadence` | `src/test/typing.test.mjs:95-118` |

### 3.4 INV-X4 — active indicator does not block process exit

`src/whatsapp/typing.js:58`. `interval.unref()`. Not directly
unit-tested (Node-level lifecycle), but required to honour the
concurrent `pnpm test` + graceful-shutdown invariant cited at
`PRD-TYPING-1 §5` "Lifecycle / shutdown".

### 3.5 INV-X5 — stop emits `paused` and clears the interval

`src/whatsapp/typing.js:60-65`. `stop()` calls `clearInterval(interval)`,
then `safeSend(sock, jid, 'paused')`. After `stop()`, advancing the
clock by `5 × REFRESH_MS` does NOT re-emit `'composing'`. The test
asserts exactly one `'composing'` call followed by exactly one
`'paused'` call.

| Test | Location |
|---|---|
| `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval` | `src/test/typing.test.mjs:120-139` |

### 3.6 INV-X6 — startTyping fires `composing` immediately

`src/whatsapp/typing.js:51` calls `safeSend(sock, jid, COMPOSING_PRESENCE)`
synchronously (the actual send dispatches as a microtask). The test
asserts that the very first `sendPresenceUpdate` call after
`startTyping(sock, jid)` carries `('composing', jid)`.

| Test | Location |
|---|---|
| `whatsapp/typing — startTyping / stop > emits composing immediately on start` | `src/test/typing.test.mjs:82-93` |

## 4. Integration Site A — Single-send (`POST /api/messages/send`)

Source: [`src/controllers/messageController.js`](../../../../src/controllers/messageController.js).
Cites `PRD-TYPING-1 §4 T-FR-2` and `FRD-001 §4.3 F-5`.

### 4.A.1 Pattern (the "try/finally wraps antiBan + send")

```
startTyping(wa.sock, jid)              ← before antiBan.check
try {
  check = antiBan.check(jid, contentHash)
  if (check.kind === 'skip')  return 429
  if (check.kind === 'wait')  await sleep ≤ 60s; reconnect check; throw 503
  send = await wa.sock.sendMessage(jid, { text: message })
  antiBan.recordSent + inbox.record
  return 200 { messageId, to, text, timestamp }
} finally {
  stopTyping()                          ← always fires
}
```

The `stopTyping` is wired at the outer level so EVERY exit path —
200, 429 (antiBan skip), 503 (not connected / wait timeout), the
`sock.sendMessage` rejection bubbled to `next(err)`, the inbox-record
failure (logged but not thrown) — clears the indicator before the
function returns.

### 4.A.2 Start trigger

`startTyping(wa.sock, jid)` is called at
`src/controllers/messageController.js:55` **after** payload validation
and the `wa.isConnected()` check, **before** `antiBan.check(jid,
contentHash)`.

| Field | Value |
|---|---|
| Pre-condition | Body validated, `wa.isConnected() === true`, `jid` is a non-empty JID string. |
| When | The controller enters the inner `try` block at line 57. |
| Side-effect | `safeSend(wa.sock, jid, 'composing')` fires synchronously (microtask), then a `setInterval(REFRESH_MS)` is armed. |

### 4.A.3 Typing window

The window runs from line 55 (`startTyping`) to line 115 (`stopTyping`
in `finally`). On a clean 200 path the window covers:

1. `antiBan.check(jid, contentHash)` — synchronous, < 1 ms.
2. (If `check.kind === 'wait'`) `await sleep(min(delayMs, 60_000))`
   — covered by `REFRESH_MS = 4_000` refresh; the recipient sees
   typing for the full throttle wait.
3. `wa.sock.sendMessage(jid, { text: message })` — typical < 300 ms.
4. `antiBan.recordSent` + `inbox.markLogged` + `inbox.record` — < 5 ms.

On a 429 path the window covers only step 1; `stopTyping` fires via
`finally` before the function returns the 429 response.

On a 503 ("Connection lost while waiting") path the window covers
steps 1 + 2 (the throttle wait); `stopTyping` fires via `finally`
before the controller rethrows into the outer `catch`.

### 4.A.4 Stop trigger

`stopTyping()` at `src/controllers/messageController.js:115` (in
`finally`). Fires on every exit path:

- 200 (success): `return res.json(...)` at line 103 → `finally` →
  `stopTyping()`.
- 429 (`antiBan.kind === 'skip'`): `return res.status(429).json(...)`
  at line 60 → `finally` → `stopTyping()`.
- 503 ("Connection lost while waiting"): `throw err` at line 77 →
  `finally` → `stopTyping()` → outer `catch` → `next(err)`.
- Unexpected `sendMessage` rejection: bubbles through the `finally` →
  `stopTyping()` → outer `catch` → `next(err)`.
- Inbox-record failure: caught at line 100 (`catch (err) { logger.warn(...) }`),
  logged, does NOT throw; the indicator still stops because the
  `finally` runs after the inner `try` exits normally.

### 4.A.5 Failure modes (no-op, never break the send)

| Failure | Effect on typing | Effect on send | Citation |
|---|---|---|---|
| `wa.sock === null` (socket disconnected before the request arrived) | Not reached — the `wa.isConnected()` guard at line 38 throws a 503 BEFORE `startTyping` is called. | 503 returned; no `sock.sendMessage` attempted. | `messageController.js:38-44` |
| `wa.sock.sendPresenceUpdate === undefined` (defensive — module always exports the method, but the utility guards it) | All `safeSend` calls are no-ops (`typing.js:34`); the `stop` returned is also a no-op. | Send proceeds unchanged. | INV-X2 |
| `jid` is null/empty after `phoneToJid` (impossible per `wa.phoneToJid` validation, but defensive) | `safeSend` is a no-op (`typing.js:35`). | Validation already rejected the body with 400. | INV-X2 |
| `sendPresenceUpdate` throws / rejects | `safeSend` swallows at debug level (`typing.js:39-44`). | Send proceeds unchanged. | INV-X2 |
| Inbox-record failure (`inbox.record` throws) | Caught at line 100; logged at warn; the `finally` still runs `stopTyping()`. | Send still 200; only the markdown log line is missing. | `messageController.js:100-102` |
| `wa.sock.sendMessage` rejects with a transient (503) or terminal (400 / 404) status | `finally` runs `stopTyping()` before the rejection propagates to `next(err)`. | Error handler returns the appropriate 5xx / 4xx; no double-`stop`. | `messageController.js:114-119` |
| Mid-send connection drop (`wa.isConnected() === false` after the throttle wait) | `finally` runs `stopTyping()` before the 503 is rethrown. | 503 returned; the contact sees typing disappear in lockstep with the failure. | `messageController.js:74-79, 114-116` |

### 4.A.6 Edge cases handled

| Case | Behaviour | Citation |
|---|---|---|
| `wa.sock` is the singleton; if it is `null` between `startTyping` and `stopTyping` (rare, socket dropped mid-send) | `safeSend` no-ops on the `stop` call (INV-X2); the send itself fails asynchronously and is handled by the outer `catch`. | INV-X2 |
| `startTyping` is called with a JID ending in `@g.us` (group send — out of scope per `PRD-TYPING-1 §8`) | The utility accepts any non-empty `jid`; group sends do not flow through `messageController.send` in the shipped code, so this is a defensive only. | `typing.js:47-66` |
| The 4 s refresh interval fires `safeSend` during the very brief window after the `stop` flag is set but before `clearInterval` runs | The `setInterval` callback re-checks `stopped` (`typing.js:54`) and bails. | `typing.js:53-56` |

### 4.A.7 Test mapping

This site has NO dedicated unit test in `src/test/typing.test.mjs` —
the typing utility's behaviour is exhaustively covered there, and the
controller-level wiring is too tightly coupled to `wa.sock` and
`antiBan` to unit-test in isolation. The following manual verification
is the integration evidence:

| Evidence | How to obtain |
|---|---|
| `startTyping` runs on every successful single-send | `grep -n 'startTyping' src/controllers/messageController.js` → line 55. |
| `stopTyping` runs on every exit path | `grep -n 'stopTyping' src/controllers/messageController.js` → line 115 (in `finally`). |
| Indicator survives the anti-ban throttle | The `REFRESH_MS = 4_000` test (`typing.test.mjs:95-118`) proves the cadence; the `MIN_DELAY_MS..MAX_DELAY_MS` default of 15–45 s (`sot/general/FRD.md §7.2 AC-11.5`) is well within `5 × REFRESH_MS = 20 s × n` refresh coverage. |
| Network `sendPresenceUpdate` failures do not break the send | `swallows rejections from sendPresenceUpdate` (`typing.test.mjs:63-71`) + `safeSend` short-circuits on null socket / missing method / null JID (`typing.test.mjs:48-61`). |

### 4.A.8 AC summary (single-send)

| AC | Statement | Evidence |
|---|---|---|
| S-AC-1 | When the request enters the inner `try`, `'composing'` is fired immediately against `jid`. | `messageController.js:55` + INV-X6 |
| S-AC-2 | The indicator is re-emitted every `REFRESH_MS = 4_000` ms for the duration of any anti-ban throttle wait + the real `sendMessage` round-trip. | `messageController.js:55` → `typing.js:53-58` + INV-X3 |
| S-AC-3 | On every exit path (200, 429, 503-from-wait, 503-from-NotConnected, unexpected `sendMessage` rejection), `'paused'` is emitted and the interval is cleared. | `messageController.js:114-116` (in `finally`) + INV-X5 |
| S-AC-4 | A network rejection from `sendPresenceUpdate` does NOT propagate; the send still completes. | `typing.js:33-45` + `typing.test.mjs:63-71` |
| S-AC-5 | A socket that is `null` or missing `sendPresenceUpdate` yields a no-op indicator and a no-op `stop` — never throws. | `typing.js:33-45, 47-66` + `typing.test.mjs:48-50, 52-54, 153-157` |

## 5. Integration Site B — Broadcast (`POST /api/messages/broadcast`)

Source: [`src/whatsapp/broadcaster.js`](../../../../src/whatsapp/broadcaster.js)
(`Broadcaster._tick` method, per-recipient loop).
Cites `PRD-TYPING-1 §4 T-FR-3` and `FRD-001 §5.3 F-7`.

### 5.B.1 Pattern (the "nested try/finally with deferred-return")

```
while (recipient = active._queue.shift()) {
  if (signal.aborted) { ... continue }   // cancellation
  const check = this.antiBan.check(recipient.jid, active.contentHash)
  if (check.kind === 'skip') { ... continue }
  if (check.kind === 'wait') {
    active._nextAt = Date.now() + check.delayMs
    active._queue.unshift(recipient)
    this._scheduleTick(check.delayMs); return   // ← RETURN, no typing yet
  }
  // Per-recipient typing indicator. Scoped to this single send only.
  const stopTyping = startTyping(wa.sock, recipient.jid)
  let shouldReturnAfterCatch = false
  try {
    try {
      sent = await this._sendWithRetry(active, recipient.jid, active.message)
      // ... inbox.markLogged + inbox.record ...
    } catch (err) {
      // handle: terminal failure | transient error (requeue + 60s) | NOT_CONNECTED
      if (transient) { shouldReturnAfterCatch = true }
    }
  } finally {
    stopTyping()                              ← ALWAYS fires
  }
  if (shouldReturnAfterCatch) return          ← deferred-return AFTER finally
  active._finalizeRecipient(recipient)
  active._nextAt = Date.now() + 1_000
  this._scheduleTick(1_000)
  return
}
```

The marker `shouldReturnAfterCatch` is the deferred-return sentinel:
the transient-error branch wants to exit the tick (so the next
recipient is processed AFTER the 60 s backoff, not now), but JS does
not have `finally`-aware `return` — `return` inside a `finally` would
clobber any subsequent logic. The code assigns the flag, lets the
inner `finally` clear the indicator, then `return`s after the
`finally` block closes. This is the **only** way to satisfy
"stop the indicator AND exit the loop" on the transient path.

The indicator is OFF between recipients — the next recipient's send
starts a fresh `startTyping`. This is the design choice recorded at
`PRD-TYPING-1 §3.2 NG-T4`.

### 5.B.2 Start trigger

`startTyping(wa.sock, recipient.jid)` at
`src/whatsapp/broadcaster.js:179` — **after** the anti-ban skip / wait
gates, **immediately before** `_sendWithRetry(active, recipient.jid, active.message)`.
The `jid` is the per-recipient JID computed by `toJid` /
`broadcaster.createJob` (`broadcaster.js:36-46, 312-328`).

| Field | Value |
|---|---|
| Pre-condition | Recipient is not cancelled (`!active.signal.aborted`), `check.kind === 'ok'`. |
| When | Inside the per-recipient loop, after antiBan gates, before the `_sendWithRetry` call. |
| Side-effect | `safeSend(wa.sock, recipient.jid, 'composing')` + `setInterval(REFRESH_MS)`. |

### 5.B.3 Typing window

The window covers ONLY the `_sendWithRetry` call (which itself
includes `waitForConnection` + `sendOnce` retries). It does NOT cover:

- the anti-ban throttle wait (the `wait` branch returns before
  `startTyping` is reached — recipient stays in the queue, next
  recipient is NOT typed),
- the inter-recipient 1 s gap (`active._nextAt = Date.now() + 1_000`
  at line 252),
- the 60 s backoff after a transient error (`shouldReturnAfterCatch`
  path; the recipient is requeued and no indicator is on).

The window's maximum length is `MAX_SEND_RETRIES × (30 s timeout +
backoff)`. With `MAX_SEND_RETRIES = 3` (default, `sot/general/FRD.md
§7.2 AC-11.7`) and a 30 s `SEND_TIMEOUT_MS`, worst-case ~2 min, well
within `REFRESH_MS × n = 4_000 × 30 = 2 min`.

### 5.B.4 Stop trigger

`stopTyping()` at `src/whatsapp/broadcaster.js:246` (in `finally` at
the same nesting level as `try { try { ... } catch { ... } } finally { stopTyping() }`).
Fires on every per-recipient exit path:

- success: `sent = await _sendWithRetry(...)` resolves, inbox writes
  (or inbox-write logged-warn) complete, inner `try` exits →
  `finally` → `stopTyping()` → `if (shouldReturnAfterCatch) return`
  is `false` → `_finalizeRecipient` → `this._scheduleTick(1_000)`
  → `return`.
- terminal failure (400/401/403/404/405/410): `recipient.status = 'failed'`;
  `this.antiBan.recordFailure(recipient.jid)`; `finally` →
  `stopTyping()` → `shouldReturnAfterCatch = false` → continue
  processing (next recipient).
- NOT_CONNECTED (Baileys socket gone, no recovery within the timeout):
  `recipient.status = 'failed'; recipient.error = 'not_connected'`;
  `finally` → `stopTyping()` → `shouldReturnAfterCatch = false` →
  continue.
- transient failure (408/429/500/502/503/504/521/522/524):
  recipient is requeued with `active._queue.unshift(recipient)`,
  `_nextAt = Date.now() + 60_000`, `shouldReturnAfterCatch = true`;
  `finally` → `stopTyping()` → `if (shouldReturnAfterCatch) return`
  → next tick is scheduled 60 s out. **The indicator is OFF during
  the 60 s backoff** (this is correct — the requeued recipient's
  JID will get a fresh `startTyping` when their turn comes again).
- worker cancel mid-send: the inner `try { ... }` throws (cancelled),
  `catch` block hits; if `code === 'NOT_CONNECTED'` falls into the
  `failed` branch; otherwise the catch-all (`else`) marks it failed
  with `recipient.error = err.message`. `finally` → `stopTyping()`.

### 5.B.5 Failure modes

| Failure | Effect on typing | Effect on send | Citation |
|---|---|---|---|
| `wa.sock === null` | `_sendWithRetry` waits up to `CONNECTION_WAIT_TIMEOUT_MS` via `waitForConnection`; on timeout the throw bubbles, `catch` marks recipient `failed` with `error: 'not_connected'`. `startTyping` was already called but is no-op (`typing.js:34`); `stopTyping` clears the no-op interval. | Recipient `failed`; job continues to next recipient. | `broadcaster.js:48-58, 179, 234-237, 245-247` + INV-X2 |
| `sendPresenceUpdate` throws / rejects | `safeSend` swallows; `_sendWithRetry` proceeds unchanged. | Unchanged. | INV-X2 |
| `_sendWithRetry` terminal error (e.g. 404 — number not on WhatsApp) | `stopTyping` via `finally`. | `recipient.status = 'failed'; recipient.error = 'terminal_404: ...'`. Counter incremented. | `broadcaster.js:219-228, 245-247` |
| `_sendWithRetry` transient error (503) | `stopTyping` via `finally`; deferred-return (no `_finalizeRecipient` for this recipient; requeued with 60 s backoff). | Recipient requeued; job stays running. | `broadcaster.js:229-234, 245-250` |
| `worker.cancel(jobId)` arrives mid-send (`DELETE /api/messages/broadcast/:jobId`) | `abortController.abort()` fires; the in-flight recipient's `_sendWithRetry` throws `'cancelled'`; the catch marks them `failed` (err.message !== 'NOT_CONNECTED' or any specific code, so catch-all sets `recipient.error = 'cancelled'`); `finally` → `stopTyping`. | Recipient `failed` (NOT `skipped` — the catch-all assigns failed). Remaining pending recipients are flipped to `skipped` with `skipReason: 'cancelled'` inside `cancel()`. | `broadcaster.js:258-288 (_sendWithRetry), 219-243 (_tick catch), 375-399 (cancel)` |
| `inbox.record` throws (markdown log write fails) | Caught at line 213; logged at warn; `finally` still fires `stopTyping()`. | Send still completes; only the markdown log is missing. | `broadcaster.js:213-217, 245-247` |
| Inter-recipient throttle wait (15–45 s by default) | Indicator is OFF — the `wait` branch returns before `startTyping` is reached. | Recipient stays in the queue, `_nextAt` is set, `_scheduleTick` defers. | `broadcaster.js:161-170` (designed per `PRD-TYPING-1 §3.2 NG-T4`) |

### 5.B.6 Edge cases handled

| Case | Behaviour | Citation |
|---|---|---|
| Per-recipient JID is invalid (failed `toJid`) | Caught at `createJob` time, never enters the queue. (`recipients.length === 0` → 400 thrown.) | `broadcaster.js:312-334` |
| JID is an existing `@s.whatsapp.net` JID (caller passed pre-formatted) | `isJid(phone)` returns true at line 33; `recipient.jid = phone` (the JID is used as-is). | `broadcaster.js:32-34, 314` |
| Two calls to `stopTyping` (e.g. on a transient-then-cancelled sequence) | Idempotent — second call is a no-op. | INV-X1 |
| Cancellation arrives AFTER the recipient has been counted `sent` but BEFORE the inbox write | Cancellation cannot un-count the send (recipient.status is already `sent`); the `'cancelled'` throw path is short-circuited because `job.signal.aborted` is only checked at the top of `_sendWithRetry` (`broadcaster.js:262`). After a successful send the function returns; `finally` runs `stopTyping()`; the loop does NOT check `signal.aborted` until the next recipient. | `broadcaster.js:258-262, 179-256` |

### 5.B.7 Test mapping

This site has NO dedicated unit test in `src/test/typing.test.mjs` —
the per-recipient loop is too tightly coupled to the job state machine
to unit-test in isolation. The integration evidence:

| Evidence | How to obtain |
|---|---|
| Indicator is per-recipient (OFF between recipients) | Read `broadcaster.js:161-170` (wait branch returns) vs `broadcaster.js:179` (start only after the wait branch has returned). |
| `finally` runs before `shouldReturnAfterCatch` return | `broadcaster.js:245-250` — `finally` block closes at 247, `if (shouldReturnAfterCatch)` is at 248. JS guarantees `finally` runs before any subsequent code in the enclosing scope. |
| `stopTyping` is idempotent under concurrent catch branches | INV-X1 (`typing.test.mjs:141-151`). |
| `safeSend` is defensive against null socket / missing method | INV-X2 (`typing.test.mjs:48-71`). |

### 5.B.8 AC summary (broadcast)

| AC | Statement | Evidence |
|---|---|---|
| B-AC-1 | The indicator is OFF during the anti-ban throttle wait between recipients — only the actual `_sendWithRetry` window is typed. | `broadcaster.js:161-170, 179` + `PRD-TYPING-1 §3.2 NG-T4` |
| B-AC-2 | For each recipient in `_queue`, `startTyping(wa.sock, recipient.jid)` is called immediately before `_sendWithRetry`. | `broadcaster.js:179, 183-187` |
| B-AC-3 | On success, terminal failure, NOT_CONNECTED, or transient requeue, `stopTyping()` fires via `finally` before the worker moves on. | `broadcaster.js:245-247` |
| B-AC-4 | On transient requeue (`shouldReturnAfterCatch = true`), the deferred return runs AFTER the `finally` closes (JS guarantee); the indicator is OFF during the 60 s backoff. | `broadcaster.js:229-234, 245-250` |
| B-AC-5 | If the operator cancels the job mid-send, the in-flight recipient's indicator stops (via `finally`); subsequent pending recipients are flipped to `skipped` with `skipReason: 'cancelled'` by `cancel()`. | `broadcaster.js:245-247, 375-399` |
| B-AC-6 | Socket / presence failures never break the send. | INV-X2 |
| B-AC-7 | `_sendWithRetry` retries are covered by the same single indicator window — the indicator does NOT restart between attempts. | `broadcaster.js:179, 245-247` (typed window spans the whole `_sendWithRetry` call) |

## 6. Integration Site C — AI auto-reply (`messages.upsert`)

Source: [`src/ai/whatsapp/trigger.js`](../../../../src/ai/whatsapp/trigger.js)
(`processInboundMessage` function).
Cites `PRD-TYPING-1 §4 T-FR-4` and `FRD-001 §10.2 F-21` (defense-in-depth
layer coverage).

### 6.C.1 Pattern (the "outer try/finally wraps steps 9–12")

```
// Outer steps 1-8 (gates, retrieval, LLM call, parse)
const stopTyping = startTyping(sock, chatId)
let parsed
try {
  r = await createChatCompletion({ systemPrompt, userPrompt, jsonSchema })
  parsedR = await parseStructuredOutput({ rawText: r.content, ... })
  parsed = parsedR.parsed
} catch (err) {
  stopTyping()                                            ← EARLY STOP on parse error
  await transitionChatMode(chatId, 'ai', 'human_pending_flag', 'parse_failure')
  return { decision: 'hold', reason: 'parse_failure' }
}

// Steps 9-12: post-LLM gates + send.
try {
  // Step 9: confidence gate (hold on low confidence)
  // Step 11: numerical consistency (hold on ungrounded number)
  // Step 12: send
  try {
    send = await sendReply({ sock, chatId, body: parsed.answer, tenantId })
    return { decision: 'send', messageId: send.messageId }
  } catch (err) {
    return { decision: 'none', reason: 'send_failure' }
  }
} finally {
  stopTyping()                                            ← ALWAYS fires for 9-12
}
```

The asymmetric stop pattern matters:

- **`stopTyping()` is called EXPLICITLY in the LLM/parse `catch`
  block** (`trigger.js:282`) so the indicator clears BEFORE the
  `transitionChatMode` → `audit.write` → `return` sequence runs (those
  three awaits can each take tens of milliseconds, during which the
  recipient would otherwise keep seeing "typing…" for a chat that has
  been flipped to `human_pending_flag`).
- **The outer `try/finally` at lines 302-359 wraps steps 9–12** so
  any `return` inside steps 9–12 (confidence gate, numerical gate,
  send) still fires `stopTyping()`.
- **Calling `stopTyping()` twice is safe** — the indicator's
  idempotent stop (`typing.js:60-65`) is the contract that makes
  this work.

### 6.C.2 Start trigger

`startTyping(sock, chatId)` at
`src/ai/whatsapp/trigger.js:264` — **after** settings load, retrieval,
turbo cutoff, and the user-prompt construction. The `sock` is the
Baileys socket passed in via the `ctx` object (`trigger.js:73`), and
`chatId` is the JID resolved by `inbox.resolveJid(rawChatId)` at
`trigger.js:94-96`.

| Field | Value |
|---|---|
| Pre-condition | Inbound has passed the self-echo filter (`trigger.js:81-83`), status-broadcast filter (`85-87`), empty-body filter (`98-100`), `aiMode === 'ai'` (loaded at step 1, `154-163`), `settings.whatsappAutoReply.enabled === true` (`167-169`), `retrievalScore ≥ TAU_TURBO` (`206-212`). |
| When | Immediately before `createChatCompletion` at `trigger.js:268`. |
| Side-effect | `safeSend(sock, chatId, 'composing')` + `setInterval(REFRESH_MS)`. |

### 6.C.3 Typing window

The window runs from line 264 (`startTyping`) to line 358
(`stopTyping` in `finally` covering steps 9-12). It covers:

1. `createChatCompletion(...)` — 5–30 s typical, up to
   `LLM_TIMEOUT_MS = 30_000` (default, `FRD-001 §8.2 AC-12.6`).
2. `parseStructuredOutput(...)` — synchronous retry loop, ≤ 3 attempts,
   adds the LLM latency up to 3 more times on parse failure.
3. **On parse failure** the catch branch runs `stopTyping()`
   explicitly at `trigger.js:282` BEFORE the `transitionChatMode`
   (flip to `human_pending_flag`), the `audit.write`, and the
   `return { decision: 'hold', reason: 'parse_failure' }`.
4. The outer `try` at line 302 covers steps 9 (confidence gate),
   step 11 (numerical consistency), and step 12 (send). All return
   paths inside steps 9–12 route through the `finally` at line 357.

On a clean send path the window covers steps 1–12 — LLM + parse +
gates + send — typically 5–30 s, refreshed every 4 s.

### 6.C.4 Stop trigger

`stopTyping()` is called at TWO sites, both safe:

| Site | When | Why early? |
|---|---|---|
| `trigger.js:282` (inside the parse-failure `catch`) | LLM call OR `parseStructuredOutput` throws (network / parse / 3-attempts). | The chat must flip to `human_pending_flag` and emit the audit row BEFORE returning. If we waited for `finally` to fire, those awaits would run while the recipient still sees "typing…" — confusing. |
| `trigger.js:358` (in `finally` around steps 9–12) | Any return inside steps 9-12: `confidence_low` (`320`), `ungrounded_number` (`338`), successful `send` (`353`), `send_failure` (`355`). | The outer `try/finally` is the safety net for the post-LLM gate stack; calling it ALSO means the indicator clears even on a clean return path. |

Both sites call the SAME `stop` closure — the second call is a
no-op (INV-X1).

### 6.C.5 Failure modes

| Failure | Effect on typing | Effect on auto-reply | Citation |
|---|---|---|---|
| LLM call rejects (transient 429 / 5xx, permanent 4xx, or `LlmPermanentError`) | `parseStructuredOutput` retries up to 3 times (`FRD-001 §8.5 AC-15.2`). On final failure, the `catch` at line 281 calls `stopTyping()` explicitly (line 282). | Chat flipped to `human_pending_flag`; audit row written; returns `{ decision: 'hold', reason: 'parse_failure' }`. | `trigger.js:267-288` |
| `parseStructuredOutput` rejects (zod validation fails 3× in a row) | Same as above (`LlmParseError` is thrown from `parseStructuredOutput`, caught at line 281). | Same as above. | `trigger.js:273-288` |
| LLM returns `parsed.confidence < confThresh` (step 9) | Outer `finally` at line 357 → `stopTyping()`. | `transitionChatMode(chatId, 'ai', 'human_pending_flag', 'confidence_low')`; audit row; return `decision: 'hold'`. | `trigger.js:309-321, 357-359` |
| LLM answer contains an ungrounded number (step 11) | Same. | `transitionChatMode(..., 'ungrounded_number')`; audit row; return `decision: 'hold'`. | `trigger.js:329-340, 357-359` |
| `sendReply` throws (step 12) | Same. | Inner `catch` at line 354 returns `{ decision: 'none', reason: 'send_failure' }`; NO `transitionChatMode` flip (the chat stays in `ai`); outer `finally` fires `stopTyping()`; the function exits normally with `decision: 'none'`. | `trigger.js:343-356, 357-359` |
| Inbound is filtered earlier (self-echo, status@broadcast, empty body, `aiMode ∈ {human, human_pending_flag}`, `auto_reply_disabled`) | `startTyping` is NEVER called — the function returns BEFORE line 264. | Returns `decision: 'none'` with the matching reason. | `trigger.js:81-100, 154-163, 167-169, 264` |
| `retrievalScore < TAU_TURBO` | `startTyping` is NEVER called — the `turbo_cutoff` branch returns at line 211. | Chat flipped to `human_pending_flag`; audit row; return `decision: 'hold', reason: 'turbo_cutoff'`. | `trigger.js:206-212` |
| `sock` is `null` / has no `sendPresenceUpdate` | `safeSend` no-ops; the `stop` is a no-op. The trigger still runs to completion. | Unchanged (the parse, gates, and `sendReply` are the real send paths; `sendReply` would also fail in `NOT_CONNECTED` and the `sendReply` catch returns `decision: 'none', reason: 'send_failure'`). | INV-X2 + `trigger.js:264, 357-359` |
| Both `stopTyping()` sites fire on the same path (parse failure after passing the LLM but before any `try/finally` step-9 entry — the catch fires `stopTyping()` at 282, then the outer `finally` at 358 also fires `stopTyping()` on the same `parsed` variable) | The second call is a no-op (INV-X1). The path does not actually reach the outer `try` in this case (the `return` at line 287 exits the function); INV-X1 is the safety net for any future refactor that moves the `return`. | n/a — `return` at line 287 skips steps 9-12 entirely. | `trigger.js:281-288, 357-359` + INV-X1 |

### 6.C.6 Edge cases handled

| Case | Behaviour | Citation |
|---|---|---|
| `chatId` is an `@lid` JID | `inbox.resolveJid(rawChatId)` at line 94 maps it to the PN. The typing indicator is sent to the MAPPED chatId (i.e., the human's JID the contact sees), not the raw `@lid`. | `trigger.js:94-96, 264` |
| `chatId` is a `@g.us` (group) | The trigger does not currently have a group-skip at the JID level (group sends are out of scope per `PRD-TYPING-1 §8`); `inbox.resolveJid` returns the raw chatId if no mapping exists. The indicator is sent to the group JID, which is the standard Baileys pattern. | `trigger.js:84-96` (no group skip) |
| `sock` is `null` (socket disconnected) | `safeSend` no-ops throughout; the trigger still runs to completion. `sendReply` would likely fail (its `sock.sendMessage` would throw). The catch returns `send_failure`. | INV-X2 + `trigger.js:343-356` |
| `ctx.sock` is not provided by the caller | `ctx = ctx || {}`; `ctx.sock` is `undefined`; same as `null` for `safeSend` purposes. | `trigger.js:72-73` + INV-X2 |
| `retrievalScore < TAU_TURBO` for an L2-only call where `TAU_TURBO = 0.0` (current code default per `FRD-001 §9.4 AC-18.6`) | `TAU_TURBO = 0.0` so retrievalScore must be NEGATIVE to trigger the cutoff — which doesn't happen in practice. The indicator path is reached normally. | `trigger.js:206-212` + `sot/general/FRD.md §9.4 AC-18.6` |
| Inbound is a sticker / image / document / voice (no text body) | Filtered at line 98 (`!body || !body.trim()`). `startTyping` NEVER runs. | `trigger.js:97-100` |

### 6.C.7 Test mapping

This site has NO dedicated unit test in `src/test/typing.test.mjs` —
the 13-step trigger pipeline requires a stubbed socket, audit log,
episodic store, and LLM gateway, which is well outside the scope of
the typing-indicator test. The integration evidence:

| Evidence | How to obtain |
|---|---|
| `startTyping` runs immediately before the LLM call | `grep -n 'startTyping' src/ai/whatsapp/trigger.js` → line 264. |
| `stopTyping` runs on parse failure | `grep -n 'stopTyping' src/ai/whatsapp/trigger.js` → line 282 (in the parse-failure catch). |
| `stopTyping` runs via `finally` on all post-LLM gate returns | `grep -n 'stopTyping' src/ai/whatsapp/trigger.js` → line 358 (in `finally`). |
| Idempotent stop is the contract that makes two-call safety free | INV-X1 (`typing.test.mjs:141-151`). |
| 4 s refresh beats Baileys' ~5 s server-side auto-clear | INV-X3 (`typing.test.mjs:95-118`). |
| Active indicator does not block process exit | INV-X4 (`typing.js:58`). |

### 6.C.8 AC summary (AI auto-reply)

| AC | Statement | Evidence |
|---|---|---|
| T-AC-1 | When the LLM call begins, `'composing'` is fired immediately against `chatId`. | `trigger.js:264` + INV-X6 |
| T-AC-2 | The indicator is re-emitted every `REFRESH_MS = 4_000` ms for the duration of the LLM call + parse + gates + send. | `trigger.js:264` → `typing.js:53-58` + INV-X3 |
| T-AC-3 | On LLM or parse failure (after `≤ 3` parse retries, per `FRD-001 §8.5 AC-15.2`), `stopTyping()` fires BEFORE the chat is flipped to `human_pending_flag` (so the "typing…" disappears in lockstep with the flip, not 200 ms later). | `trigger.js:281-288` + INV-X5 |
| T-AC-4 | On any post-LLM gate (`confidence_low`, `ungrounded_number`, `send_failure`) or a successful send, `stopTyping()` fires via `finally`. | `trigger.js:357-359` + INV-X5 |
| T-AC-5 | A network rejection from `sendPresenceUpdate` does NOT propagate; the trigger still completes (either holding for human or sending). | INV-X2 |
| T-AC-6 | A socket that is `null` or missing `sendPresenceUpdate` yields a no-op indicator — the trigger still runs to completion, and the `send_failure` `decision: 'none'` is returned if `sendReply` itself cannot reach the socket. | INV-X2 + `trigger.js:343-356` |
| T-AC-7 | The double-call pattern (parse-failure `catch` at line 282 + outer `finally` at line 358) is safe because `stop` is idempotent. | INV-X1 + `trigger.js:281-288, 357-359` |
| T-AC-8 | The indicator does NOT fire on early-return paths (self-echo, status@broadcast, empty body, `human` / `human_pending_flag` mode, `auto_reply_disabled`, `retrievalScore < TAU_TURBO`). | `trigger.js:81-100, 154-169, 206-212` (all return BEFORE line 264) |

## 7. Cross-site invariants (comparison table)

The three sites use three different control-flow patterns to wire
`try/finally + stopTyping`. The SPEC documents each pattern because
the next developer who adds a fourth integration site needs to choose
one deliberately.

| Site | Pattern | Why this pattern | Citation |
|---|---|---|---|
| Single-send | `try / finally` around the antiBan + send + inbox | All exit paths are linear (one of 200 / 429 / 503 / unexpected-throw); a single `finally` covers them all. | `messageController.js:55, 57-116` |
| Broadcast | Nested `try / try { try { ... } catch { ... } } finally { stopTyping() }` with a deferred-return flag | The transient branch wants both "stop the indicator" AND "exit the loop NOW"; JS `return`-inside-`finally` would skip the per-recipient bookkeeping. The `shouldReturnAfterCatch` flag is the canonical solution. | `broadcaster.js:179-256` |
| AI trigger | Outer `try { LLM + parse } catch { explicit stopTyping + return }` followed by `try { steps 9-12 } finally { stopTyping() }` | The parse-failure path needs to flip `human_pending_flag` and emit an audit row BEFORE stopping (so the flip and the indicator disappearance are in lockstep); the post-LLM gates need a single safety-net `finally` covering four independent `return` paths. The explicit early `stopTyping()` plus the outer `finally` covers both, and the second call is harmless (INV-X1). | `trigger.js:264-288, 302-359` |

| Invariant | Single-send | Broadcast | AI trigger |
|---|---|---|---|
| `startTyping` is called BEFORE the long-running work it covers. | YES (line 55, before antiBan) | YES (line 179, before `_sendWithRetry`) | YES (line 264, before `createChatCompletion`) |
| `stopTyping` is called via `finally` (or equivalent) on every exit path. | YES (line 114-116) | YES (line 245-247) | YES (line 357-359) plus early-stop on parse failure (line 282) |
| Network rejection from `sendPresenceUpdate` never propagates. | YES (INV-X2) | YES (INV-X2) | YES (INV-X2) |
| `setInterval` does not block process exit. | YES (INV-X4) | YES (INV-X4) | YES (INV-X4) |
| Idempotent stop is safe to call twice. | YES (single call site) | YES (single call site) | YES (TWO call sites; INV-X1 is the contract) |
| Window covers the antiBan throttle wait. | YES (window starts BEFORE `antiBan.check`) | NO — wait branch returns before `startTyping` | N/A (LLM has no antiBan, but the window covers the parse retries) |
| Window covers the actual `sendMessage`. | YES | YES | YES |

## 8. Failure-mode quick-reference (consolidated)

| Scenario | Site | Behavior |
|---|---|---|
| `sock === null` | all | `safeSend` is a no-op; `stop()` is a no-op. No exception. Source: `typing.js:33-45`. Test: `typing.test.mjs:48-50, 153-157`. |
| `sock.sendPresenceUpdate === undefined` | all | `safeSend` is a no-op. Test: `typing.test.mjs:52-54`. |
| `sendPresenceUpdate` rejects | all | Swallowed at debug level. Test: `typing.test.mjs:63-71`. |
| `jid` is null | all | `safeSend` is a no-op. Test: `typing.test.mjs:56-61`. |
| Stop called twice | all | Idempotent — second call is a no-op. Test: `typing.test.mjs:141-151`. |
| Single-send socket drops mid-wait | single-send | `wa.isConnected()` re-check after the throttle (`messageController.js:74-79`) throws 503; `finally` fires `stopTyping()`. |
| Single-send reject from `sendMessage` | single-send | bubbles to outer `catch` (`messageController.js:117-119`); `finally` fires `stopTyping()` first. |
| Broadcast recipient socket drops | broadcast | `waitForConnection` times out → `NOT_CONNECTED` thrown → `catch` marks `failed`; `finally` fires `stopTyping()`; worker continues. |
| Broadcast `_sendWithRetry` transient 503 | broadcast | recipient requeued with 60 s backoff; deferred-return after `finally`; indicator OFF during backoff. |
| Broadcast cancel (`DELETE`) | broadcast | `abortController.abort()`; in-flight recipient's `'cancelled'` throws; catch-all marks failed; `finally` fires `stopTyping()`; remaining pending flipped to `skipped`. |
| Broadcast inbox-record failure | broadcast | logged-warn; `finally` still fires; recipient still `sent`. |
| AI trigger LLM 5xx (after 2 retries) | AI | `LlmPermanentError` (or retry-exhausted throw) → catch → explicit `stopTyping` (line 282) → flip to `human_pending_flag` → audit → return `decision: 'hold'`. |
| AI trigger parse fails 3× in a row | AI | `LlmParseError` from `parseStructuredOutput` → catch → explicit `stopTyping` → flip to `human_pending_flag` ('parse_failure') → audit → return `decision: 'hold'`. |
| AI trigger `confidence < confThresh` | AI | outer `finally` → `stopTyping` → flip to `human_pending_flag` ('confidence_low') → audit → return `decision: 'hold'`. |
| AI trigger ungrounded number in answer | AI | outer `finally` → `stopTyping` → flip to `human_pending_flag` ('ungrounded_number') → audit → return `decision: 'hold'`. |
| AI trigger `sendReply` throws | AI | inner catch returns `decision: 'none', reason: 'send_failure'`; outer `finally` fires `stopTyping()`. |
| AI trigger `sock === null` | AI | `safeSend` no-ops; trigger still runs to completion; `sendReply` will fail → `send_failure`. |

## 9. Out-of-scope (explicit)

This SPEC documents what IS in the code. The following are out of
scope and NOT covered by this SPEC:

- **Streaming indicators** that update mid-send (`'recording'`, etc.)
  — Baileys presence only carries `'composing'` / `'paused'`.
- **Inter-recipient broadcast typing** (`PRD-TYPING-1 §3.2 NG-T4`) —
  deliberately OFF between recipients.
- **Group send typing** — group sends are not wired through
  `messageController.send` in the shipped code.
- **Inbound self-echo typing** — `trigger.js:81-83` filters them;
  `startTyping` is never called.
- **Preview typing** — `POST /api/crm/ai/reply-preview` never sends;
  no typing affordance makes sense.
- **Future evolution** — any new integration site MUST follow INV-X1
  through INV-X6 and the pattern appropriate to its control flow
  (see §7).

## 10. Verifiability summary

Every acceptance criterion in §4.A.8, §5.B.8, and §6.C.8 is verifiable
by **one or both** of:

| Method | Cites |
|---|---|
| Reading the cited `src/<file>:<line>` location | Direct grep; the cited location is the single source of truth. |
| Running the cited `src/test/typing.test.mjs::test name` | `pnpm test src/test/typing.test.mjs` runs all 10 specs. |

| Test name | Method |
|---|---|
| `whatsapp/typing — safeSend > calls sock.sendPresenceUpdate with the given type and jid` | `pnpm test src/test/typing.test.mjs -t "calls sock.sendPresenceUpdate"` |
| `whatsapp/typing — safeSend > is a no-op when the socket is null` | `pnpm test src/test/typing.test.mjs -t "no-op when the socket is null"` |
| `whatsapp/typing — safeSend > is a no-op when sendPresenceUpdate is missing` | `pnpm test src/test/typing.test.mjs -t "no-op when sendPresenceUpdate is missing"` |
| `whatsapp/typing — safeSend > is a no-op when jid is missing` | `pnpm test src/test/typing.test.mjs -t "no-op when jid is missing"` |
| `whatsapp/typing — safeSend > swallows rejections from sendPresenceUpdate` | `pnpm test src/test/typing.test.mjs -t "swallows rejections"` |
| `whatsapp/typing — startTyping / stop > emits composing immediately on start` | `pnpm test src/test/typing.test.mjs -t "emits composing immediately"` |
| `whatsapp/typing — startTyping / stop > refreshes composing on the REFRESH_MS cadence` | `pnpm test src/test/typing.test.mjs -t "refreshes composing"` |
| `whatsapp/typing — startTyping / stop > stop() emits paused and clears the interval` | `pnpm test src/test/typing.test.mjs -t "stop() emits paused"` |
| `whatsapp/typing — startTyping / stop > stop() is idempotent` | `pnpm test src/test/typing.test.mjs -t "stop() is idempotent"` |
| `whatsapp/typing — startTyping / stop > returns a no-op when the socket is null` | `pnpm test src/test/typing.test.mjs -t "returns a no-op when the socket is null"` |

## 11. Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0.0 | 2026-07-10 | @requirements-analyst | Initial draft. Cycle-level SPEC for `be-typing-indicators-2026-07-10`. Decomposes PRD-TYPING-1 into three integration-site specifications (single-send, broadcast, AI auto-reply). Documents the three `try/finally` patterns, cites all 10 unit tests in `src/test/typing.test.mjs` by name, pins the locked values (`composing` / `paused` / `REFRESH_MS = 4_000`). attempt_id: `ATT-SEQ1-RA-1`. doc_id: `SPEC-TYPING-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. |

---

**Next step after this SPEC lands**: the parallel seq 1 dispatches
(`@technical-planner` → `docs/be/features/whatsapp-typing/plan.md`,
`@be-engineer` → `docs/be/features/whatsapp-typing/build.md`) anchor
their own documents against this SPEC's §4-§6 (integration-site
specifications), §7 (cross-site invariants), §8 (failure-mode
quick-reference), and §10 (verifiability). Round 2 (Audit) verifies
the four artifacts agree against `src/whatsapp/typing.js`,
`src/test/typing.test.mjs`, and the three integration sites.
