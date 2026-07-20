<!--
owner: @product-manager
cycle_id: be-mvp-retrofit-2026-07-10
attempt_id: ATT-SEQ2-PM-1
doc_id: PRD-MVP-1
linked_prd: sot/general/PRD.md (PRD-001)
linked_frd: sot/general/FRD.md (FRD-001)
linked_plan: sot/general/Plan.md (PLAN-RETROFIT-001) §3 Batch 2
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
purpose: MIGRATION ARTIFACT — documents what IS in the code for the
pre-cycle MVP (auth / single-send / broadcast / inbox / antiBan / contacts)
that shipped before any mavis cycle. Code is the source of truth.
Not a forward-looking scope statement.
-->

# Pre-Cycle MVP — PRD (`be-mvp-retrofit-2026-07-10`)

> **Migration artifact.** This PRD is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run, **Batch 2** of
> [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md) §3. It documents
> the **pre-cycle MVP** — auth lifecycle, single-send, broadcast, inbox,
> antiBan, and the LID↔PN contacts surface — exactly as they ship in
> `src/` today. **Code is the source of truth.** This PRD does **not**
> invent new product scope.
>
> **Linked upstream**: [`PRD-001`](../../../../sot/general/PRD.md)
> (project-level); [`FRD-001`](../../../../sot/general/FRD.md)
> (project-level — §3 auth, §4 send, §5 broadcast, §6 inbox, §7 antiBan).
> Linked plan: [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md)
> §1.3 boundary decisions D2 (LID↔PN rolls into seq 2 inbox work) and
> D3 (cycle-batched artifacts).

## 1. Vision

The pre-cycle MVP is the **first stable cut of the Baileys WhatsApp REST
API**: an Express HTTP service that turns a single, QR-linked WhatsApp
account into a programmable surface. It gives an operator the six
affordances needed to put WhatsApp behind `curl`:

1. **Lifecycle** — `init` / `qr` / `status` / `logout` against the
   Baileys multi-device socket.
2. **Single-send** — `POST /api/messages/send { phone, message }`.
3. **Broadcast** — `POST /api/messages/broadcast { phones, message }`,
   with an in-memory background worker.
4. **Inbox** — every WhatsApp event (in + out) appended to a
   per-contact markdown file in `inbox_logs/`.
5. **AntiBan** — a per-process rate limiter consulted by both single-send
   and broadcast, always-on by default.
6. **Contacts** — `/api/contacts` exposes the inbox's LID↔PN mapping
   table so an operator (or the AI trigger in seq 3) can resolve a
   `@lid`-routed chat to a phone number.

The long-term outcome of the MVP, as it sits today, is **a safe-by-default
outbound surface** (every send passes through the anti-ban gate) and a
**durable word log** (the inbox markdown) that downstream cycles — AI
auto-reply, CRM persistence — can build on without re-implementing the
socket, the rate limiter, or the inbound log.

In one line: *a programmable WhatsApp surface for a single operator,
with anti-ban safety on every send and a per-contact markdown log of
every word.*

## 2. Six features at a glance

| # | Feature | HTTP surface | Source-of-truth files |
|---|---|---|---|
| 1 | **Auth lifecycle** | `POST /api/auth/init`, `GET /api/auth/qr`, `GET /api/auth/qr.json`, `GET /api/auth/status`, `POST /api/auth/logout` | `src/routes/auth.js:8-12`, `src/controllers/authController.js:5-103`, `src/whatsapp/client.js:23-449` |
| 2 | **Single-send** | `POST /api/messages/send` | `src/routes/messages.js:8`, `src/controllers/messageController.js:30-119` |
| 3 | **Broadcast** | `POST /api/messages/broadcast`, `GET /api/messages/broadcast`, `GET /api/messages/broadcast/stats`, `GET /api/messages/broadcast/:jobId`, `DELETE /api/messages/broadcast/:jobId` | `src/routes/broadcast.js:8-12`, `src/controllers/broadcastController.js:6-43`, `src/whatsapp/broadcaster.js:90-438` |
| 4 | **Inbox markdown log** | `messages.upsert` → `inbox_logs/wa-chat-<jid>.md`; per-contact history via `getRecentHistory` | `src/inbox/writer.js:8-644`, `src/whatsapp/client.js:122-168` |
| 5 | **AntiBan policy** | (no HTTP surface; gates every send) | `src/whatsapp/antiBan.js:40-216`, `src/config/index.js:41-62` |
| 6 | **Contacts (LID↔PN)** | `GET /api/contacts`, `POST /api/contacts` | `src/routes/contacts.js:8-9`, `src/controllers/contactsController.js:5-31`, `src/inbox/writer.js:178-195, 484-533` |

## 3. Goals & Non-Goals

### 3.1 Goals

- **G-A1 — Lifecycle endpoints are idempotent and observable.**
  `POST /api/auth/init` on an already-connected socket returns
  `200 { message: "Already connected to WhatsApp", status }` (no second
  socket is opened). `GET /api/auth/qr` returns the **raw PNG bytes**
  with `Content-Type: image/png`, or `202 { error: "QRNotReady", status }`
  with an `X-WhatsApp-State` header when the QR is not yet rendered.
  `GET /api/auth/status` always returns
  `{ status: { state, connected, user, lastError, reconnectAttempts } }`.
  Source: `src/controllers/authController.js:5-22, 24-56, 58-88, 90-94, 96-103`; `src/whatsapp/client.js:49-57`.

- **G-A2 — Session survives restarts.** Credentials persisted to
  `auth_info/` (`SESSION_DIR`, default `./auth_info` —
  `src/config/index.js:34-37`) are reloaded by `useMultiFileAuthState`
  on next boot (`src/whatsapp/client.js:91-93`), so the operator does
  not have to re-scan after every restart.

- **G-A3 — Reconnect-with-backoff on non-loggedOut drops.** Unexpected
  disconnects (network blip, server bounce) trigger a reconnect on
  `2s, 4s, 8s, 16s` (capped at `30s`).
  Source: `src/whatsapp/client.js:303-319`.

- **G-A4 — `loggedOut` wipes the session.** A close with
  `DisconnectReason.loggedOut` AND a prior `_wasEverOpen === true`
  deletes `auth_info/` and forces re-auth.
  Source: `src/whatsapp/client.js:275-299, 352-365`.

- **G-S1 — Single-send validates and ships the message.** A valid body
  produces `{ success: true, data: { messageId, to, text, timestamp } }`.
  An invalid phone (8–15 digits per E.164) returns `400 ValidationError`;
  a missing `phone` / `message` returns `400 ValidationError`; an
  unconnected socket returns `503`.
  Source: `src/controllers/messageController.js:11-44, 103-113`;
  `src/whatsapp/client.js:428-438`.

- **G-S2 — Every send passes through the anti-ban gate.** `check()`
  returns one of `{ kind: 'ok' }`, `{ kind: 'skip', reason }`,
  `{ kind: 'wait', delayMs }` and the controller consults it before
  `sock.sendMessage`. Skip returns `429 AntiBanBlocked`; wait sleeps up
  to 60s and re-checks connectivity.
  Source: `src/controllers/messageController.js:57-79`;
  `src/whatsapp/antiBan.js:114-141`.

- **G-S3 — Typing indicator covers the whole in-flight send window.**
  `startTyping(wa.sock, jid)` is called before the anti-ban gate; the
  returned `stop` is wired via `try/finally`. Refresh cadence is
  `REFRESH_MS = 4_000` ms. (Cycle id
  `be-typing-indicators-2026-07-10` — full retro-fit lives in
  [`docs/be/features/whatsapp-typing/prd.md`](../whatsapp-typing/prd.md).)
  Source: `src/controllers/messageController.js:55, 114-116`.

- **G-B1 — Broadcast returns 202 + a job descriptor immediately.**
  `POST /api/messages/broadcast { phones, message }` validates
  (non-empty `phones`, `phones.length <= 10_000`, non-empty `message`,
  each entry either an `@s.whatsapp.net` JID or an 8–15 digit number
  that gets normalised) and returns
  `{ jobId, status: "running", total, sent, failed, skipped, pending,
     results, antiBan, createdAt }`.
  Source: `src/whatsapp/broadcaster.js:290-373`;
  `src/controllers/broadcastController.js:6-16`.

- **G-B2 — One recipient at a time, paced by the anti-ban policy.**
  `_tick` shifts one recipient off `_queue`, calls `antiBan.check`,
  and either sends, skips (with reason), or reschedules (`_queue.unshift`
  + `_nextAt = Date.now() + delayMs`). Source:
  `src/whatsapp/broadcaster.js:108-170`.

- **G-B3 — Retry policy is split between transient and terminal.**
  Transient HTTP codes (`408, 429, 500, 502, 503, 504, 521, 522, 524`)
  retry with exponential backoff up to `MAX_SEND_RETRIES` (default 3)
  and a `30_000` ms per-send hard timeout.
  Terminal codes (`400, 401, 403, 404, 405, 410`) mark the recipient
  `failed` immediately. Source: `src/whatsapp/broadcaster.js:11-30,
  60-88, 219-243, 258-288`; `src/whatsapp/antiBan.js` is consulted
  per-recipient via `check()`.

- **G-B4 — `DELETE /api/messages/broadcast/:jobId` cancels cleanly.**
  An `AbortController` is fired; remaining `pending` recipients flip to
  `skipped` with `skipReason: "cancelled"`; the job moves to
  `cancelled`. Source: `src/whatsapp/broadcaster.js:375-399`.

- **G-B5 — `GET /api/messages/broadcast/stats` exposes live anti-ban
  counters and limits.** Returns `{ antiBan: { enabled,
  messagesLastHour, messagesLastDay, limits: { … } } }`. Source:
  `src/controllers/broadcastController.js:41-43`;
  `src/whatsapp/antiBan.js:192-215`.

- **G-I1 — Every `messages.upsert` is appended to a per-contact
  markdown file.** The format is
  `**[YYYY-MM-DD HH:MM:SS] [in |out] <name>**\n<body>` with `[in ]`
  right-padded for monospace alignment; media becomes `[kind:mime]`
  placeholders with caption; reactions / protocol / view-once shells /
  empty bodies are skipped; writes are serialised per JID via an
  in-memory promise chain. Source:
  `src/inbox/writer.js:257-389, 405-411, 422-457, 459-543`;
  `src/whatsapp/client.js:122-168`.

- **G-I2 — History-sync (`messages.upsert` with `type: "append"`) is
  also written.** The inbox writer accepts all Baileys upsert types
  except `fromMe=true` self-echoes (filtered upstream via
  `inbox.wasLogged` at `src/whatsapp/client.js:150`). Source:
  `src/inbox/writer.js:459-543`; README §"Inbound message logging".

- **G-I3 — LID↔PN mapping keeps one file per contact.** When Baileys
  routes a chat by `@lid` instead of `@s.whatsapp.net`, the writer
  resolves the LID to a known PN before computing the filename
  (`resolveJid` at `src/inbox/writer.js:61-67`). Mappings are learned
  from `key.senderPn` / `key.participantPn` on inbound events and
  persisted to `inbox_logs/.lid-mappings.json`.
  Source: `src/inbox/writer.js:69-77, 95-115, 178-188, 484-510`.

- **G-I4 — `getRecentHistory(chatId, limit)` returns the previous
  N-1 entries.** Used by the seq-3 AI trigger to resolve follow-up
  references like "berapa lama" against the previous turn's topic.
  Skips status / group / LID / newsletter JIDs; returns `[]` on a
  missing file. Source: `src/inbox/writer.js:599-627`.

- **G-X1 — AntiBan is always-on by default.** `ANTI_BAN_ENABLED=true`
  by default. Setting it to `false` bypasses all eight checks and
  sends as fast as the socket allows (README §"Anti-ban behaviour"
  warns against this). Source:
  `src/whatsapp/antiBan.js:51-53, 114-115`;
  `src/config/index.js:42`.

- **G-X2 — Eight checks compose the policy.** Hourly / daily cap,
  per-recipient cooldown, content dedup, active hours, random delay
  with jitter, batch pause, send retry, connection wait. Each is a
  first-class check on `AntiBan.check()`. Source:
  `src/whatsapp/antiBan.js:114-141`.

- **G-X3 — Skip reasons are structured.** `quota_exceeded`,
  `recipient_cooldown`, `duplicate_content`, `outside_active_hours`
  — the broadcast worker persists them on the recipient record; the
  single-send controller surfaces them on the 429 response body.
  Source: `src/whatsapp/antiBan.js:118-129`;
  `src/whatsapp/broadcaster.js:154-160`;
  `src/controllers/messageController.js:60-67`.

- **G-C1 — `/api/contacts` lists the LID↔PN mapping table.**
  `GET /api/contacts` returns
  `{ contacts: [{ lid: "<n>@lid", pn: "<n>@s.whatsapp.net" }, …] }`.
  Source: `src/routes/contacts.js:8`;
  `src/controllers/contactsController.js:5-7`;
  `src/inbox/writer.js:190-195`.

- **G-C2 — `/api/contacts` accepts manual registrations.**
  `POST /api/contacts { lid, pn }` validates that `lid` ends with
  `@lid` and registers the mapping via `inbox.registerLid`; returns
  `{ registered: true|false, mappings: [...] }`. Source:
  `src/routes/contacts.js:9`;
  `src/controllers/contactsController.js:9-31`;
  `src/inbox/writer.js:178-188`.

### 3.2 Non-Goals

- **NG-A1 — No HTTP API authentication.** The README §"Security notes"
  states explicitly: "This API has no authentication. Bind it to
  `127.0.0.1` or put it behind a reverse proxy with auth if it is
  reachable from the network." PRD-001 NG2 reaffirms this. The
  `auth` feature is the **Baileys WhatsApp session lifecycle**, not
  an HTTP middleware — there is no `src/middleware/auth.js` in the
  codebase (only `src/middleware/errorHandler.js`). Any future
  middleware for API-key / OAuth / JWT is a separate cycle
  (PRD NG2).
  Source: `README.md §Security notes`; `PRD-001 §2.2 NG2`.

- **NG-A2 — No multi-tenant session keys.** Per PRD-001 NG1; the MVP
  ships one `auth_info/` folder, one socket, one operator.

- **NG-S1 — No media sends.** Single-send is text-only. Image /
  video / document / audio / sticker / voice / contact / location /
  poll messages are **received** into the inbox markdown log
  (as placeholders) but are **never sent** by the MVP.

- **NG-B1 — No durable broadcast queue.** Job table is in-memory
  (`Map` keyed by `jobId`); restart loses pending recipients. README
  §"Broadcasting a message (with anti-ban)" documents this and
  recommends an external queue (BullMQ etc.) for durability —
  explicitly out of scope of the MVP cycle.

- **NG-B2 — No media broadcast.** Same constraint as NG-S1.

- **NG-B3 — No cross-job throttling.** Each broadcast job has its own
  `_tick` scheduler and its own anti-ban view; two parallel jobs will
  each consult the same `antiBan.check()` against the same global
  per-process counters. (The MVP does not serialise jobs against
  each other; the quotas are global.)

- **NG-I1 — No raw media binary storage.** The inbox markdown is a
  text log; image / video / document / audio bytes are NOT saved.
  README §"Inbound message logging" is explicit.

- **NG-I2 — No real-time UI updates for the inbox.** WebSocket push is
  Phase 3 per `docs/be/MVP.md §10`; the MVP reads the markdown file
  on demand.

- **NG-X1 — No cross-process anti-ban coordination.** The `AntiBan`
  instance lives in process; a horizontally-scaled deployment would
  multiply the per-recipient cooldown. (The MVP ships single-process.)

- **NG-X2 — No WhatsApp ban guarantee.** README §"Anti-ban behaviour"
  is explicit: these are "best-effort heuristics, not a guarantee.
  WhatsApp does not publish its ban thresholds and they change."

- **NG-C1 — No contact metadata beyond LID↔PN.** `/api/contacts`
  returns only the mapping; there is no display name, no avatar, no
  last-seen. (Such fields would require a different contact store.)

## 4. Functional Requirements (cycle-level)

Each requirement cites the integration site. Acceptance uses `given /
when / then`.

### 4.1 Auth lifecycle (feature 1)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-A-FR-1 | P0 | **`POST /api/auth/init`.** Start the Baileys socket if not already started; persist creds; no-op if `isConnected()`. | `given` cold start, `when` `POST /api/auth/init`, `then` 202 `{ message, status }` with `state: "connecting"`. `given` already-connected socket, `then` 200 `{ message: "Already connected to WhatsApp", status }` and no new socket. Source: `src/controllers/authController.js:5-22`. |
| MVP-A-FR-2 | P0 | **`GET /api/auth/qr`.** Latest QR as **raw PNG bytes** (`Content-Type: image/png`); if not yet ready, 202 + `X-WhatsApp-State` header. | `given` `state: "qr"` and `lastQRBuffer` is set, `when` `GET /api/auth/qr`, `then` 200 with `Content-Type: image/png` and the buffer body. `given` `state: "connecting"` or no `lastQRBuffer`, `then` 202 `{ error: "QRNotReady" }` with `X-WhatsApp-State`. Source: `src/controllers/authController.js:24-56`; `src/whatsapp/client.js:233-247`. |
| MVP-A-FR-3 | P0 | **`GET /api/auth/qr.json`.** Same QR as `{ qr: "data:image/png;base64,…", mimeType, status }`. | `given` `state: "qr"` and `lastQR` is set, `then` 200 with the data URL. Otherwise 202 `{ error: "QRNotReady" }`. Source: `src/controllers/authController.js:58-88`. |
| MVP-A-FR-4 | P0 | **`GET /api/auth/status`.** Returns `{ status: { state, connected, user, lastError, reconnectAttempts } }`. | Always 200; `connected` mirrors `isConnected()` which also checks `sock.ws.readyState === 1`. Source: `src/controllers/authController.js:90-94`; `src/whatsapp/client.js:38-57`. |
| MVP-A-FR-5 | P0 | **`POST /api/auth/logout`.** Tear down socket + delete `auth_info/`. | `given` an open socket, `when` `POST /api/auth/logout`, `then` 200 `{ message: "Logged out and session cleared" }` and `auth_info/` is gone. Source: `src/controllers/authController.js:96-103`; `src/whatsapp/client.js:352-372`. |
| MVP-A-FR-6 | P0 | **Session persistence.** `useMultiFileAuthState(config.whatsapp.sessionDir)` rehydrates from disk. | `given` `auth_info/creds.json` exists, `when` server starts, `then` no QR is required — the socket opens with the stored creds. Source: `src/whatsapp/client.js:91-93`; `src/config/index.js:34-37`. |
| MVP-A-FR-7 | P0 | **4-state machine.** `state ∈ { close, connecting, qr, open }` — frozen enum. | `given` any `connection.update` event, `then` `state` is exactly one of the four. Source: `src/whatsapp/client.js:16-21, 207-321`. |
| MVP-A-FR-8 | P0 | **Reconnect-with-backoff.** Non-loggedOut close → `setTimeout(() => initialize(), delayMs)` with `delayMs = min(30_000, 2_000 * 2^(attempt-1))` capped at `2_000 * 2^4 = 32_000`, then capped. | `given` a `close` without `loggedOut`, `when` the disconnect fires, `then` reconnect is scheduled with the next backoff delay. Source: `src/whatsapp/client.js:301-319`. |
| MVP-A-FR-9 | P0 | **`loggedOut` wipe.** `close` with `DisconnectReason.loggedOut` AND `_wasEverOpen === true` deletes `auth_info/`. | `given` `_wasEverOpen === true` and `loggedOut`, `when` close arrives, `then` `auth_info/` is removed and `_wasEverOpen` is reset. Source: `src/whatsapp/client.js:275-299, 352-365`. |

### 4.2 Single-send (feature 2)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-S-FR-1 | P0 | **`POST /api/messages/send`.** Validates body, normalises phone to JID, consults anti-ban, calls `sock.sendMessage`. | `given` valid `{ phone, message }`, `when` posted, `then` 200 `{ success, data: { messageId, to, text, timestamp } }`. Source: `src/controllers/messageController.js:30-119`. |
| MVP-S-FR-2 | P0 | **Phone validation.** 8–15 digits after stripping non-digits. | `given` `phone = "abc"` (non-digit) or `phone = "123"` (< 8 digits) or `phone = "1234567890123456"` (> 15 digits), `then` 400. Source: `src/whatsapp/client.js:428-438`; reused via `wa.phoneToJid` at `messageController.js:46`. |
| MVP-S-FR-3 | P0 | **Body validation.** `phone` and `message` must both be strings and present. | `given` missing `phone` or `message`, `then` 400 `{ error: "ValidationError", details: [...] }`. Source: `src/controllers/messageController.js:11-35`. |
| MVP-S-FR-4 | P0 | **Not-connected → 503.** | `given` `!wa.isConnected()`, `then` 503 with explanatory message. Source: `src/controllers/messageController.js:38-44`. |
| MVP-S-FR-5 | P0 | **Anti-ban `skip` → 429.** | `given` `check.kind === 'skip'`, `then` 429 `{ error: "AntiBanBlocked", reason, message, antiBan: antiBan.getStats() }`. Source: `src/controllers/messageController.js:58-67`. |
| MVP-S-FR-6 | P0 | **Anti-ban `wait` → throttle up to 60s.** | `given` `check.kind === 'wait'`, `when` delay arrives, `then` if still connected, send; else 503. Source: `src/controllers/messageController.js:68-79`. |
| MVP-S-FR-7 | P0 | **Typing indicator covers the in-flight window.** | `given` `startTyping(sock, jid)`, `then` `composing` is sent and refreshed every `REFRESH_MS = 4_000` ms; `finally` calls `stop()` which sends `paused` and clears the interval. Source: `src/controllers/messageController.js:55, 114-116`; cycle retro-fit PRD at `docs/be/features/whatsapp-typing/prd.md`. |
| MVP-S-FR-8 | P0 | **Outbound markdown entry.** A successful send writes `[out] me` to `inbox_logs/wa-chat-<jid>.md`. | Source: `src/controllers/messageController.js:84-102`; `src/inbox/writer.js:391-457`. |
| MVP-S-FR-9 | P0 | **`writtenIds` de-dup.** `inbox.markLogged(sent.key.id)` is called so a Baileys-echoed `messages.upsert` for the same id is skipped. | Source: `src/controllers/messageController.js:84-85`; `src/inbox/writer.js:565-578`; `src/whatsapp/client.js:150`. |

### 4.3 Broadcast (feature 3)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-B-FR-1 | P0 | **`POST /api/messages/broadcast`.** Returns 202 + job descriptor. | `given` non-empty `phones` (≤ 10 000) and non-empty `message`, `when` posted, `then` 202 `{ jobId, status: "running", total, sent, failed, skipped, pending, results, antiBan, createdAt }`. Source: `src/whatsapp/broadcaster.js:290-373`; `src/controllers/broadcastController.js:6-16`. |
| MVP-B-FR-2 | P0 | **Phone / JID normalisation.** Each entry is either accepted as `@s.whatsapp.net` JID or normalised via `toJid` (8–15 digits). Duplicates (after normalisation) emit `errors[]` entries. | Source: `src/whatsapp/broadcaster.js:32-46, 309-334`. |
| MVP-B-FR-3 | P0 | **`GET /api/messages/broadcast/:jobId`.** Live summary. | `given` an existing jobId, `then` 200 with the summary. `given` an unknown jobId, `then` 404 `{ error: "NotFound" }`. Source: `src/controllers/broadcastController.js:18-26`; `src/whatsapp/broadcaster.js:401-435`. |
| MVP-B-FR-4 | P0 | **`DELETE /api/messages/broadcast/:jobId`.** Cancel. | `given` a running job, `then` remaining `pending` flip to `skipped { skipReason: "cancelled" }`; job moves to `cancelled`. `given` a non-running job, returns the existing summary. Source: `src/whatsapp/broadcaster.js:375-399`. |
| MVP-B-FR-5 | P0 | **`GET /api/messages/broadcast`.** Lists all jobs (in-memory). | Source: `src/controllers/broadcastController.js:28-30`; `src/whatsapp/broadcaster.js:407-409`. |
| MVP-B-FR-6 | P0 | **`GET /api/messages/broadcast/stats`.** Anti-ban counters + limits. | Source: `src/controllers/broadcastController.js:41-43`; `src/whatsapp/antiBan.js:192-215`. |
| MVP-B-FR-7 | P0 | **Per-recipient anti-ban check.** `this.antiBan.check(recipient.jid, contentHash)` is consulted before every send; `skip` marks the recipient with the reason; `wait` reschedules. | Source: `src/whatsapp/broadcaster.js:149-170`. |
| MVP-B-FR-8 | P0 | **Send retry.** `_sendWithRetry` retries transient codes up to `MAX_SEND_RETRIES` with exponential backoff `min(30_000, 2_000 * 2^attempt)`. Terminal codes throw immediately. | Source: `src/whatsapp/broadcaster.js:11-30, 258-288`. |
| MVP-B-FR-9 | P0 | **Per-send hard timeout.** `SEND_TIMEOUT_MS = 30_000`. | Source: `src/whatsapp/broadcaster.js:60-88`. |
| MVP-B-FR-10 | P0 | **Connection wait.** `waitForConnection(config.antiBan.connectionWaitTimeoutMs, signal)` — polls every 500ms up to the timeout. | Source: `src/whatsapp/broadcaster.js:48-58, 264-267`. |
| MVP-B-FR-11 | P0 | **Per-recipient typing indicator.** `startTyping(wa.sock, recipient.jid)` before `_sendWithRetry`; `stop` in `finally`. Indicator is OFF between recipients. | Source: `src/whatsapp/broadcaster.js:179, 245-247`. |
| MVP-B-FR-12 | P0 | **Outbound markdown entry.** Each successful per-recipient send writes `[out] me` to `inbox_logs/wa-chat-<jid>.md` and marks the id (`inbox.markLogged`). | Source: `src/whatsapp/broadcaster.js:198-218`. |
| MVP-B-FR-13 | P0 | **Inter-recipient pacing.** After a successful send (and after a non-`wait` `check`), `_nextAt = Date.now() + 1_000` ms before the next `_scheduleTick`. | Source: `src/whatsapp/broadcaster.js:251-254`. |

### 4.4 Inbox (feature 4)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-I-FR-1 | P0 | **`messages.upsert` hook.** Subscribed in `src/whatsapp/client.js:122-168`; calls `inbox.recordFromBaileys(msg)` per message. | Source: `src/whatsapp/client.js:122-168`. |
| MVP-I-FR-2 | P0 | **Per-contact markdown file.** Filename `wa-chat-<barepn>.md` for 1:1, `wa-chat-group-<bareid>.md` for `@g.us`, `wa-chat-status.md` for `status@broadcast`. | Source: `src/inbox/writer.js:33-43, 229-242`. |
| MVP-I-FR-3 | P0 | **Entry format.** Header `**[YYYY-MM-DD HH:MM:SS] [in ] <name>**` or `**[YYYY-MM-DD HH:MM:SS] [out] me**`; body follows with leading 2-space indent for multi-line. | Source: `src/inbox/writer.js:346-361`. |
| MVP-I-FR-4 | P0 | **Media placeholders.** Image / video / document / audio / sticker / contact / location / poll recorded as `[kind:mime]` with caption or label body. | Source: `src/inbox/writer.js:281-344`. |
| MVP-I-FR-5 | P0 | **Skip reactions / protocol / empty.** | Source: `src/inbox/writer.js:405-411`. |
| MVP-I-FR-6 | P0 | **Serialised per-JID writes.** `writeQueues` Map ensures concurrent events for the same JID never interleave. | Source: `src/inbox/writer.js:8, 422-457`. |
| MVP-I-FR-7 | P0 | **Idempotent on `msgId`.** `writtenIds` Set with `RECENT_TTL_MS = 10 min` TTL. `markLogged`/`wasLogged` early-skip the `messages.upsert` handler. | Source: `src/inbox/writer.js:10, 20, 401-404, 565-578`. |
| MVP-I-FR-8 | P0 | **`resolveJid` LID→PN.** `@lid` JIDs are resolved to a known PN before filename computation. | Source: `src/inbox/writer.js:61-67, 396-399`. |
| MVP-I-FR-9 | P0 | **Self-echo handling.** `fromMe=true` events with a known id are skipped; outbound paths call `inbox.markLogged(sent.key.id)` to seed the set. | Source: `src/whatsapp/client.js:150`; `src/controllers/messageController.js:84-85`; `src/whatsapp/broadcaster.js:198`. |
| MVP-I-FR-10 | P0 | **Status JID gating.** `INBOX_INCLUDE_STATUS=false` (default) suppresses `status@broadcast` writes. | Source: `src/inbox/writer.js:37-39, 392-395`; `src/config/index.js:69`. |
| MVP-I-FR-11 | P1 | **`getRecentHistory(chatId, limit)`.** Reads the chat markdown, returns up to `limit - 1` (drops the most recent) as `{ role: 'user'|'assistant', content, ts }`. Skips status / group / LID / newsletter JIDs; returns `[]` on a missing file. | Source: `src/inbox/writer.js:599-627`. |
| MVP-I-FR-12 | P0 | **Persisted on boot.** `loadMappings()`, `loadSeenInbound()`, `seedSeenInboundFromLogs()` all run at module load. | Source: `src/inbox/writer.js:95-171`. |

### 4.5 AntiBan (feature 5)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-X-FR-1 | P0 | **Master switch.** `ANTI_BAN_ENABLED` (default `true`). When `false`, `check()` returns `{ kind: 'ok' }` immediately. | Source: `src/whatsapp/antiBan.js:51-53, 114-115`; `src/config/index.js:42`. |
| MVP-X-FR-2 | P0 | **Active hours.** `ACTIVE_HOURS_START..END` (default `0..24` ⇒ always on). Outside the window → `skip { reason: "outside_active_hours" }`. | Source: `src/whatsapp/antiBan.js:55-62, 118-120`; `src/config/index.js:55-56`. |
| MVP-X-FR-3 | P0 | **Per-recipient cooldown.** `SKIP_IF_MESSAGED_WITHIN_MS` (default `120_000` = 2 min). Inside the window → `skip { reason: "recipient_cooldown" }`. | Source: `src/whatsapp/antiBan.js:99-103, 121-123`; `src/config/index.js:51-54`. |
| MVP-X-FR-4 | P0 | **Content dedup.** `DEDUPE_WINDOW_MS` (default `86_400_000` = 24 h). Same exact content to same number inside the window → `skip { reason: "duplicate_content" }`. | Source: `src/whatsapp/antiBan.js:91-97, 124-126`; `src/config/index.js:50`. |
| MVP-X-FR-5 | P0 | **Hourly / daily cap.** `MAX_PER_HOUR=50`, `MAX_PER_DAY=250`. Exceeding → `skip { reason: "quota_exceeded" }`. The 51st hour / 251st day does NOT consume a slot. | Source: `src/whatsapp/antiBan.js:82-89, 127-129`; `src/config/index.js:48-49`. |
| MVP-X-FR-6 | P0 | **Random delay with jitter.** `_desiredGap()` returns a uniform random in `[minDelayMs, maxDelayMs]` jittered by `±JITTER_FACTOR × delay`. Defaults `15_000..45_000`, `JITTER_FACTOR=0.4`. `check()` returns `wait { delayMs: desiredGap - elapsed }` if the desired gap has not yet elapsed since `_lastSendAt`. | Source: `src/whatsapp/antiBan.js:133-164`; `src/config/index.js:43-45`. |
| MVP-X-FR-7 | P0 | **Batch pause.** When `sendsSoFar % BATCH_SIZE === 0` (and `sendsSoFar > 0`), `_desiredGap` returns `jitter(batchPauseMs, jitterFactor)` instead of the random gap. Defaults `BATCH_SIZE=20`, `BATCH_PAUSE_MS=90_000`. | Source: `src/whatsapp/antiBan.js:151-160`; `src/config/index.js:46-47`. |
| MVP-X-FR-8 | P0 | **State tracking.** `_hourTimestamps`, `_dayTimestamps` (FIFO windows), `_lastSentPerPhone` (Map), `_contentHashesPerPhone` (Map of Map), `_lastSendAt`. `_maybeCleanup` runs at most once per 60s. | Source: `src/whatsapp/antiBan.js:10-49, 64-80`. |
| MVP-X-FR-9 | P0 | **Stats surface.** `getStats()` returns `{ enabled, messagesLastHour, messagesLastDay, limits: { maxPerHour, maxPerDay, minDelayMs, maxDelayMs, batchSize, batchPauseMs, dedupeWindowMs, skipIfMessagedWithinMs, activeHours: { start, end } } }`. | Source: `src/whatsapp/antiBan.js:192-215`. |
| MVP-X-FR-10 | P0 | **`recordSent(phone, content, now)`** pushes into `_hourTimestamps` / `_dayTimestamps`, updates `_lastSentPerPhone`, computes the SHA-256 of `content` and stores the (hash → now) mapping. | Source: `src/whatsapp/antiBan.js:166-184`. |
| MVP-X-FR-11 | P0 | **`recordFailure(phone)`** is a no-op — failures do NOT consume quota; the per-recipient cooldown still applies on next attempt. | Source: `src/whatsapp/antiBan.js:186-190`. |
| MVP-X-FR-12 | P0 | **`sleep(ms, signal)`** is cancellation-aware; an aborted signal rejects with `cancelled`. | Source: `src/whatsapp/antiBan.js:23-38`. |

### 4.6 Contacts / LID↔PN (feature 6)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-C-FR-1 | P0 | **`GET /api/contacts`.** Returns `{ contacts: [{ lid: "<n>@lid", pn: "<n>@s.whatsapp.net" }, …] }` from the in-memory `lidToPn` Map. | Source: `src/routes/contacts.js:8`; `src/controllers/contactsController.js:5-7`; `src/inbox/writer.js:190-195`. |
| MVP-C-FR-2 | P0 | **`POST /api/contacts { lid, pn }`.** Validates `lid` ends with `@lid`, calls `inbox.registerLid(lid, pn)`; returns `{ registered, mappings }`. 400 on a non-string `lid` / `pn` or a `lid` without `@lid` suffix. | Source: `src/routes/contacts.js:9`; `src/controllers/contactsController.js:9-31`; `src/inbox/writer.js:178-188`. |
| MVP-C-FR-3 | P0 | **Auto-learn from inbound.** On inbound `messages.upsert` with `key.senderPn` set, the writer calls `registerLid(senderLid, senderPn)`. On group messages with `key.participantPn` + `key.participantLid`, the participant's LID is mapped. | Source: `src/inbox/writer.js:484-510`. |
| MVP-C-FR-4 | P0 | **Auto-self-LID learning.** On a `fromMe=true` event into a `@lid` JID AND that LID has never been seen as an inbound destination (`!seenLidInbound`), the LID is mapped to `selfPnBare`. | Source: `src/inbox/writer.js:512-533`; `setSelfPn` at `:204-227`. |
| MVP-C-FR-5 | P0 | **Persist on every change.** `lidToPn` and `seenLidInbound` are written to `inbox_logs/.lid-mappings.json` and `inbox_logs/.lid-seen-inbound.json` after every update. Reloaded at boot via `loadMappings` / `loadSeenInbound`. | Source: `src/inbox/writer.js:69-93, 95-135, 168-171`. |
| MVP-C-FR-6 | P0 | **Seed `seenLidInbound` from existing logs.** On first boot, any existing `wa-chat-<n>.md` file that contains an `[in ]` line seeds `seenLidInbound` with its bare number — protects against misregistering a contact LID as the user's own after a restart. | Source: `src/inbox/writer.js:141-167`. |

### 4.7 Cross-cutting: no HTTP API authentication

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| MVP-SEC-FR-1 | P0 | **No built-in HTTP auth.** The MVP has no `src/middleware/auth.js`; the only middleware file is `src/middleware/errorHandler.js`. README §"Security notes" states: "This API has no authentication. Bind it to `127.0.0.1` or put it behind a reverse proxy with auth if it is reachable from the network." PRD-001 NG2 reaffirms. Helmet + CORS defaults are wired in `src/index.js`. | Source: `README.md §Security notes`; `PRD-001 §2.2 NG2`; `glob src/middleware` returns only `errorHandler.js`. |

## 5. Locked values

### 5.1 Anti-ban env-var table (verbatim from `src/config/index.js:41-61`)

The MVP ships **14 anti-ban environment variables** (see
`src/config/index.js:41-61`):

| Env var | Type | Default | Source line | Used by |
|---|---|---|---|---|
| `ANTI_BAN_ENABLED` | bool | `true` | `src/config/index.js:42` | `isEnabled()` at `antiBan.js:51-53` |
| `ANTI_BAN_MIN_DELAY_MS` | int | `15_000` (15 s) | `src/config/index.js:43` | `_desiredGap()` lower bound at `antiBan.js:161-163` |
| `ANTI_BAN_MAX_DELAY_MS` | int | `45_000` (45 s) | `src/config/index.js:44` | `_desiredGap()` upper bound at `antiBan.js:161-163` |
| `ANTI_BAN_JITTER_FACTOR` | float | `0.4` | `src/config/index.js:45` | `jitter()` at `antiBan.js:18-21`; `antiBan.js:159, 163` |
| `ANTI_BAN_BATCH_SIZE` | int | `20` | `src/config/index.js:46` | `_desiredGap()` batch trigger at `antiBan.js:152-160` |
| `ANTI_BAN_BATCH_PAUSE_MS` | int | `90_000` (90 s) | `src/config/index.js:47` | `_desiredGap()` batch pause at `antiBan.js:159` |
| `ANTI_BAN_MAX_PER_HOUR` | int | `50` | `src/config/index.js:48` | `_withinQuotas()` at `antiBan.js:82-89` |
| `ANTI_BAN_MAX_PER_DAY` | int | `250` | `src/config/index.js:49` | `_withinQuotas()` at `antiBan.js:82-89` |
| `ANTI_BAN_DEDUPE_WINDOW_MS` | int | `86_400_000` (24 h) | `src/config/index.js:50` | `_isDuplicate()` at `antiBan.js:91-97` |
| `ANTI_BAN_SKIP_IF_MESSAGED_WITHIN_MS` | int | `120_000` (2 min) | `src/config/index.js:51-54` | `_skipIfRecentlyMessaged()` at `antiBan.js:99-103` |
| `ANTI_BAN_ACTIVE_HOURS_START` | int | `0` | `src/config/index.js:55` | `_inActiveHours()` at `antiBan.js:55-62` |
| `ANTI_BAN_ACTIVE_HOURS_END` | int | `24` | `src/config/index.js:56` | `_inActiveHours()` at `antiBan.js:55-62` |
| `ANTI_BAN_MAX_SEND_RETRIES` | int | `3` | `src/config/index.js:57` | `_sendWithRetry` at `broadcaster.js:258-288` |
| `ANTI_BAN_CONNECTION_WAIT_TIMEOUT_MS` | int | `30_000` (30 s) | `src/config/index.js:58-61` | `waitForConnection` at `broadcaster.js:48-58, 264-267` |

### 5.2 Other locked values

| Value | Lives in | Source |
|---|---|---|
| `REFRESH_MS = 4_000` ms (typing indicator refresh) | `src/whatsapp/typing.js` (cycle `be-typing-indicators-2026-07-10`) | full retro-fit PRD at `docs/be/features/whatsapp-typing/prd.md §4 T-FR-5` |
| `SEND_TIMEOUT_MS = 30_000` ms (per-send hard timeout) | `src/whatsapp/broadcaster.js:69` | `MVP-B-FR-9` |
| `RECENT_TTL_MS = 10 * 60 * 1000` (inbox `writtenIds` TTL) | `src/inbox/writer.js:20` | `MVP-I-FR-7` |
| `MAX_PHONES_PER_JOB = 10_000` | `src/whatsapp/broadcaster.js:301-307` | `MVP-B-FR-1` |
| Reconnect backoff `2_000 * 2^n` capped at `30_000` | `src/whatsapp/client.js:304-307` | `MVP-A-FR-8` |
| Phone-validation `8..15` digits | `src/whatsapp/client.js:430`; `src/whatsapp/broadcaster.js:38` | `MVP-S-FR-2` |
| 4-state enum `close | connecting | qr | open` | `src/whatsapp/client.js:16-21` | `MVP-A-FR-7` |
| Transient retry codes `{408, 429, 500, 502, 503, 504, 521, 522, 524}` | `src/whatsapp/broadcaster.js:11-21` | `MVP-B-FR-8` |
| Terminal codes `{400, 401, 403, 404, 405, 410}` | `src/whatsapp/broadcaster.js:23-30` | `MVP-B-FR-8` |

### 5.3 Drift notes (carried forward from FRD-001 §7.4 OQ-A1)

The PRD-001 §5 NFR table lists `JITTER_FACTOR=0.3` and
`CONNECTION_WAIT_TIMEOUT_MS=15_000`, but the code defaults are `0.4`
and `30_000` respectively. The MVP PRD anchors against the **code**
values (which is the source of truth). The seq 4 audit (`sot-fidelity`
lens) records this drift as a known finding; the PRD table is the
historical record, the code is the live behaviour.

## 6. How the features compose (MVP top-level)

```
                           ┌─────────────────────────────────┐
                           │   src/whatsapp/client.js        │
                           │   (Baileys socket lifecycle)    │
                           └──────────────┬──────────────────┘
                                          │
                  ┌───────────────────────┼────────────────────────┐
                  │                       │                        │
        messages.upsert          sendMessage                connection.update
                  │                       │                        │
                  ▼                       ▼                        ▼
   ┌──────────────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
   │  src/inbox/writer.js     │  │ src/whatsapp/      │  │ 4-state machine     │
   │  (per-contact .md log,   │  │   antiBan.js       │  │ close→connecting    │
   │   LID↔PN, getRecentHist) │  │ (8 checks)         │  │ →qr→open            │
   └──────────┬───────────────┘  └─────────┬──────────┘  └──────────┬──────────┘
              │                             │                       │
              │                             │  consulted on every    │
              │                             │  outbound              │
              │                             ▼                       │
              │                  ┌─────────────────────┐            │
              │                  │ messageController   │            │
              │                  │ (POST /messages/    │            │
              │                  │  send)              │            │
              │                  │ broadcaster         │            │
              │                  │ (POST /messages/    │            │
              │                  │  broadcast)         │            │
              │                  └─────────┬───────────┘            │
              │                            │                        │
              ▼                            ▼                        ▼
       inbox_logs/                  src/whatsapp/typing.js        auth_info/
       wa-chat-*.md                 (composing/paused)           (creds.json)
                                            ▲
                                            │
                              ┌─────────────┴──────────────┐
                              │  /api/contacts             │
                              │  GET (list) POST (register)│
                              │  reads/writes              │
                              │  inbox.lidToPn             │
                              └────────────────────────────┘
```

Anti-ban policy lives in `config.antiBan` and is loaded by both
`messageController`'s `AntiBan` instance and the broadcaster's
`AntiBan` instance; they share the same `antiBan.js` module but each
instance has its own state (see NG-X1 — single-process).

## 7. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-MVP-1 | WhatsApp ban despite anti-ban. The threshold is unpublished and changes. | Defaults are conservative (15s–45s gaps, 50/hour, 250/day, 24h dedup, 2-min per-recipient cooldown); README §"Anti-ban behaviour" caveats it. |
| R-MVP-2 | `antiBan.check()` is consulted per-process. Two parallel broadcast jobs share the same `_hourTimestamps` / `_dayTimestamps` counters. | Documented as NG-X1; for the MVP's single-process assumption, the global quota is correct. |
| R-MVP-3 | Broadcast jobs lost on restart. | README §"Broadcasting a message (with anti-ban)" documents this and recommends an external queue for durability (NG-B1). |
| R-MVP-4 | `inbox.writtenIds` TTL is 10 min; if Baileys echoes the same id >10 min later (unlikely), it gets written twice. | Mitigation: the explicit outbound paths ALSO call `inbox.record(...)` (`messageController.js:89-102`, `broadcaster.js:202-218`); the duplicate would land in the same `wa-chat-<jid>.md` file in chronological order — visible noise, not data loss. |
| R-MVP-5 | LID↔PN misregistration after a restart if `seedSeenInboundFromLogs` finds no `[in ]` lines. | Mitigation: the file itself still records all events; the LID map is only used to choose the filename. A contact whose LID has never been seen inbound stays in a separate `wa-chat-<lid>.md` until the operator manually registers the mapping via `POST /api/contacts`. |
| R-MVP-6 | Phone number not on WhatsApp. | API rejects with 400 if phone is invalid; a valid format but not-on-WhatsApp returns `404` from Baileys, which is `TERMINAL_STATUS_CODES` → recipient marked `failed` without retry. Source: `broadcaster.js:11-30, 220-243`. |
| R-MVP-7 | `loggedOut` wipes the session. | The session folder is removed; the operator must re-scan. README §"Authentication flow" documents this. |
| R-MVP-8 | No HTTP API auth. | Operator must bind to `127.0.0.1` or front with a reverse proxy. PRD-001 NG2. |
| R-MVP-9 | `inbox.getRecentHistory` returns `[]` for status / group / LID / newsletter JIDs. | Documented; the AI trigger in seq 3 must ensure the chat is a 1:1 PN-routed chat before relying on history. |

## 8. Out-of-Scope (explicit)

- HTTP API authentication / authorization middleware. PRD-001 NG2;
  README §"Security notes". NG-A1.
- Media sends (image / video / document / audio / sticker) on
  single-send or broadcast. NG-S1 / NG-B2.
- Raw media binary storage in the inbox log. NG-I1.
- Durable broadcast queue (BullMQ etc.). NG-B1.
- Cross-process anti-ban coordination. NG-X1.
- Multi-tenant session keys. NG-A2.
- Real-time UI updates for the inbox. NG-I2.
- Re-implementation of any feature. This PRD documents shipped
  behaviour; drift is a finding for the seq 4 audit (`sot-fidelity`
  lens), not a call to rewrite code. PRD-001 NG5.
- FE wiring to the MVP HTTP surface. The FE mockup in `frontend/` is
  mock-only and does not call this backend (PRD-001 NG4).

## 9. Approval

- [ ] **PRD_APPROVAL** gate cleared for `be-mvp-retrofit-2026-07-10`
- [ ] Approved by: `@supervisor`, on completion of the round-1 verdicts
      (PM / RA / TP / BE) and the round-2 audit.

> This PRD is a **migration artifact** — it documents the pre-cycle
> MVP that already ships. Approval here means "this is the product as
> it stands today, post-ship." Drift against the live `src/` is
> captured in the seq 4 `sot-fidelity` audit, not in this PRD.

## 10. Change Log

| Version | Date       | Author             | Change |
|---------|------------|--------------------|--------|
| 1.0.0   | 2026-07-10 | @product-manager   | Initial draft. Cycle-level retro-fit PRD for `be-mvp-retrofit-2026-07-10`. Documents the pre-cycle MVP (auth / single-send / broadcast / inbox / antiBan / contacts). Cites PRD-001 / FRD-001 (project-level) and PLAN-RETROFIT-001 §3 Batch 2. attempt_id: `ATT-SEQ2-PM-1`. doc_id: `PRD-MVP-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. Linked into the seq 2 dispatch chain (Batch 2). |

---

**Next step after this PRD lands**: the parallel seq 2 dispatches
(`@requirements-analyst` → `docs/be/features/mvp/spec.md`,
`@technical-planner` → `docs/be/features/mvp/plan.md`,
`@be-engineer` → `docs/be/features/mvp/build.md`) anchor their own
documents against this PRD's §4 (Functional Requirements), §5 (Locked
values — including the 14 anti-ban env vars), and §7 (Risks). Round 2
(Audit) verifies the four artifacts agree against the MVP source files
listed in §2 and §4.