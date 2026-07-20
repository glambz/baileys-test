<!--
owner: @product-manager
cycle_id: be-typing-indicators-2026-07-10
attempt_id: ATT-SEQ1-PM-1
doc_id: PRD-TYPING-1
linked_prd: sot/general/PRD.md (PRD-001)
linked_frd: sot/general/FRD.md (FRD-001)
linked_plan: docs/be/features/whatsapp-typing/plan.md
purpose: MIGRATION ARTIFACT — documents what IS in the code for the
typing-indicator cycle shipped in the WF_EXISTING seq 1 retro-fit.
Not a forward-looking scope statement.
-->

# Typing Indicator — PRD (`be-typing-indicators-2026-07-10`)

> **Migration artifact.** This PRD is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run. It documents the typing-indicator feature that already shipped
> in this session. **Code is the source of truth** — `src/whatsapp/typing.js`
> and its three integration sites are authoritative. This PRD does
> **not** invent new product scope.
>
> **Linked upstream**: [`PRD-001`](../../../../sot/general/PRD.md)
> (project-level); [`FRD-001`](../../../../sot/general/FRD.md)
> (project-level). Per-feature test evidence lives in
> [`spec.md`](./spec.md).

## 1. Vision

When a WhatsApp recipient is about to receive a message from this
system, they should see the WhatsApp "typing…" (composing) indicator
**for the whole duration of the in-flight send** — not just the moment
the socket actually pushes bytes. Without it, the anti-ban throttle
(`MIN_DELAY_MS..MAX_DELAY_MS` = 15s–45s by default) and the LLM call
(5s–30s for the auto-reply path) make the contact's UI look frozen:
they tap "send" and nothing visibly happens until the message
mysteriously lands. With it, the contact sees the same affordance they
would see if a human were typing.

The indicator is cross-cutting: it lives next to the actual send in
all three outbound paths. It must never break a real send.

## 2. Why this cycle shipped

The three scenarios the user named in the original request:

| # | Scenario | Integration site | Source-of-truth line |
|---|---|---|---|
| 1 | "when the AI is replying" — the auto-reply trigger | `src/ai/whatsapp/trigger.js` | `trigger.js:264` (`startTyping` before LLM call), `trigger.js:282` (early `stopTyping` on parse error), `trigger.js:358` (`finally stopTyping`) |
| 2 | "when the api for sending message is hit" — single-send | `src/controllers/messageController.js` | `messageController.js:55` (`startTyping` before anti-ban check), `messageController.js:115` (`finally stopTyping`) |
| 3 | "when the broadcast is hit which as i understand hit sending message api" — broadcast worker | `src/whatsapp/broadcaster.js` | `broadcaster.js:179` (per-recipient `startTyping` before `_sendWithRetry`), `broadcaster.js:246` (`finally stopTyping` + `shouldReturnAfterCatch` return path) |

The shared utility is
[`src/whatsapp/typing.js`](../../../../src/whatsapp/typing.js) — a
~70-line module exporting one function, `startTyping(sock, jid)`,
which returns an idempotent `stop()`.

## 3. Goals & Non-Goals

### 3.1 Goals

- **G-T1 — Recipient sees "typing…" for the whole in-flight send.**
  Success criterion: starting at the moment the system commits to
  sending (single-send: before the anti-ban check; broadcast: before
  `_sendWithRetry`; AI trigger: before the LLM createChatCompletion
  call), the recipient's WhatsApp UI shows the composing indicator
  continuously until the actual `sock.sendMessage` (or the
  gate-flip / parse-error return) completes. Verified by the
  presence refresh in `typing.js:53-58` (every `REFRESH_MS = 4_000` ms)
  and by the `try/finally` wiring at all three integration sites.

- **G-T2 — Indicator never breaks the real send.** Success criterion:
  the send completes with the same outcome (success / 429 / 503 /
  200 + `messageId`) with the typing wrapper on as without it.
  Verified by `safeSend`'s swallowed rejections at
  `typing.js:33-45`, the `no socket` no-op return at
  `typing.js:33-45, 47-66`, the `unref()` at `typing.js:58` (so the
  interval never blocks graceful shutdown), and the unit tests at
  `src/test/typing.test.mjs` covering the no-op, the failure-swallow,
  and the idempotent stop paths.

- **G-T3 — Refresh cadence preserves the indicator across long waits.**
  Success criterion: a `single-send` paused by anti-ban throttle for
  its full 45-second budget (the default `MAX_DELAY_MS`) still shows
  "typing…" all 45 seconds, because `setInterval` re-emits
  `'composing'` every 4 s (`typing.js:53-58`) and the WhatsApp server
  auto-clears presence after ~5–6 s without a refresh.

- **G-T4 — Stop is idempotent and always fires.** Success criterion:
  calling `stop()` twice does not double-fire and never throws.
  Verified by the `stopped` guard at `typing.js:48, 61-62` and
  covered by `src/test/typing.test.mjs::"stop() is idempotent"`.

- **G-T5 — No-op when the socket is unavailable.** Success criterion:
  calling `startTyping(null, jid)` returns a `stop` function that is
  also a no-op; no exception is thrown. Verified by
  `typing.js:33-45` and `src/test/typing.test.mjs::"returns a no-op when the socket is null"`.

### 3.2 Non-Goals

- **NG-T1 — Not a media-typing indicator.** No images, voice notes,
  documents, or stickers. WhatsApp presence only carries the
  generic "composing" / "paused" states.
- **NG-T2 — Not a typing indicator inside the per-citation cosine
  gate, the contact-scope post-validate gate, or the inbox writer.**
  Those gates run *during* the typed window; the indicator stays on
  across all of them. The indicator stops only after the real
  `sendMessage` returns or after one of the pre-send gates flips
  the chat to `human_pending_flag`.
- **NG-T3 — Not a typing-indicator for `messages.upsert` inbound
  echoes of the system's own sends.** Those self-echoes are filtered
  upstream (`trigger.js:81-83`) and never enter the auto-reply
  pipeline.
- **NG-T4 — Not a typing indicator while the broadcast worker is
  waiting on anti-ban throttle between recipients.** The broadcast
  `startTyping` is scoped per-recipient (`broadcaster.js:179`), just
  before `_sendWithRetry`, not across the inter-recipient gap. The
  rationale: a separate "typing to N people" affordance is
  misleading and would mask the broadcast's distinct pacing.

## 4. Functional Requirements (cycle-level)

Each requirement cites the integration site and the unit-test where
applicable. Acceptance uses `given / when / then`.

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| T-FR-1 | P0 | **`startTyping(sock, jid)` utility.** Module `src/whatsapp/typing.js` exports one function `startTyping`. On call it fires `sock.sendPresenceUpdate('composing', jid)` immediately, then schedules a `setInterval` every `REFRESH_MS = 4_000` ms that re-emits `composing`. The interval is `.unref()`-ed. Returns a `stop()` function that clears the interval and fires `sock.sendPresenceUpdate('paused', jid)`. `stop()` is idempotent (guarded by a `stopped` flag). All socket errors are swallowed at debug level; missing socket / `jid` / `sendPresenceUpdate` all no-op. | Source: `typing.js:29-71`. Test: `typing.test.mjs` (safeSend × 5, startTyping × 5). |
| T-FR-2 | P0 | **Single-send integration** (`POST /api/messages/send`). On every send, `startTyping(wa.sock, jid)` is called before the `antiBan.check` and the returned `stop` is wired via `try/finally`. | `given` the send controller enters, `when` it reaches the anti-ban branch, `then` a composing indicator is on. `given` the controller exits (any path: 200 / 400 / 429 / 503 / 500), `when` `finally` fires, `then` `paused` is emitted and the interval is cleared. Source: `messageController.js:55, 114-116`. |
| T-FR-3 | P0 | **Broadcast integration.** For each recipient in the worker's `_queue`, `startTyping(wa.sock, recipient.jid)` is called immediately before `_sendWithRetry`, with the returned `stop` wired via `try/finally` (covering both the success branch and the transient / terminal / not-connected catch branches). The indicator is OFF between recipients — the next recipient's send starts a fresh indicator. | `given` a per-recipient send block, `when` `_sendWithRetry` returns or throws, `then` `paused` is emitted and the interval is cleared before the worker moves to the next recipient. Source: `broadcaster.js:179, 245-247`. |
| T-FR-4 | P0 | **AI trigger integration.** For an `ai`-mode chat, `startTyping(sock, chatId)` is called immediately before `createChatCompletion`. The returned `stop` is wired (a) early in the catch block on parse failure (line 282) and (b) via `try/finally` covering the post-LLM gates (steps 9–12: confidence, citation grounding, numerical consistency, send). | `given` an inbound message in `ai`-mode chat, `when` the LLM call begins, `then` a composing indicator is on; `given` a parse error, `then` `stopTyping` fires before the chat is moved to `human_pending_flag`; `given` any post-LLM gate (`confidence_low`, `ungrounded_number`, `send_failure`) or a successful send, `then` `stopTyping` fires via `finally`. Source: `trigger.js:264, 282, 357-358`. |
| T-FR-5 | P0 | **Refresh cadence.** The `setInterval` re-emits `'composing'` every `REFRESH_MS = 4_000` ms. | Source: `typing.js:53-58`. Rationale: Baileys sends `'composing'` once; the WhatsApp server auto-clears presence after ~5–6 s. Test: `typing.test.mjs::"refreshes composing on the REFRESH_MS cadence"`. |
| T-FR-6 | P0 | **Never block graceful shutdown.** The `setInterval` returned by `safeSend` is `unref()`-ed so an active typing indicator does not keep the Node event loop alive. | Source: `typing.js:58`. |
| T-FR-7 | P0 | **Invariant — typing must never break a real send.** All `sendPresenceUpdate` calls live behind `safeSend`'s `.catch` (swallowed at debug level). `startTyping` is a no-op when `sock` is null or `sendPresenceUpdate` is missing. The `stop` returned in those cases is also a no-op. | Source: `typing.js:33-45, 47-66`. Test: `typing.test.mjs::"swallows rejections from sendPresenceUpdate"`, `::"returns a no-op when the socket is null"`. |
| T-FR-8 | P1 | **Invariant — idempotent stop.** `stop()` may be called twice (the `try/finally` + `shouldReturnAfterCatch` path in the broadcast, or `try/finally` + early-return in the AI trigger, can both end up at the same `finally`). The second call is a no-op. | Source: `typing.js:60-65`. Test: `typing.test.mjs::"stop() is idempotent"`. |
| T-FR-9 | P1 | **Unit test coverage.** `src/test/typing.test.mjs` covers: safeSend calls the socket / no-op on null socket / no-op on missing `sendPresenceUpdate` / no-op on null `jid` / swallows rejections; startTyping emits immediately / refreshes on `REFRESH_MS` / `stop()` emits `paused` and clears the interval / `stop()` is idempotent / returns a no-op when socket is null. | Source: `typing.test.mjs:1-158`. |

## 5. Non-Functional Requirements (cycle-level)

| Category | Requirement | Target | Source |
|---|---|---|---|
| Latency budget | Composing indicator arrives at the recipient | within one Baileys round-trip of the trigger call (typically <100 ms LAN, <300 ms WAN) | `typing.js:51` (`safeSend` dispatched as microtask, fire-and-forget) |
| Memory | One `setInterval` per active indicator, auto-cleared on `stop` | O(active indicators) · typically ≤ 1 per single-send in flight, ≤ `BATCH_SIZE` per broadcast job, ≤ 1 per AI chat in `ai`-mode | `typing.js:53-58, 60-65` |
| CPU | One `setInterval` re-emit every `REFRESH_MS = 4_000` ms | negligible (one HTTP-ish packet per 4 s per active indicator) | `typing.js:53-58` |
| Lifecycle / shutdown | Active indicator does not block process exit | `interval.unref()` | `typing.js:58` |
| Failure mode | Socket error during `sendPresenceUpdate` | swallowed at debug level (`logger.debug`); never propagated | `typing.js:33-45` |
| Concurrency | Indicator per (`sock`, `jid`) | one per active path; new call overrides (replaces the interval) | `typing.js:47-66` |
| Test | `pnpm test` typing suite | passes — `safeSend` (5 cases) + `startTyping` (5 cases) = 10 specs | `src/test/typing.test.mjs` |

## 6. How it works (composing / paused + 4 s refresh)

```
caller                 sendPresenceUpdate         recipient's WA UI
──────                 ──────────────────         ──────────────────
startTyping(sock, jid)
   │
   ├─► sock.sendPresenceUpdate('composing', jid)     ──► "typing…" appears
   │
   ├─► setInterval(REFRESH_MS=4s)
   │       │
   │       ├─► sock.sendPresenceUpdate('composing', jid)  ──► refresh
   │       └─► (repeats every 4 s for the duration of the in-flight send)
   │
   └─► return stop

on send-complete / gate-flip / parse-error / cancel:
caller.stop()
   │
   ├─► clearInterval
   ├─► stopped=true (idempotency guard)
   └─► sock.sendPresenceUpdate('paused', jid)         ──► "typing…" disappears
```

Why `composing` not `recording` / `available`: WhatsApp presence has
exactly one signal the user sees as "typing". Baileys' socket enum
maps `'composing'` to the UI affordance. `paused` is the standard
way to clear it cleanly; sending nothing for ~5–6 s would also work
(server-side auto-clear) but a deliberate `paused` makes the UI
disappear at the same instant the message arrives, which feels right.

Why `4 s` not `5 s`: the Baileys doc and the README footnote on the
5–6 s server-side auto-clear suggest 4 s leaves a 1–2 s safety
margin. A shorter value would multiply presence packets without
benefit; a longer one would risk the indicator disappearing mid-send.

## 7. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-T1 | `sendPresenceUpdate` rejection on a flaky network causes a `try/finally` path to log noisily and mask the real send's outcome. | `safeSend` swallows all rejections at debug level (`typing.js:39-44`). The real send runs unchanged. |
| R-T2 | The `setInterval` keeps the process alive, blocking a fast restart. | `interval.unref()` (`typing.js:58`). |
| R-T3 | Two integration sites both call `startTyping` for the same (`sock`, `jid`) concurrently (e.g. a manual `POST /api/messages/send` overlaps the AI trigger path on a self-echoed message). | Each `startTyping` owns its own interval; whichever stops first clears its own. The second continues independently. There is no shared mutable state. |
| R-T4 | The AI trigger's `stopTyping()` is called twice on the parse-error path — once early at `trigger.js:282`, and once via `finally` at `trigger.js:358`. | Idempotent stop (`typing.js:60-62`). The second call is a no-op. |
| R-T5 | The broadcast worker hits a transient error (e.g. 503), `shouldReturnAfterCatch = true`, and yet the `finally` must still fire before the function returns. | `stopTyping` is in `finally` at `broadcaster.js:245-247`; the early `return` at `broadcaster.js:248-250` runs after the `finally`. Order is correct. |
| R-T6 | A future integration site forgets the `try/finally`. | The unit tests document the contract; the cycle-level retro-fit SPEC (`spec.md`) records it as an invariant for the next cycle to inherit. |

## 8. Out-of-Scope (explicit)

- A typing indicator during the **inter-recipient throttle** in a
  broadcast job (only the actual per-recipient send is typed).
- A typing indicator for **inbound self-echoes** of the system's own
  sends (filtered by `trigger.js:76-80`).
- A typing indicator for **media sends** (image / voice / document
  / sticker) — WhatsApp presence only carries `'composing'` /
  `'paused'`.
- A typing indicator for **preview** (`POST /api/crm/ai/reply-preview`,
  which deliberately never sends — no typing affordance makes sense).
- Any **forward-looking PRD** work. This PRD documents the
  just-shipped cycle.

## 9. Approval

- [ ] **PRD_APPROVAL** gate cleared for `be-typing-indicators-2026-07-10`
- [ ] Approved by: @supervisor, on completion of the round-1 verdicts
      (PM / RA / TP / BE) and the round-2 audit.

> This PRD is a **migration artifact** — it documents the typing
> indicator that already ships. Approval here means "this is the
> product as it stands today, post-ship."

## 10. Change Log

| Version | Date       | Author             | Change |
|---------|------------|--------------------|--------|
| 1.0.0   | 2026-07-10 | @product-manager   | Initial draft. Cycle-level retro-fit PRD for `be-typing-indicators-2026-07-10`. Documents `src/whatsapp/typing.js` + its three integration sites (`src/controllers/messageController.js`, `src/whatsapp/broadcaster.js`, `src/ai/whatsapp/trigger.js`). Cites PRD-001 (project-level) and FRD-001 (project-level). attempt_id: `ATT-SEQ1-PM-1`. doc_id: `PRD-TYPING-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. |

---

**Next step after this PRD lands**: the parallel seq 1 dispatches
(`@requirements-analyst` → `docs/be/features/whatsapp-typing/spec.md`,
`@technical-planner` → `docs/be/features/whatsapp-typing/plan.md`,
`@be-engineer` → `docs/be/features/whatsapp-typing/build.md`) anchor
their own documents against this PRD's §4 (Functional Requirements),
§5 (Non-Functional Requirements), and §7 (Risks). Round 2 (Audit)
verifies the four artifacts agree against `src/whatsapp/typing.js`
and the three integration sites.
