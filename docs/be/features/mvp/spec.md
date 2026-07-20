<!--
owner: @requirements-analyst
cycle_id: be-mvp-retrofit-2026-07-10
attempt_id: ATT-SEQ2-RA-1
doc_id: SPEC-MVP-1
linked_prd_cycle: docs/be/features/mvp/prd.md (PRD-MVP-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
purpose: MIGRATION ARTIFACT — per-cycle SPEC decomposing PRD-MVP-1
         into per-feature functional specifications (auth, send,
         broadcast, inbox, antiBan, contacts). Code is the source of
         truth; this SPEC documents what IS, not what should be.
         Every acceptance criterion is verifiable by reading the
         cited src/<path>:<line> location or docs/<path> reference.
         Per-feature test coverage is enumerated in §7.
-->

# Pre-Cycle MVP — SPEC (`be-mvp-retrofit-2026-07-10`)

> **Migration artifact.** Per-cycle SPEC decomposing
> [`PRD-MVP-1`](./prd.md) (peer, written by `@product-manager` in this
> same round) into testable functional specifications, one per
> integration surface, for the six pre-cycle MVP features: **auth,
> single-send, broadcast, inbox, antiBan, contacts**. This SPEC is part
> of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> retro-fit run (seq 2 / Batch 2). **Code is the source of truth** —
> `src/whatsapp/{client.js, antiBan.js, broadcaster.js, typing.js}`,
> `src/controllers/{authController.js, messageController.js,
> broadcastController.js, contactsController.js}`, and
> `src/inbox/writer.js` are authoritative. The cycle has **no
> dedicated unit test file** for pre-cycle MVP code; test surface is
> enumerated honestly in §7 (all `none — gap` except where post-cycle
> hotfix work added coverage of `inbox.getRecentHistory` and
> `inbox.resolveJid`).
>
> **Linked upstream**: [`PRD-MVP-1`](./prd.md) (cycle-level),
> [`PRD-001`](../../../../sot/general/PRD.md) (project-level),
> [`FRD-001`](../../../../sot/general/FRD.md) (project-level —
> features F-1..F-11 cover auth/send/broadcast/inbox/antiBan and
> F-9 covers contacts/LID↔PN).

## Document Metadata

```yaml
---
doc_id: SPEC-MVP-1
version: 1.0.0
status: review
created: 2026-07-10
updated: 2026-07-10
author: @requirements-analyst
attempt_id: ATT-SEQ2-RA-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-mvp-retrofit-2026-07-10
linked_prd_cycle: docs/be/features/mvp/prd.md (PRD-MVP-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
source_of_truth:
  server_entry: src/index.js
  config: src/config/index.js
  whatsapp_client: src/whatsapp/client.js
  antiBan: src/whatsapp/antiBan.js
  broadcaster: src/whatsapp/broadcaster.js
  typing: src/whatsapp/typing.js
  controllers:
    auth: src/controllers/authController.js
    message: src/controllers/messageController.js
    broadcast: src/controllers/broadcastController.js
    contacts: src/controllers/contactsController.js
  inbox_writer: src/inbox/writer.js
  routes:
    auth: src/routes/auth.js
    messages: src/routes/messages.js
    broadcast: src/routes/broadcast.js
    contacts: src/routes/contacts.js
  error_middleware: src/middleware/errorHandler.js
mode: full
classification: EXISTING_PROJECT
linked_frd_features:
  - F-1   # auth lifecycle
  - F-2   # session persistence + reconnect
  - F-3   # 4-state connection machine
  - F-4   # single-send
  - F-6   # broadcast CRUD + stats
  - F-7   # broadcast typing (cross-cut with seq 1)
  - F-8   # inbox markdown writer
  - F-9   # inbox LID↔PN + /api/contacts
  - F-10  # /api/inbox stats
  - F-11  # antiBan policy (all 8 checks + master)
  - F-16  # connection-state error handling (HTTP code mapping)
linked_prd_requirements:
  - FR-1 .. FR-17 (PRD-001 §4.1)
---
```

## 1. Purpose

PRD-MVP-1 documents the cycle intent for the pre-cycle MVP ("the five
shipping features plus the LID↔PN contact mapping that the user
confirmed rolls into inbox per IntakeProposal §3 I2 and Plan §1.3 D2").
This SPEC is the **contract between the PRD and the code** — for
each of the six MVP features, it pins down:

- the exact API contract (request shape, response shape, error shapes,
  HTTP status codes),
- the input/output shape of every module-level function it calls,
- the locked env-var values (from `src/config/index.js:41-59`),
- the failure modes and the anti-ban's role in each,
- the test coverage that exists today, honestly enumerated (§7),
- the explicit non-goals.

Every acceptance criterion is verifiable by **reading the cited code
line** or by **running the cited test name**. No criterion is
aspirational.

## 2. Locked values (verbatim from `src/config/index.js:41-61`)

These values are locked because the code is the source of truth and
the unit tests (where present) assert against them. The anti-ban
module reads its config from `config.antiBan` at construction time
(`src/whatsapp/antiBan.js:42`).

| Constant | Locked value | Env var | Lives at |
|---|---|---|---|
| `ANTI_BAN_ENABLED` | `true` | `ANTI_BAN_ENABLED` (bool) | `src/config/index.js:42` |
| `MIN_DELAY_MS` | `15_000` (ms) | `ANTI_BAN_MIN_DELAY_MS` | `src/config/index.js:43` |
| `MAX_DELAY_MS` | `45_000` (ms) | `ANTI_BAN_MAX_DELAY_MS` | `src/config/index.js:44` |
| `JITTER_FACTOR` | `0.4` (float, **NOT 0.3** — code wins; see FRD-001 OQ-A1) | `ANTI_BAN_JITTER_FACTOR` | `src/config/index.js:45` |
| `BATCH_SIZE` | `20` | `ANTI_BAN_BATCH_SIZE` | `src/config/index.js:46` |
| `BATCH_PAUSE_MS` | `90_000` (ms) | `ANTI_BAN_BATCH_PAUSE_MS` | `src/config/index.js:47` |
| `MAX_PER_HOUR` | `50` | `ANTI_BAN_MAX_PER_HOUR` | `src/config/index.js:48` |
| `MAX_PER_DAY` | `250` | `ANTI_BAN_MAX_PER_DAY` | `src/config/index.js:49` |
| `DEDUPE_WINDOW_MS` | `86_400_000` (24h) | `ANTI_BAN_DEDUPE_WINDOW_MS` | `src/config/index.js:50` |
| `SKIP_IF_MESSAGED_WITHIN_MS` | `120_000` (2 min) | `ANTI_BAN_SKIP_IF_MESSAGED_WITHIN_MS` | `src/config/index.js:51-54` |
| `ACTIVE_HOURS_START` | `0` | `ANTI_BAN_ACTIVE_HOURS_START` | `src/config/index.js:55` |
| `ACTIVE_HOURS_END` | `24` | `ANTI_BAN_ACTIVE_HOURS_END` | `src/config/index.js:56` |
| `MAX_SEND_RETRIES` | `3` | `ANTI_BAN_MAX_SEND_RETRIES` | `src/config/index.js:57` |
| `CONNECTION_WAIT_TIMEOUT_MS` | `30_000` (ms, **NOT 15 000** — code wins; see FRD-001 OQ-A1) | `ANTI_BAN_CONNECTION_WAIT_TIMEOUT_MS` | `src/config/index.js:58-61` |

The `JITTER_FACTOR=0.4` and `CONNECTION_WAIT_TIMEOUT_MS=30_000`
defaults are pinned here verbatim from the code; FRD-001 §7.4 OQ-A1
records the drift between the PRD §5 NFR table (`0.3` / `15_000`)
and the code. **Code is source of truth.** seq 4 audit will reconcile
the PRD table.

The inbox config is also locked, but the anti-ban env-var table is the
primary one — it is what PRD-MVP-1 §"Anti-ban env-var table"
explicitly enumerates. For completeness:

| Constant | Locked value | Env var | Lives at |
|---|---|---|---|
| `INBOX_ENABLED` | `true` | `INBOX_ENABLED` (bool) | `src/config/index.js:64` |
| `INBOX_LOG_DIR` | `./inbox_logs` (resolved to absolute) | `INBOX_LOG_DIR` | `src/config/index.js:65-68` |
| `INBOX_INCLUDE_STATUS` | `false` | `INBOX_INCLUDE_STATUS` (bool) | `src/config/index.js:69` |
| `SESSION_DIR` | `./auth_info` (resolved to absolute) | `SESSION_DIR` | `src/config/index.js:34-37` |

## 3. Cross-cutting invariants (apply to all 6 features)

These invariants MUST hold across all six MVP features. They are
derived from the controllers / writer and are NOT exhaustively
unit-tested (see §7 for the honest test gap).

### 3.1 INV-X1 — error shape is `{ error, message, ...optional }`

Every controller throws errors whose shape becomes the JSON error
response. The middleware `errorHandler` (`src/middleware/errorHandler.js:13-24`)
maps `err.statusCode` to the HTTP status and returns
`{ error: err.name || 'InternalServerError', message: err.message || 'Internal server error' }`.
Controllers add extra fields (`details`, `reason`, `antiBan`) for
specific known cases.

| Site | Error shape | Status |
|---|---|---|
| Validation | `{ error: 'ValidationError', details: [string,...] }` | 400 |
| AntiBan skip | `{ error: 'AntiBanBlocked', reason, message, antiBan }` | 429 |
| `AlreadyAuthenticated` (QR endpoints) | `{ error: 'AlreadyAuthenticated', message, status }` | 409 |
| `QRNotReady` | `{ error: 'QRNotReady', message, status }` | 202 |
| NotConnected | `{ error, message: 'WhatsApp is not connected. ...' }` | 503 |
| NotFound (job) | `{ error: 'NotFound', message }` | 404 |
| Payload too large (`phones.length > 10_000`) | `{ error: 'Error', message }` | 413 |
| Anything else | `{ error: err.name, message: err.message }` | `err.statusCode \|\| 500` |

### 3.2 INV-X2 — phone → JID normalisation

All JIDs in the MVP are `${cleaned}@s.whatsapp.net` where `cleaned`
is `phone` with every non-digit stripped, then validated to be
8–15 digits. The function is `wa._toJid` (`src/whatsapp/client.js:428-438`)
and the identical helper lives as `toJid` in
`src/whatsapp/broadcaster.js:36-46`. Out of range → 400.

### 3.3 INV-X3 — module is the singleton (CommonJS `module.exports = new …()`)

`src/whatsapp/client.js:449`, `src/whatsapp/broadcaster.js:438` are
singletons (default `module.exports = new WhatsAppClient()` / `new
Broadcaster()`). The controllers import the singleton by name. The
inbox writer (`src/inbox/writer.js`) is a module of pure functions +
module-level `Map`s — its module-init code runs at first require
(`loadMappings`/`loadSeenInbound`/`seedSeenInboundFromLogs` at
`writer.js:169-171`).

### 3.4 INV-X4 — antiBan returns `{ kind: 'ok' | 'skip' | 'wait' }`

`src/whatsapp/antiBan.js:114-141`. Callers branch on `.kind`; the
`reason` field is only present when `kind === 'skip'`. The single-send
controller and the broadcaster both consume this shape
(`messageController.js:58, 68`; `broadcaster.js:149, 154, 161`).

## 4. Feature: Auth (`POST /api/auth/*`)

Source: [`src/controllers/authController.js`](../../../../src/controllers/authController.js),
[`src/whatsapp/client.js`](../../../../src/whatsapp/client.js),
[`src/routes/auth.js`](../../../../src/routes/auth.js). Mounted at
`/api/auth` by `src/index.js:41`. Cites FRD-001 §3 (F-1, F-2, F-3).

### 4.1 Behaviour spec

#### 4.1.1 `POST /api/auth/init`

| Field | Value |
|---|---|
| Request body | (none — empty body) |
| 200 response | `{ message: "Already connected to WhatsApp", status }` when `wa.isConnected()` is true |
| 202 response | `{ message, status }` after `wa.initialize()` resolves |
| 4xx / 5xx | Bubbled via `next(err)`; `errorHandler` returns `{ error: err.name, message }` with `err.statusCode` |

Behavior: `authController.js:5-22`. If the socket is already open it
short-circuits with 200; otherwise calls `wa.initialize()` (which sets
`state = 'connecting'` synchronously, then resolves once the QR or
`'open'` event lands, whichever comes first; see
`client.js:80-83, 232-247`).

#### 4.1.2 `GET /api/auth/qr`

| Field | Value |
|---|---|
| Request body | (none) |
| 200 response | Raw PNG bytes; headers `Content-Type: image/png`, `Content-Length`, `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, `X-WhatsApp-State: qr` |
| 202 response | `{ error: 'QRNotReady', message, status }` when the socket is still connecting; `X-WhatsApp-State` header carries current state |
| 409 response | `{ error: 'AlreadyAuthenticated', message, status }` when socket is open |
| Auto-init | If the socket is in `close` state and not currently initializing, the controller triggers `wa.initialize()` itself before returning 202 |

Behavior: `authController.js:24-56`.

#### 4.1.3 `GET /api/auth/qr.json`

Same semantics as `/qr` but the body is
`{ message, qr: 'data:image/png;base64,…', mimeType: 'image/png', status }`
and headers are not set. (`authController.js:58-88`.)

#### 4.1.4 `GET /api/auth/status`

Always 200. Body: `{ status: { state, connected, user, lastError, reconnectAttempts } }`
where `state ∈ {close, connecting, qr, open}`. `status` derives from
`wa.getStatus()` (`client.js:49-57`). `connected = isConnected()`
which additionally verifies `sock.ws.readyState === 1` when the WS is
exposed (`client.js:38-47`).

#### 4.1.5 `POST /api/auth/logout`

Returns 200 `{ message: 'Logged out and session cleared' }` after
`wa.logout()` tears down the socket, wipes `auth_info/`, and clears
`user` / `lastQR` / `_wasEverOpen` (`client.js:367-372, 352-365`).

### 4.2 Acceptance criteria (auth)

| AC | Given | When | Then |
|---|---|---|---|
| AUTH-AC-1 | no `auth_info/`, no socket | `POST /api/auth/init` | 202 with `{ message, status }`; `status.state = 'connecting'` |
| AUTH-AC-2 | socket in `connecting` or `qr` | `GET /api/auth/qr` | 200 raw PNG bytes (200) OR 202 with `X-WhatsApp-State` header (still connecting) |
| AUTH-AC-3 | socket in `connecting` or `qr` | `GET /api/auth/qr.json` | 200 `{ message, qr: 'data:image/png;base64,…', mimeType, status }` |
| AUTH-AC-4 | operator scanned QR | `GET /api/auth/status` | 200 `{ status: { state: 'open', connected: true, user, lastError, reconnectAttempts: 0 } }` |
| AUTH-AC-5 | open socket | `POST /api/auth/logout` | 200 `{ message: 'Logged out and session cleared' }`; subsequent `init` requires a fresh QR |
| AUTH-AC-6 | saved `auth_info/creds.json` | server start | `wa.initialize()` is called automatically and the AI trigger is wired to `sock.ev.on('messages.upsert', …)` |
| AUTH-AC-7 | unexpected disconnect, no `loggedOut` flag | `connection.update` with `connection: 'close'` | reconnect scheduled via exponential backoff `2s × 2^n` capped at `30s` |
| AUTH-AC-8 | disconnect with `loggedOut` flag (and `_wasEverOpen`) | `connection.update` with `connection: 'close'` and `lastDisconnect.error.output.statusCode === DisconnectReason.loggedOut` | `auth_info/` deleted; `_wasEverOpen` reset; next `init` requires a fresh QR |
| AUTH-AC-9 | `connection.update` for any reason | event fires | `state ∈ {'close','connecting','qr','open'}` (the 4-state machine) |

Citations: `src/routes/auth.js:8-12`; `src/controllers/authController.js:5-103`;
`src/whatsapp/client.js:16-21, 38-47, 49-57, 63-226, 249-320, 352-365, 367-372`;
`src/index.js:38, 41, 110-138`.

### 4.3 NG (auth)

- **AUTH-NG-1** No multi-tenant session keys (PRD NG1).
- **AUTH-NG-2** No JWT / OAuth / token auth on the HTTP API (PRD NG2,
  README §"Security notes"). The API is bound to `0.0.0.0` by default
  (`config.server.host`); the operator must bind to `127.0.0.1` or
  front with a reverse proxy.

## 5. Feature: Single-send (`POST /api/messages/send`)

Source: [`src/controllers/messageController.js`](../../../../src/controllers/messageController.js),
[`src/routes/messages.js`](../../../../src/routes/messages.js).
Mounted at `/api/messages/send` by `src/index.js:42`. Cites FRD-001
§4 (F-4) and §4.3 (F-5 typing indicator, owned by seq 1 but wired
through this controller at `messageController.js:55, 115`).

### 5.1 Behaviour spec

#### 5.1.1 Request shape

```json
{ "phone": "+62 812-3456-7890", "message": "Hello" }
```

| Field | Required | Type | Validation |
|---|---|---|---|
| `phone` | yes | string | 8–15 digits after stripping non-digits (INV-X2) |
| `message` | yes | string | non-empty after `.trim()` |

#### 5.1.2 Response shapes

| Status | Body | When |
|---|---|---|
| 200 | `{ success: true, data: { messageId, to, text, timestamp } }` | socket returned `sendMessage` successfully |
| 400 | `{ error: 'ValidationError', details: [...] }` | body missing `phone` / `message` OR wrong type |
| 400 | `{ error: 'Error', message: 'Invalid phone number "…". …' }` | phone out of 8–15 digit range |
| 429 | `{ error: 'AntiBanBlocked', reason, message, antiBan }` | `antiBan.check(...) === { kind: 'skip', reason }` |
| 503 | `{ error, message: 'WhatsApp is not connected. …' }` | `wa.isConnected() === false` |
| 503 | `{ error, message: 'Connection lost while waiting' }` | `check.kind === 'wait'` and the post-wait `wa.isConnected()` returns false |
| 500 | `{ error, message }` | unexpected `sendMessage` rejection (bubbles to `next(err)`) |

#### 5.1.3 Anti-ban gate wiring

`messageController.js:9` instantiates `new AntiBan()` with the
process-wide config (the same singleton that `broadcaster.js:92`
holds). The flow at `messageController.js:55-115`:

1. `startTyping(wa.sock, jid)` (line 55) — seq 1 cycle, see
   `src/test/typing.test.mjs` for evidence.
2. `antiBan.check(jid, contentHash)` (line 58). If `kind === 'skip'`
   return 429 with the structured reason.
3. If `kind === 'wait'`, await `Math.min(delayMs, 60_000)` then
   re-check `wa.isConnected()`; if false, throw 503.
4. `wa.sock.sendMessage(jid, { text: message })` (line 81).
5. `antiBan.recordSent(jid, message)` — increments the hourly/daily
   counter, sets per-recipient cooldown, and records the SHA-256 of
   the content for dedupe (`antiBan.js:166-184`).
6. `inbox.markLogged(sent?.key?.id)` — marks the id so a
   `messages.upsert` echo is skipped.
7. `inbox.record(jid, { direction: 'out', body: message, ... })` —
   appends `[out] me` to the contact's markdown.
8. Return `{ success: true, data: { messageId, to, text, timestamp } }`.
9. `finally { stopTyping() }` (line 114-116) — seq 1 cycle.

### 5.2 Acceptance criteria (single-send)

| AC | Given | When | Then |
|---|---|---|---|
| S-AC-1 | valid `{ phone, message }`, socket open, anti-ban ok | `POST /api/messages/send` | 200 with `{ success: true, data: { messageId, to, text, timestamp } }` |
| S-AC-2 | body missing `phone` or `message` | endpoint hit | 400 `{ error: 'ValidationError', details: [...] }` |
| S-AC-3 | `phone` is 7 digits or 16 digits | endpoint hit | 400 with message starting `Invalid phone number "…"` |
| S-AC-4 | `ANTI_BAN_ENABLED=true`, `MAX_PER_HOUR` exceeded (51st in an hour) | endpoint hit | 429 `{ error: 'AntiBanBlocked', reason: 'quota_exceeded', ... }`; **no slot consumed** (check is pure, `recordSent` only on success) |
| S-AC-5 | recipient was sent anything in last `SKIP_IF_MESSAGED_WITHIN_MS` (default 2 min) | endpoint hit | 429 `{ reason: 'recipient_cooldown' }` |
| S-AC-6 | same exact `message` was sent to same number in last `DEDUPE_WINDOW_MS` (default 24h) | endpoint hit | 429 `{ reason: 'duplicate_content' }` |
| S-AC-7 | now is outside `ACTIVE_HOURS_START..END` (default 0..24 → always on) | endpoint hit | 429 `{ reason: 'outside_active_hours' }` |
| S-AC-8 | `wa.isConnected() === false` | endpoint hit | 503 `{ error, message: 'WhatsApp is not connected. …' }` |
| S-AC-9 | socket dropped after the anti-ban throttle wait but before `sendMessage` | endpoint hit | 503 `{ error, message: 'Connection lost while waiting' }` |
| S-AC-10 | `wa.sock.sendMessage` rejects with a 400/404 | endpoint hit | error bubbles via `next(err)` → `errorHandler` returns 400/404 `{ error, message }`; **finally still runs `stopTyping()`** |
| S-AC-11 | successful send | the socket returns `messageId` | an `[out] me\n<text>` line is appended to `inbox_logs/wa-chat-<jid>.md` |
| S-AC-12 | `inbox.record` throws (markdown log write fails) | send succeeded | 200 still returned; warn log emitted; the message was delivered |

Citations: `src/routes/messages.js:8`; `src/controllers/messageController.js:11-28, 30-119`;
`src/whatsapp/antiBan.js:114-141, 166-184`;
`src/inbox/writer.js:391-457`.

### 5.3 NG (single-send)

- **S-NG-1** Media sends (image / video / document / audio / sticker) —
  out of scope, only text is supported.
- **S-NG-2** Reactions are not sent (the inbox writer also skips
  inbound reactions; symmetry is by design, `inbox/writer.js:338`).
- **S-NG-3** Group sends are not routed through this controller; they
  must go through the broadcast worker. Pre-formatted JIDs (ending in
  `@s.whatsapp.net`) are accepted by `broadcaster.toJid` /
  `isJid` but not by `_toJid` (which re-runs the regex; an
  already-JIDed input still passes because the digits-only regex keeps
  the digits and re-appends `@s.whatsapp.net`).

## 6. Feature: Broadcast (`POST /api/messages/broadcast`)

Source: [`src/controllers/broadcastController.js`](../../../../src/controllers/broadcastController.js),
[`src/whatsapp/broadcaster.js`](../../../../src/whatsapp/broadcaster.js),
[`src/routes/broadcast.js`](../../../../src/routes/broadcast.js).
Mounted at `/api/messages/broadcast` by `src/index.js:43`. Cites
FRD-001 §5 (F-6) and §5.3 (F-7 typing, owned by seq 1).

### 6.1 Behaviour spec

#### 6.1.1 Request / response (POST `/api/messages/broadcast`)

| Field | Required | Constraint |
|---|---|---|
| `phones` | yes | non-empty array, max 10 000 entries |
| `message` | yes | non-empty string after `.trim()` |

| Status | Body | When |
|---|---|---|
| 202 | full `summarize(job)` | new job created |
| 400 | `{ error: 'Error', message: '"phones" must be a non-empty array' }` | missing or empty `phones` |
| 400 | `{ error: 'Error', message: '"message" must be a non-empty string' }` | empty `message` |
| 400 | `{ error: 'Error', message: 'No valid phone numbers in payload', details: errors }` | every entry invalid |
| 413 | `{ error: 'Error', message: '"phones" length exceeds maximum of 10,000 per job' }` | `phones.length > 10_000` |

#### 6.1.2 Job summary shape (`summarize`, `broadcaster.js:411-435`)

```jsonc
{
  "jobId": "<8-byte-hex>",
  "status": "running" | "completed" | "cancelled",
  "total": <int>, "sent": <int>, "failed": <int>, "skipped": <int>, "pending": <int>,
  "results": [
    { "phone", "jid", "status": "pending|sent|skipped|failed",
      "messageId": null|string, "sentAt": null|number,
      "finishedAt": null|number, "skipReason": null|string,
      "error": null|string }
  ],
  "errors": [{ "phone": <raw input>, "error": <validation msg> }],
  "antiBan": { "enabled", "messagesLastHour", "messagesLastDay", "limits": { … } },
  "createdAt": <ms epoch>, "completedAt": null|<ms epoch>
}
```

#### 6.1.3 Other endpoints

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/messages/broadcast/:jobId` | Returns the live `summarize`; 404 if unknown job |
| GET | `/api/messages/broadcast` | Returns `{ jobs: [summarize, …] }` |
| GET | `/api/messages/broadcast/stats` | Returns `{ antiBan: antiBan.getStats() }` |
| DELETE | `/api/messages/broadcast/:jobId` | Cancels the job; pending → `skipped` with `skipReason: 'cancelled'`; 404 if unknown |

`broadcastController.js:6-43`, `broadcaster.js:375-435`.

#### 6.1.4 Worker pacing

`broadcaster._tick` (lines 108-256) processes recipients one at a time:

1. Pop next `recipient` from `_queue`.
2. If `signal.aborted`: mark `skipped / skipReason: 'cancelled'`, continue.
3. `check = antiBan.check(recipient.jid, contentHash)`.
4. If `kind === 'skip'`: mark `skipped / skipReason`, continue.
5. If `kind === 'wait'`: unshift the recipient, set `_nextAt = now + delayMs`, schedule tick, return.
6. `startTyping(wa.sock, recipient.jid)` (line 179) — seq 1 cycle.
7. `sent = await _sendWithRetry(active, recipient.jid, active.message)`.
8. On success: `recipient.status = 'sent'`, `recipient.messageId`, `antiBan.recordSent`, `inbox.markLogged`, `inbox.record(...)`, `_finalizeRecipient`, `_nextAt = now + 1_000`.
9. On terminal error (400/401/403/404/405/410): `status = 'failed'`, `error = 'terminal_<code>: <msg>'`.
10. On transient error (408/429/500/502/503/504/521/522/524): unshift recipient, `_nextAt = now + 60_000`, `shouldReturnAfterCatch = true` (deferred-return after `finally`).
11. On `NOT_CONNECTED`: `status = 'failed' / error = 'not_connected'`.
12. On any other: `status = 'failed' / error = err.message`.
13. `finally { stopTyping() }` (line 245-247) — seq 1 cycle.
14. If `shouldReturnAfterCatch` return; else `_finalizeRecipient` and `_scheduleTick(1_000)`.

`MAX_SEND_RETRIES = 3` (default), `CONNECTION_WAIT_TIMEOUT_MS = 30_000`
(default) — see `src/config/index.js:57-61`.

### 6.2 Acceptance criteria (broadcast)

| AC | Given | When | Then |
|---|---|---|---|
| B-AC-1 | non-empty `phones` (≤ 10 000) and non-empty `message` | `POST /api/messages/broadcast` | 202 with `summarize(job)`; `status: 'running'`, `pending: total` |
| B-AC-2 | `phones` empty or not an array | endpoint hit | 400 `{ error: 'Error', message: '"phones" must be a non-empty array' }` |
| B-AC-3 | `phones.length > 10_000` | endpoint hit | 413 with message starting `'"phones" length exceeds maximum…'` |
| B-AC-4 | every `phone` is invalid (e.g., 5 digits) | endpoint hit | 400 with `details` array; no job created |
| B-AC-5 | running job | `GET /api/messages/broadcast/:jobId` | 200 with live `summarize` (per-recipient status, `pending` count, `antiBan` stats) |
| B-AC-6 | unknown `jobId` | `GET /api/messages/broadcast/:jobId` | 404 `{ error: 'NotFound', message: 'Job … not found' }` |
| B-AC-7 | running job | `DELETE /api/messages/broadcast/:jobId` | 200 with `status: 'cancelled'`; remaining `pending` recipients flipped to `skipped / skipReason: 'cancelled'`; in-flight recipient's `_sendWithRetry` throws `'cancelled'` and is marked `failed` |
| B-AC-8 | unknown job | `DELETE /api/messages/broadcast/:jobId` | 404 |
| B-AC-9 | any state | `GET /api/messages/broadcast` | 200 `{ jobs: [summarize, …] }` |
| B-AC-10 | any state | `GET /api/messages/broadcast/stats` | 200 `{ antiBan: { enabled, messagesLastHour, messagesLastDay, limits: {...} } }` |
| B-AC-11 | socket drops mid-broadcast, reconnects within `CONNECTION_WAIT_TIMEOUT_MS` | `_sendWithRetry` runs | worker waits; no recipient is marked `failed` due to the drop |
| B-AC-12 | transient error (408/429/5xx) | `sendMessage` returns | recipient unshifted; `_nextAt = now + 60_000`; `_scheduleTick(60_000)`; deferred-return runs AFTER `finally` (indicator OFF during 60 s backoff) |
| B-AC-13 | terminal error (400/401/403/404/405/410) | `sendMessage` returns | `recipient.status = 'failed'; recipient.error = 'terminal_<code>: <msg>'`; `antiBan.recordFailure` called; **no retry** |
| B-AC-14 | socket not connected for the whole `CONNECTION_WAIT_TIMEOUT_MS` | `_sendWithRetry` runs | throws `code: 'NOT_CONNECTED'`; recipient marked `failed / error: 'not_connected'`; **no retry** |
| B-AC-15 | `antiBan.check` returns `{ kind: 'wait', delayMs }` | tick processes the recipient | recipient unshifted back onto queue; `_nextAt = now + delayMs`; `_scheduleTick(delayMs)`; **NO typing indicator** (the wait branch returns before `startTyping`) |
| B-AC-16 | `ANTI_BAN_ENABLED=false` | tick processes the recipient | `check()` returns `{ kind: 'ok' }` immediately; no throttle delays applied |
| B-AC-17 | successful send | the socket returns `messageId` | `[out] me\n<text>` appended to `inbox_logs/wa-chat-<jid>.md` |
| B-AC-18 | pre-formatted JID in `phones` (string ending `@s.whatsapp.net`) | `createJob` | accepted as-is via `isJid(raw)`; treated as the recipient JID |
| B-AC-19 | duplicate phone in `phones` | `createJob` | second copy added to `errors[]` with `error: 'duplicate_in_payload'`; first copy is enqueued |

Citations: `src/routes/broadcast.js:8-12`; `src/controllers/broadcastController.js:6-43`;
`src/whatsapp/broadcaster.js:11-30, 48-58, 60-88, 108-256, 258-288, 290-373, 375-435`;
`src/config/index.js:57-61`.

### 6.3 NG (broadcast)

- **B-NG-1** Durable queue — the README recommends BullMQ / external
  queue; not in scope (Phase 3 deferred per `docs/be/MVP.md §10`).
- **B-NG-2** Media sends (see S-NG-1).
- **B-NG-3** Inter-recipient typing indicator is OFF by design — the
  indicator is per-recipient only (`PRD-TYPING-1 §3.2 NG-T4`,
  `broadcaster.js:179`).

## 7. Feature: Inbox markdown writer + `/api/inbox` stats

Source: [`src/inbox/writer.js`](../../../../src/inbox/writer.js),
[`src/index.js:39`](../../../../src/index.js). Cites FRD-001 §6.2 (F-8)
and §6.4 (F-10).

### 7.1 Behaviour spec

#### 7.1.1 `GET /api/inbox`

Always 200; body `{ contacts: [{ jid, count, firstSeen, lastSeen, pushName, kind }, …] }`
where `kind ∈ {'contact', 'group', 'status'}`. The endpoint calls
`inbox.getStats()` which returns an array of all JIDs that have been
written at least once.

#### 7.1.2 Markdown writer (`writer.record`)

Inputs: `remoteJid, { direction, pushName, ts, body, kind, mime, msgId }`.
Returns: a `Promise` that resolves once the per-JID queue task
completes (sequential per-JID via `writeQueues`).

Pipeline (`writer.js:391-457`):

1. If `!config.inbox.enabled` → no-op.
2. If `isNewsletter(remoteJid)` → no-op.
3. If `isStatus(remoteJid)` and `!config.inbox.includeStatus` → no-op.
4. `remoteJid = resolveJid(remoteJid)` — LID → PN mapping.
5. If `writtenIds.has(msgId)` → no-op (idempotency).
6. If `kind` is `empty` / `reaction` / `protocol` → no-op.
7. If `kind === 'unknown'` → log debug, no-op.
8. Format entry (header `**[YYYY-MM-DD HH:MM:SS] [in ]|out name**`, body).
9. Chain the task onto the per-JID promise queue; the task appends to
   `pathFor(remoteJid)` and adds `msgId` to `writtenIds` for
   `RECENT_TTL_MS = 10 * 60 * 1000` ms.

#### 7.1.3 File naming

`writer.fileNameFor` (lines 229-238):

| JID | File name |
|---|---|
| `${bare}@s.whatsapp.net` (resolved from `${bare}@lid`) | `wa-chat-${digits}.md` |
| `${id}@g.us` | `wa-chat-group-${digits}.md` |
| `status@broadcast` | `wa-chat-status.md` |
| `${id}@newsletter` | (skipped, no file) |

`sanitizeForFile` strips everything but digits from the part before `@`
and falls back to `'unknown'` if the result is empty.

#### 7.1.4 Entry format (`formatEntry`, `writer.js:346-361`)

```
**[2026-07-10 14:23:45] [in ] ray**
[image:jpeg] caption text

**[2026-07-10 14:23:50] [out] me**
reply text

```

For media (`kind !== 'text'`), the placeholder is `[<kind>:<shortMime>]`
followed by the body (caption or filename for documents).

#### 7.1.5 Header (on first write only, `makeHeader` lines 363-375)

```
# WhatsApp chat with 6281234567890 (Ray)

> Created: 2026-07-08 19:21:11

---
```

#### 7.1.6 LID → PN mapping (`writer.js:61` for `resolveJid`; `writer.js:49-67, 178-188, 190-195` for the module surface)

`resolveJid(jid)` is defined at `src/inbox/writer.js:61-67`: if `jid`
ends with `@lid`, look up the bare LID in `lidToPn`; if found, return
the PN JID; otherwise return the input unchanged. `registerLid(lid, pn)`
(`writer.js:178-188`) validates both sides are 8–15 digits, stores
`${bareLid}@lid → ${barePn}@s.whatsapp.net`, and persists
`{selfPn, mappings}` to `inbox_logs/.lid-mappings.json`
(`writer.js:69-77`).

#### 7.1.7 `getRecentHistory(chatId, limit)` (`writer.js:599-627`)

Parses the markdown file, returns `[{ role, content, ts }]` for up to
`limit` (default 6) previous messages (the most recent is excluded).
For non-contact JIDs (status / group / LID / newsletter) returns `[]`.

### 7.2 Acceptance criteria (inbox)

| AC | Given | When | Then |
|---|---|---|---|
| INB-AC-1 | an inbound 1:1 text message | `sock.ev.on('messages.upsert', …)` fires | `**[YYYY-MM-DD HH:MM:SS] [in ] <pushName\|barepn>**\n<body>\n\n` is appended to `inbox_logs/wa-chat-<barepn>.md` |
| INB-AC-2 | a media message (image/video/document/audio/sticker) | event fires | `[<kind>:<shortMime>] <caption or '(sticker)' | '(voice note)' | …>` written below the header |
| INB-AC-3 | a reaction / protocol / empty body | event fires | `record()` returns a no-op Promise; nothing written |
| INB-AC-4 | two inbound events for the same JID in the same tick | events fire | the per-JID promise chain serialises; the resulting file does not interleave |
| INB-AC-5 | a group JID ending `@g.us` | writer processes it | file name is `wa-chat-group-<bareid>.md`; header reads `WhatsApp group chat — <bareid>` |
| INB-AC-6 | a `status@broadcast` JID, `INBOX_INCLUDE_STATUS=false` (default) | writer processes it | no file written; no entry recorded |
| INB-AC-7 | `inbox.markLogged(messageId)` was called by the explicit outbound path before the `messages.upsert` echo arrives | event handler receives the echo | `if (inbox.wasLogged(msg?.key?.id)) continue;` skips the event at `client.js:150` |
| INB-AC-8 | history-sync event with `type: 'append'` | writer processes it | appended to the contact's file (history builds up on first reconnect) |
| INB-AC-9 | a `@lid` JID with a registered mapping | writer computes the file name | resolves to PN first; writes to PN's file |
| INB-AC-10 | a `@lid` JID with NO mapping | writer processes it | file name falls back to `wa-chat-<lid-bare>.md` (best-effort; will be remapped on the next `senderPn` event) |
| INB-AC-11 | the inbox writer is asked to recall the last N messages | `getRecentHistory(chatId, 6)` | returns up to 6 prior `{role, content, ts}` entries; the most recent is dropped; for status / group / LID / newsletter returns `[]` |
| INB-AC-12 | writer has processed ≥ 1 message for a JID | `GET /api/inbox` | the JID appears in `contacts` with `count ≥ 1` and non-null `firstSeen` |
| INB-AC-13 | server restart with `.lid-mappings.json` present on disk | boot | `loadMappings` repopulates `lidToPn` and `selfPnBare`; `loadSeenInbound` repopulates `seenLidInbound`; `seedSeenInboundFromLogs` does NOT re-seed (because `seenLidInbound.size > 0` after `loadSeenInbound`) |
| INB-AC-14 | server restart with no `.lid-mappings.json` but existing `wa-chat-*.md` files | boot | `seedSeenInboundFromLogs` adds the bare PN from any file containing `[in ]` to `seenLidInbound`; persisted to `.lid-seen-inbound.json` |

Citations: `src/inbox/writer.js:33-39, 45-47, 49-67, 95-115, 117-135, 141-167, 169-171, 178-188, 190-195, 229-238, 257-344, 346-361, 363-389, 391-457, 484-533, 545-547, 565-578, 599-627`;
`src/whatsapp/client.js:122-168`; `src/index.js:39, 124`.

### 7.3 NG (inbox)

- **INB-NG-1** Raw media binaries are not stored — the writer produces
  placeholders only (README §"Inbound message logging").
- **INB-NG-2** Real-time UI updates (WebSocket) for the inbox —
  out of scope per `docs/be/MVP.md §10`.
- **INB-NG-3** View-once wrapper messages are unwrapped
  (`writer.js:264-269`) but the unwrapped content is logged, not the
  view-once shell; this is by design (the unwrap is transparent).

## 8. Feature: AntiBan (cross-cutting)

Source: [`src/whatsapp/antiBan.js`](../../../../src/whatsapp/antiBan.js),
[`src/config/index.js:41-61`](../../../../src/config/index.js).
Cites FRD-001 §7 (F-11).

### 8.1 Behaviour spec

#### 8.1.1 Module API

`new AntiBan(opts = {})` — constructor takes an optional overrides
object that is shallow-merged over `config.antiBan` (`antiBan.js:41-49`).
Two instances exist in the codebase: the singleton used by
`broadcaster.js:92` and the per-process instance created by
`messageController.js:9`. They share state ONLY if they are the same
singleton — they are NOT the same object (so their counters diverge).
This is intentional: the single-send path is rate-limited independently
from the broadcast worker.

#### 8.1.2 `isEnabled()`

Returns `this.opts.enabled !== false`. Default `true`. When `false`,
`check()` returns `{ kind: 'ok' }` immediately (`antiBan.js:51-53,
115`).

#### 8.1.3 `check(phone, contentHash, now = Date.now())` — PURE

Decision order (`antiBan.js:114-141`):

1. If `!isEnabled()` → `{ kind: 'ok' }`.
2. `_maybeCleanup(now)` — once-per-60s, drop timestamps outside their
   windows, drop stale per-recipient / per-content entries.
3. If `_inActiveHours(now)` is false → `{ kind: 'skip', reason: 'outside_active_hours' }`.
4. If `_skipIfRecentlyMessaged(phone, now)` → `{ kind: 'skip', reason: 'recipient_cooldown' }`.
5. If `_isDuplicate(phone, contentHash, now)` → `{ kind: 'skip', reason: 'duplicate_content' }`.
6. If `!_withinQuotas(now)` → `{ kind: 'skip', reason: 'quota_exceeded' }`.
7. Compute `_desiredGap(now)`:
   - If `sendsSoFar % batchSize === 0` (and `sendsSoFar > 0` and
     `batchSize > 0` and `batchPauseMs > 0`): return `jitter(batchPauseMs, jitterFactor)`.
   - Else: `base = minDelayMs + random() × (max(maxDelayMs, minDelayMs) - minDelayMs)`, then
     `jitter(base, jitterFactor)`.
8. If `lastSendAt > 0` and `now - lastSendAt < desiredGap` → `{ kind: 'wait', delayMs: desiredGap - elapsed }`.
9. Else → `{ kind: 'ok' }`.

`jitter(amount, factor)` adds a uniformly random offset in `[-factor×amount, +factor×amount]`.

#### 8.1.4 `recordSent(phone, content, now = Date.now())`

When enabled, pushes `now` to `_hourTimestamps` and `_dayTimestamps`,
sets `_lastSentPerPhone[phone] = now`, sets `_lastSendAt = now`, and
(if `dedupeWindowMs > 0`) records `sha256(content)` for the phone.

#### 8.1.5 `recordFailure(phone)` — no-op by design

`antiBan.js:186-190`. A failure is already a signal not to push the
same payload again soon, so quota is NOT consumed and per-recipient
cooldown still applies on the next attempt.

#### 8.1.6 `getStats()` — for `GET /api/messages/broadcast/stats`

Returns `{ enabled, messagesLastHour, messagesLastDay, limits: { maxPerHour, maxPerDay, minDelayMs, maxDelayMs, batchSize, batchPauseMs, dedupeWindowMs, skipIfMessagedWithinMs, activeHours: {start, end} } }`
(`antiBan.js:192-215`).

### 8.2 Acceptance criteria (antiBan)

| AC | Given | When | Then |
|---|---|---|---|
| AB-AC-1 | `ANTI_BAN_ENABLED=true`, `MAX_PER_HOUR` exceeded (51st send in an hour) | `check(phone, hash)` runs | `{ kind: 'skip', reason: 'quota_exceeded' }`; **no slot consumed** (check is pure) |
| AB-AC-2 | recipient was sent anything in last `SKIP_IF_MESSAGED_WITHIN_MS` | `check` runs | `{ kind: 'skip', reason: 'recipient_cooldown' }` |
| AB-AC-3 | same `contentHash` was sent to same phone in last `DEDUPE_WINDOW_MS` | `check` runs | `{ kind: 'skip', reason: 'duplicate_content' }` |
| AB-AC-4 | now is outside `[ACTIVE_HOURS_START, ACTIVE_HOURS_END)` | `check` runs | `{ kind: 'skip', reason: 'outside_active_hours' }` |
| AB-AC-5 | all checks pass, last send was `Δ < desiredGap` ago | `check` runs | `{ kind: 'wait', delayMs: desiredGap - Δ }`; if `Δ ≥ desiredGap` → `{ kind: 'ok' }` |
| AB-AC-6 | `sendsSoFar % BATCH_SIZE === 0` and `sendsSoFar > 0` | `_desiredGap` runs | returns `jitter(BATCH_PAUSE_MS, JITTER_FACTOR)` (defaults: 90s ± 36s) |
| AB-AC-7 | otherwise | `_desiredGap` runs | returns `jitter(minDelayMs + random×(maxDelayMs − minDelayMs), jitterFactor)` (defaults: 15–45s ± 40%) |
| AB-AC-8 | `recordSent` called after a successful send | mutation | `_hourTimestamps.push(now)`; `_dayTimestamps.push(now)`; `_lastSentPerPhone[phone] = now`; `_lastSendAt = now`; SHA-256 of `content` stored under the phone |
| AB-AC-9 | `recordFailure` called | mutation | NO state change; per-recipient cooldown still applies on the next attempt |
| AB-AC-10 | `ANTI_BAN_ENABLED=false` | `check` runs | `{ kind: 'ok' }` regardless of counters |
| AB-AC-11 | `getStats()` is called | returns `{ enabled, messagesLastHour, messagesLastDay, limits }` with current values |

Citations: `src/whatsapp/antiBan.js:10-21, 41-49, 51-53, 55-62, 64-80, 82-89, 91-103, 114-141, 143-164, 166-184, 186-190, 192-215`;
`src/config/index.js:41-61`.

### 8.3 NG (antiBan)

- **AB-NG-1** Multi-tenant quotas — single-process, single-WhatsApp-account
  per the PRD (NG1).
- **AB-NG-2** Persisted state across restarts — the counters live in
  memory; restart resets them. Documented in README §"Anti-ban behaviour".

## 9. Feature: Contacts (`/api/contacts`)

Source: [`src/controllers/contactsController.js`](../../../../src/controllers/contactsController.js),
[`src/inbox/writer.js` LID↔PN module (`registerLid` / `listLidMappings`)](../../../../src/inbox/writer.js),
[`src/routes/contacts.js`](../../../../src/routes/contacts.js).
Mounted at `/api/contacts` by `src/index.js:44`. Cites FRD-001 §6.3
(F-9 — LID↔PN mapping registration).

### 9.1 Behaviour spec

#### 9.1.1 `GET /api/contacts`

Always 200; body `{ contacts: [{ lid: '<digits>@lid', pn: '<digits>@s.whatsapp.net' }, …] }`.
Returns the current `lidToPn` Map as an array of `{lid, pn}`.

#### 9.1.2 `POST /api/contacts`

Request body: `{ lid: '<digits>@lid', pn: '<digits>' or '<digits>@s.whatsapp.net' }`.

| Status | Body | When |
|---|---|---|
| 200 | `{ registered: <bool>, mappings: [{lid, pn}, …] }` | validation passes; `registered = (after > before)` |
| 400 | `{ error: 'ValidationError', details: ['"lid" and "pn" must be strings'] }` | `lid` or `pn` not a string |
| 400 | `{ error: 'ValidationError', details: ['"lid" must end with @lid'] }` | `lid` does not end with `@lid` |

Behaviour: `registerLid(lid, pn)` validates both bare forms are
8–15 digits; if either fails, `registered = false`. The mapping is
persisted to `inbox_logs/.lid-mappings.json` (`writer.js:69-77, 184-186`).

#### 9.1.3 Auto-learn from inbound messages (`writer.js:469-510, 512-520, 521-533`)

| Inbound event | What is auto-registered |
|---|---|
| `key.senderPn` set, `key.senderLid` set OR `isLid(rawJid)` | `${senderLid or LID-from-rawJid}@lid → ${senderPn}@s.whatsapp.net` |
| `key.participantPn` and `key.participantLid` set (group message) | `${participantLid}@lid → ${participantPn}@s.whatsapp.net` |
| `key.participantPn` and `isLid(key.participant)` (group message) | `${participantLid-from-jid}@lid → ${participantPn}@s.whatsapp.net` |
| Inbound to `@lid` JID (`!fromMe`) | `lidBare` is added to `seenLidInbound`, persisted to `.lid-seen-inbound.json` |
| Self-echo (`fromMe && isLid(rawJid) && selfPnBare`) AND LID NOT in `seenLidInbound` AND NOT already mapped | `${lidBare}@lid → selfPnBare` (auto-self-LID) |

The auto-self-LID rule is what makes the auto-learner safe — a chat
where someone else is the recipient always has at least one inbound
event, so the LID is never misregistered as your own. True self-chats
(you sending to yourself) have no inbound from the contact side, so
the LID gets auto-mapped to your PN.

### 9.2 Acceptance criteria (contacts)

| AC | Given | When | Then |
|---|---|---|---|
| CT-AC-1 | at least one mapping registered | `GET /api/contacts` | 200 `{ contacts: [{ lid: '<digits>@lid', pn: '<digits>@s.whatsapp.net' }, …] }` |
| CT-AC-2 | body missing or wrong type | `POST /api/contacts` | 400 `{ error: 'ValidationError', details: ['"lid" and "pn" must be strings'] }` |
| CT-AC-3 | `lid` does not end with `@lid` | `POST /api/contacts` | 400 `{ error: 'ValidationError', details: ['"lid" must end with @lid'] }` |
| CT-AC-4 | valid `{ lid: '1234567890@lid', pn: '6281234567890' }` | `POST /api/contacts` | 200 `{ registered: true, mappings: [...] }`; mapping appears in `GET /api/contacts` |
| CT-AC-5 | invalid (5-digit) bare form in either `lid` or `pn` | `POST /api/contacts` | 200 with `registered: false` (the `registerLid` validation rejects silently, returns `false`); the mapping is NOT added; `contacts[]` is unchanged |
| CT-AC-6 | inbox writer processes inbound with `key.senderPn` and `key.senderLid` | `recordFromBaileys(msg)` | `registerLid('${senderLid}@lid', '${senderPn}@s.whatsapp.net')` is called; mapping persisted |
| CT-AC-7 | inbox writer processes group message with `key.participantPn` and `key.participantLid` | `recordFromBaileys(msg)` | `registerLid('${participantLid}@lid', '${participantPn}@s.whatsapp.net')` is called |
| CT-AC-8 | inbox writer processes inbound to `@lid` JID | `recordFromBaileys(msg)` | `lidBare` is added to `seenLidInbound` and persisted |
| CT-AC-9 | self-echo (`fromMe && isLid(rawJid)`) AND LID NOT in `seenLidInbound` AND NOT already mapped AND `selfPnBare` set | `recordFromBaileys(msg)` | `registerLid('${lidBare}@lid', selfPnBare)` is called (auto-self-LID) |
| CT-AC-10 | self-echo but LID already in `seenLidInbound` (someone else has messaged this LID before) | `recordFromBaileys(msg)` | `registerLid` for self is NOT called — the LID is treated as a contact, not as your own |
| CT-AC-11 | writer's `resolveJid(jid)` | `jid = '1234567890@lid'` and `lidToPn.get('1234567890') === '6281234567890@s.whatsapp.net'` | returns `'6281234567890@s.whatsapp.net'` |
| CT-AC-12 | `inbox.record(rawJid, ...)` where `rawJid` is a `@lid` JID with a registered mapping | `record()` | writes to `wa-chat-<pn>.md` (the resolved PN), not `wa-chat-<lid>.md` |
| CT-AC-13 | `wa.setSelfPn('6285179652486:10@s.whatsapp.net')` | open-socket path (`client.js:262-264`) | `selfPnBare = '6285179652486'` (strips `:deviceId` and `@s.whatsapp.net`); `setSelfPn` accepts either bare PN or full JID |
| CT-AC-14 | `inbox/writer.js` LID↔PN module reload from `.lid-mappings.json` on boot | server start with persisted file | `selfPnBare` and `lidToPn` repopulated before the first event; persisted file is read-only at boot, written only on mutation |

Citations: `src/controllers/contactsController.js:5-31`;
`src/inbox/writer.js:11-18, 49-67, 69-77, 79-93, 95-115, 117-135, 141-167, 178-188, 190-195, 197-227, 469-510, 512-520, 521-533`;
`src/whatsapp/client.js:262-264`;
`src/routes/contacts.js:8-9`;
`src/index.js:44`.

### 9.3 NG (contacts)

- **CT-NG-1** Reverse lookup (`/api/contacts/:pn` → mapping) — only the
  full list endpoint is exposed.
- **CT-NG-2** Bulk import / CSV upload — out of scope; operators add
  mappings one at a time.
- **CT-NG-3** Reverse-engineering LIDs from `wa-chat-<digits>.md`
  filenames — the writer resolves the LID at write time, so the on-disk
  filename is always the resolved PN's bare digits.

## 10. Cross-feature invariants (comparison table)

The six features share three concrete cross-cutting invariants. The
SPEC documents them because they show up in audit checks (§7) and in
the seq 4 cross-cycle check.

| Invariant | Auth | Send | Broadcast | Inbox | AntiBan | Contacts |
|---|---|---|---|---|---|---|
| Module exports a singleton OR a module of pure functions | singleton (`client.js:449`) | n/a (controller) | singleton (`broadcaster.js:438`) | module of pure functions + module-level Maps (`writer.js`) | class + two instances | n/a (controller) |
| Reads config via `src/config/index.js` | yes (sessionDir, logLevel, printQRInTerminal) | yes (antiBan) | yes (antiBan.maxSendRetries, antiBan.connectionWaitTimeoutMs) | yes (inbox.enabled, dir, includeStatus) | yes (`config.antiBan`, lines 41-61) | yes (inbox.dir) |
| Throws errors with `.statusCode` so `errorHandler` maps them | yes (503 on `sendTextMessage`, 400 on `_toJid`) | yes (400 / 429 / 503) | yes (400 / 404 / 413) | n/a (returns no-op Promise) | n/a (returns plain objects) | yes (400 on validation) |
| Persists state across restart | yes (`auth_info/`) | no | no (in-memory jobs) | yes (`.lid-mappings.json`, `.lid-seen-inbound.json`, `wa-chat-*.md`) | no (in-memory counters) | yes (via inbox writer) |
| Subject to anti-ban policy | n/a | yes (controller uses it) | yes (worker uses it) | n/a | self | n/a |
| Wired to typing indicator (seq 1) | n/a | yes (`messageController.js:55, 115`) | yes (`broadcaster.js:179, 246`) | n/a | n/a | n/a |

## 11. Failure-mode quick-reference (consolidated)

| Scenario | Site | Behavior |
|---|---|---|
| `sock === null` | auth, send, broadcast | `isConnected()` returns false; send returns 503; broadcast's `waitForConnection` waits up to `CONNECTION_WAIT_TIMEOUT_MS` then throws `NOT_CONNECTED` |
| `auth_info/` does not exist | auth | `initialize()` creates the dir (`client.js:87-89`); credentials are persisted on `creds.update` |
| `auth_info/creds.json` invalid / stale | auth | Baileys rejects → `connection.update { connection: 'close' }` with non-loggedOut status → reconnect with backoff (AC-7) |
| `loggedOut` disconnect reason | auth | `_clearSession()` wipes `auth_info/`; next `init` requires a fresh QR (AC-8) |
| `printQRInTerminal=true` (default) | auth | Baileys also prints the QR to stdout (operator has both surfaces) |
| `INBOX_ENABLED=false` | inbox | `record()` returns no-op Promise; nothing is written |
| `INBOX_INCLUDE_STATUS=false` (default) | inbox | status messages are skipped (no file written) |
| `INBOX_LOG_DIR` does not exist | inbox | `ensureDir()` creates it recursively on first write |
| Concurrent events for the same JID | inbox | per-JID promise chain serialises (AC-4) |
| Two browsers open `GET /api/auth/qr` | auth | both receive the same `lastQRBuffer` (it's the same singleton) |
| Two broadcasters simultaneously (two `POST /api/messages/broadcast`) | broadcast | both jobs run concurrently; each has its own `_queue` and `signal`; the worker `_tick` finds one active job at a time (single-threaded JS) |
| `phones.length > 10_000` | broadcast | 413 (B-AC-3) |
| `phones` contains a pre-formatted JID (`@s.whatsapp.net`) | broadcast | accepted as-is via `isJid(raw)` (B-AC-18) |
| `phones` contains a duplicate | broadcast | second copy added to `errors[]` with `error: 'duplicate_in_payload'` (B-AC-19) |
| Anti-ban `kind === 'wait'` during a broadcast | broadcast | recipient unshifted; no typing indicator; next tick scheduled `delayMs` out (B-AC-15) |
| Anti-ban `kind === 'skip'` during a send | send | 429 with the structured reason (S-AC-4..7) |
| `antiBan.recordSent` after a successful send | send / broadcast | increments counters; sets per-recipient cooldown; records content hash for dedupe |
| `inbox.record` throws (markdown log write fails) | send / broadcast | warn log; the send still 200/202 (S-AC-12, B-AC-17 wording) |
| `inbox.markLogged` then `messages.upsert` echo arrives | inbox | `client.js:150` early-skip optimisation (INB-AC-7) |
| `messages.upsert` for a self-echo arrives WITHOUT a prior `markLogged` | inbox | `client.js:124` dispatcher-level filter (for AI trigger path); inbox writer also has its own `fromMe === true` skip implicitly (the inbox writer logs the outbound explicitly from `sendTextMessage` and `broadcaster` so the echo is a duplicate → `writtenIds.has(msgId)` short-circuits) |
| A `wa-chat-<digits>.md` file contains `[in ]` (status update or new contact) on first boot | contacts | `seedSeenInboundFromLogs` adds the bare PN to `seenLidInbound` and persists (INB-AC-14) |
| Server restart with no `.lid-mappings.json` | contacts | empty mapping table; auto-learner populates from inbound events |

## 12. Test surface (honest enumeration)

Per the task brief: enumerate every `src/test/*.test.mjs` covering
pre-cycle MVP code. **The pre-cycle MVP has NO dedicated unit test
file.** This is a gap. The cycle ships with manual `curl`-based smoke
verification per `docs/be/MVP.md` and `README.md` §"API reference".

| Test file | Covers MVP code? | Spec section that links to it |
|---|---|---|
| `src/test/typing.test.mjs` | NO — typed-cycle work (seq 1) | n/a (seq 1) |
| `src/test/inbox-history.test.mjs` | PARTIAL — covers `inbox.getRecentHistory` only (a POST-cycle hotfix, 2026-07-09). Does NOT cover pre-cycle MVP `record` / `recordFromBaileys` / LID↔PN auto-learner / `resolveJid` | §7.1.7, §7.2 (INB-AC-11) |
| `src/test/episodic.test.mjs` | NO — post-cycle hotfix (2026-07-09, episodic memory) | n/a (post-cycle) |
| `src/test/audit.test.mjs` | NO — `ai-audit` module (seq 3) | n/a |
| `src/test/chunker.test.mjs` | NO — `ai-retrieval/chunker` (seq 3) | n/a |
| `src/test/composer-byte-identity.test.mjs` | NO — `ai-settings/composer` (seq 3) | n/a |
| `src/test/contact-scope.test.mjs` | NO — `ai-retrieval/hybrid` contact scope (seq 3) | n/a |
| `src/test/db-migrations.test.mjs` | NO — DB client (seq 3 prerequisite) | n/a |
| `src/test/db-preflight.test.mjs` | NO — `db/check` (seq 3 prerequisite) | n/a |
| `src/test/hardened-rules.test.mjs` | NO — `ai-settings/hardened-rules` (seq 3) | n/a |
| `src/test/hybrid.test.mjs` | NO — `ai-retrieval/hybrid` (seq 3) | n/a |
| `src/test/ingest.test.mjs` | NO — `ai-retrieval/ocr` + `ai/store/ingest` (seq 3) | n/a |
| `src/test/llm-retry.test.mjs` | NO — `ai-llm/openai-compat` (seq 3) | n/a |
| `src/test/parse.test.mjs` | NO — `ai-llm/parse` (seq 3) | n/a |
| `src/test/routes-ai.test.mjs` | NO — `/api/crm/ai/*` (seq 3) | n/a |
| `src/test/settings-defaults.test.mjs` | NO — `ai-settings/defaults` (seq 3) | n/a |
| `src/test/settings-endpoint.test.mjs` | NO — `/api/crm/ai/settings` (seq 3) | n/a |
| `src/test/state-machine.test.mjs` | NO — `ai-whatsapp/handoff` AIReplyMode (seq 3) | n/a |
| `src/test/ai-settings-roundtrip.test.mjs` | NO — settings ↔ composer (seq 3) | n/a |

**Test names covering pre-cycle MVP code (none — gap):**

- `src/whatsapp/client.js` (auth lifecycle, _toJid, getStatus, getSocket, setSelfPn wiring) — **none — gap**.
- `src/whatsapp/antiBan.js` (check / recordSent / recordFailure / getStats) — **none — gap**.
- `src/whatsapp/broadcaster.js` (createJob / cancel / get / list / summarize / _tick / _sendWithRetry) — **none — gap**.
- `src/controllers/messageController.js` (send, validateSendPayload) — **none — gap**.
- `src/controllers/authController.js` (init / qr / qrJson / status / logout) — **none — gap**.
- `src/controllers/broadcastController.js` (create / get / list / cancel / stats) — **none — gap**.
- `src/controllers/contactsController.js` (list / register) — **none — gap**.
- `src/inbox/writer.js::record` (writeQueue, appendToFile, formatEntry, header logic) — **none — gap**.
- `src/inbox/writer.js::recordFromBaileys` (LID↔PN auto-learner, senderPn/participantPn, seenLidInbound, auto-self-LID) — **none — gap**.
- `src/inbox/writer.js::resolveJid` (LID → PN lookup) — **none — gap**.
- `src/inbox/writer.js::registerLid` (manual registration, persistence) — **none — gap**.
- `src/inbox/writer.js::listLidMappings` (current table) — **none — gap**.
- `src/inbox/writer.js::setSelfPn` (own-PN stripping) — **none — gap**.
- `src/inbox/writer.js::loadMappings` / `loadSeenInbound` / `seedSeenInboundFromLogs` (boot reload) — **none — gap**.
- `src/inbox/writer.js::markLogged` / `wasLogged` (idempotency early-skip) — **none — gap**.
- `src/inbox/writer.js::getRecentHistory` (markdown parse) — **PARTIAL** (post-cycle hotfix `src/test/inbox-history.test.mjs:29-90`, covers the parse path; does NOT cover the `chatHistory` consumer in `trigger.js` which lives in seq 3 scope).
- `src/middleware/errorHandler.js` (statusCode → status mapping) — **none — gap**.
- `src/routes/{auth,messages,broadcast,contacts}.js` (route wiring) — **none — gap** (the wiring is trivially mechanical; `curl` smoke per README is the integration evidence).
- `src/config/index.js` (env var parsing) — **none — gap**.

**The seq 4 audit must record this as a known gap.** It is not a call
to write tests now (per `IntakeProposal.md §5 OOS`); it is a finding
that future cycles should consider when they touch any of the
above code (TDD per `AGENTS.md` G4 — write a failing test first).

**Integration evidence (manual `curl` smoke per README §"API
reference")**: each MVP endpoint has a documented `curl` example that
serves as integration evidence. These are NOT unit tests but they
are the contract the cycle ships against.

## 13. Out-of-scope (explicit)

This SPEC documents what IS in the code. The following are out of
scope and NOT covered by this SPEC:

- **Media sends** — image / video / document / audio / sticker sends
  are not wired through `POST /api/messages/send` or the broadcast
  worker; the inbox writer logs placeholders only. (PRD NG.)
- **Group sends** — group chats are accepted by the inbox writer
  (`wa-chat-group-*.md`) but the send / broadcast endpoints accept only
  PNs (8–15 digits → `${pn}@s.whatsapp.net`). Out of scope.
- **Durable broadcast queue** — jobs are in-memory and lost on restart
  (README §"Broadcasting a message (with anti-ban)").
- **Multi-tenant** — per-tenant quotas, per-tenant vector namespacing
  (PRD NG1).
- **HTTP API authentication / authorization** — operator must bind to
  `127.0.0.1` or front with a reverse proxy (PRD NG2, README §"Security
  notes").
- **HTTP / WebSocket real-time inbox UI updates** — `GET /api/inbox` is
  pull-only (PRD §8 OOS, `docs/be/MVP.md §10`).
- **Streaming typing indicators** — `'recording'` etc. — Baileys
  presence only carries `'composing'` / `'paused'` (seq 1 PRD §8).
- **Inter-recipient broadcast typing** — the indicator is OFF between
  recipients by design (seq 1 PRD §3.2 NG-T4).
- **Re-implementation of any feature** — the retro-fit produces
  documentation; the seq 4 audit's findings are tracked separately,
  not actioned in this run.
- **Writing unit tests for the pre-cycle MVP** — explicitly deferred
  per `IntakeProposal.md §5 OOS` and PRD-001 §8; this is a documented
  gap (see §12) that future cycles may close when they touch the
  code.

## 14. Verifiability summary

Every acceptance criterion in §4.2, §5.2, §6.2, §7.2, §8.2, §9.2 is
verifiable by **one or both** of:

| Method | How |
|---|---|
| Reading the cited `src/<path>:<line>` location | Direct grep; the cited location is the single source of truth. |
| Reading the cited `docs/<path>` reference | `sot/general/PRD.md` (§4.1), `sot/general/FRD.md` (§3–§7), `sot/general/Plan.md` (§1.3 D2/D3), `docs/be/MVP.md` (broadcaster lifecycle). |
| `curl` smoke against `http://HOST:PORT` | README §"API reference" documents the example invocations. |

| Test name (none — gap, see §12) | Method |
|---|---|
| **none — gap for pre-cycle MVP** | `pnpm test` runs the post-cycle tests; pre-cycle MVP relies on `curl` smoke per README. |

## 15. Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0.0 | 2026-07-10 | @requirements-analyst | Initial draft. Cycle-level SPEC for `be-mvp-retrofit-2026-07-10`. Decomposes PRD-MVP-1 into six per-feature specifications (auth, single-send, broadcast, inbox, antiBan, contacts). Pins the 14 anti-ban env vars verbatim from `src/config/index.js:41-59`, enumerates the test surface honestly (all `none — gap` for pre-cycle MVP code), and records the seq-1 typing-indicator integration sites (`messageController.js:55,115`, `broadcaster.js:179,246`) as cross-cycle invariants. attempt_id: `ATT-SEQ2-RA-1`. doc_id: `SPEC-MVP-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. cycle_id: `be-mvp-retrofit-2026-07-10`. |

---

**Next step after this SPEC lands**: the parallel seq 2 dispatches
(`@technical-planner` → `docs/be/features/mvp/plan.md`,
`@be-engineer` → `docs/be/features/mvp/build.md`) anchor their own
documents against this SPEC's §4–§9 (per-feature specifications),
§10 (cross-feature invariants), §11 (failure-mode quick-reference),
and §12 (test surface — honestly enumerating the gap). Round 2
(Audit) verifies the four artifacts agree against
`src/whatsapp/{client.js, antiBan.js, broadcaster.js, typing.js}`,
`src/controllers/{authController.js, messageController.js,
broadcastController.js, contactsController.js}`,
`src/inbox/writer.js`, `src/routes/*`, `src/middleware/errorHandler.js`,
and `src/config/index.js`.