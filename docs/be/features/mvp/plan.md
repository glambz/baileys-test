<!--
owner: @technical-planner
cycle_id: be-mvp-retrofit-2026-07-10
attempt_id: ATT-SEQ2-TP-1
doc_id: PLAN-MVP-1
linked_prd_cycle: docs/be/features/mvp/prd.md (PRD-MVP-1)
linked_spec: docs/be/features/mvp/spec.md (SPEC-MVP-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001, §3 Batch 2)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001, Sprint 2)
purpose: MIGRATION ARTIFACT — per-cycle Plan that documents the
         implementation steps that were actually taken to ship the
         pre-cycle MVP (auth / single-send / broadcast / inbox /
         antiBan) in the order they were taken. This is an AS-BUILT
         record (retro-fit), not a forward-looking plan. Code is the
         source of truth.
-->

# Pre-Cycle MVP — Plan (`be-mvp-retrofit-2026-07-10`)

> **Migration artifact.** This Plan is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run (Sprint 2 of [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md),
> per [`PLAN-RETROFIT-001` §3 Batch 2](../../../../sot/general/Plan.md)).
> It documents the implementation steps that were **actually taken**
> to ship the pre-cycle MVP — auth, single-send, broadcast, inbox,
> antiBan — in the order they were taken. **Code is the source of
> truth.**
>
> **Linked upstream**:
> [`PRD-MVP-1`](./prd.md) (cycle PRD),
> [`SPEC-MVP-1`](./spec.md) (cycle SPEC),
> [`PRD-001`](../../../../sot/general/PRD.md) (project PRD),
> [`FRD-001`](../../../../sot/general/FRD.md) (project FRD),
> [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md) (project Plan,
> Batch 2),
> [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md)
> (project TaskPlan, Sprint 2).
> Per-feature Build evidence will land in
> `docs/be/features/mvp/build.md`.

## Document Metadata

```yaml
---
doc_id: PLAN-MVP-1
plan_id: PLAN-MVP-1
version: 1.0.0
status: in-progress
created: 2026-07-10
updated: 2026-07-10
author: @technical-planner
attempt_id: ATT-SEQ2-TP-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-mvp-retrofit-2026-07-10
linked_prd_cycle: docs/be/features/mvp/prd.md (PRD-MVP-1)
linked_spec: docs/be/features/mvp/spec.md (SPEC-MVP-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001)
source_versions_covered:
  - "pre-cycle MVP — auth / single-send / broadcast / inbox / antiBan"
mode: full
classification: EXISTING_PROJECT
---

linked_frd_features:
  - F-1   # Lifecycle (init/qr/status/logout)
  - F-2   # Session persistence + reconnect-with-backoff
  - F-3   # Connection-state events (4-state machine)
  - F-4   # Single-send (POST /api/messages/send)
  - F-6   # Broadcast job CRUD + stats
  - F-8   # Per-contact markdown log writer
  - F-9   # LID↔PN mapping + /api/contacts
  - F-10  # /api/inbox stats endpoint
  - F-11  # Anti-ban policy (8 checks + master switch)
  - F-39  # Server bootstrap, helmet + cors + /health (cross-cutting)
linked_prd_requirements:
  - FR-1 .. FR-11 (PRD-001 §4.1 pre-cycle MVP rows)
source_of_truth:
  server_bootstrap:
    - src/index.js
    - src/middleware/errorHandler.js
    - src/config/index.js
  auth:
    - src/whatsapp/client.js
    - src/controllers/authController.js
    - src/routes/auth.js
  send:
    - src/controllers/messageController.js
    - src/routes/messages.js
  broadcast:
    - src/whatsapp/broadcaster.js
    - src/controllers/broadcastController.js
    - src/routes/broadcast.js
  inbox:
    - src/inbox/writer.js
    - src/controllers/contactsController.js
    - src/routes/contacts.js
  antiban:
    - src/whatsapp/antiBan.js
  tests:
    - (no MVP-specific .test.mjs files; see T8 for the gap rationale)
```

## 1. Goal

Document the implementation steps that were actually taken in this
pre-cycle MVP cycle, in the order they were taken. This is the
**as-built** record — not a forward-looking plan. Per the user's
clarification on 2026-07-10T10:45:50+07:00 (`DecisionLog.md`
§"2026-07-10T10:45:50"): retro-fit means "migrate from previous
system workflow to the current mavis workflow"; the code is the
source of truth. This Plan is the migration output for the
cycle-level implementation steps.

The pre-cycle MVP shipped with **1 server-bootstrap entry point**
(`src/index.js`), **5 first-class source modules**
(`src/whatsapp/client.js`, `src/controllers/messageController.js`,
`src/whatsapp/broadcaster.js`, `src/inbox/writer.js`,
`src/whatsapp/antiBan.js`), **4 controllers** (`authController.js`,
`messageController.js`, `broadcastController.js`,
`contactsController.js`), **4 routers** (`routes/auth.js`,
`routes/messages.js`, `routes/broadcast.js`, `routes/contacts.js`),
**1 cross-cutting middleware** (`middleware/errorHandler.js`),
**1 config module** (`config/index.js`), and **no dedicated MVP
unit-test files** (the shipped MVP relied on `curl` smoke
verification per the README's "API reference" + "Authentication
flow" + "Broadcasting a message" sections — see T8 for the
rationale and the seq 4 audit-readiness implication).

The chronological order of the 5+ MVP tasks is inferred from
(a) the dependency graph that the README documents (auth is the
gate every other endpoint assumes), (b) the cross-references in
`src/` (`client.js` is imported by `messageController.js`,
`broadcaster.js`, `inbox/writer.js`; `antiBan.js` is imported by
`messageController.js` and `broadcaster.js`; `inbox/writer.js` is
imported by `client.js`, `messageController.js`, `broadcaster.js`),
and (c) the README's section order (`Authentication flow` →
`Sending a text message` → `Broadcasting a message (with anti-ban)`
→ `Inbound message logging` → `Connection-state error handling` →
`Anti-ban behaviour`). The order presented below is the order the
code was authored to satisfy those dependencies.

## 2. Scope and Boundary

### 2.1 In scope

- **Server bootstrap**: `src/index.js` (Helmet + CORS, `/health`,
  `/api/inbox` stats route, route mounting, error handler wiring,
  auto-init-from-saved-creds, signal handlers, AI cycle hookup).
  Cross-cutting F-39.
- **Auth module** (F-1, F-2, F-3):
  - `src/whatsapp/client.js` — `WhatsAppClient` class: 4-state
    machine (`close | connecting | qr | open`), QR rendering
    (`qrcode.toDataURL` + `qrcode.toBuffer`), session persistence
    (`useMultiFileAuthState` → `auth_info/`),
    `loggedOut`-aware reconnect-with-exponential-backoff
    (`2s, 4s, 8s, 16s` capped at `30s`),
    `sendTextMessage` helper, `_toJid` / `phoneToJid` E.164
    validation, `_handleConnectionUpdate` translator.
  - `src/controllers/authController.js` — `init`, `qr` (PNG),
    `qrJson` (data-URL JSON), `status`, `logout` HTTP handlers.
  - `src/routes/auth.js` — `POST /init`, `GET /qr`, `GET /qr.json`,
    `GET /status`, `POST /logout`.
- **Send module** (F-4):
  - `src/controllers/messageController.js` — `POST /api/messages/send`
    handler: payload validation, `wa.isConnected()` guard,
    `phoneToJid`, `antiBan.check` → skip → 429 / wait → sleep /
    send → 200; explicit outbound logging via `inbox.markLogged` +
    `inbox.record`.
  - `src/routes/messages.js` — `POST /send`.
- **Broadcast module** (F-6):
  - `src/whatsapp/broadcaster.js` — `Broadcaster` class: in-memory
    job table (`Map`), `createJob` (≤10 000 phones), `_tick` worker,
    `antiBan.check` per recipient, `wait`/`skip` handling,
    `_sendWithRetry` with `MAX_SEND_RETRIES`, transient vs terminal
    status-code classification (`TRANSIENT_STATUS_CODES` ∪
    `TERMINAL_STATUS_CODES`), `waitForConnection`, per-recipient
    explicit outbound logging, `cancel` (AbortController),
    `summarize` (job → API response shape).
  - `src/controllers/broadcastController.js` — `create`, `get`,
    `list`, `cancel`, `stats` HTTP handlers.
  - `src/routes/broadcast.js` — `POST /`,
    `GET /:jobId`, `GET /` (list), `GET /stats`, `DELETE /:jobId`.
- **Inbox module** (F-8, F-9, F-10):
  - `src/inbox/writer.js` — per-contact markdown writer
    (`record`, `recordFromBaileys`, `writeQueues` per-JID serialiser,
    `markLogged` + `writtenIds` set with TTL eviction,
    `meta` Map for `/api/inbox` stats); media placeholder rendering;
    reaction / protocol / view-once wrapper skips; LID↔PN mapper
    (`resolveJid`, `registerLid`, `listLidMappings`, `setSelfPn`,
    `loadMappings` / `persistMappings`,
    `loadSeenInbound` / `persistSeenInbound`,
    `seedSeenInboundFromLogs`); auto-self-LID learning via
    `seenLidInbound` guard; `getRecentHistory` markdown parser.
  - `src/controllers/contactsController.js` — `list` and
    `register` HTTP handlers.
  - `src/routes/contacts.js` — `GET /`, `POST /`.
- **AntiBan module** (F-11):
  - `src/whatsapp/antiBan.js` — `AntiBan` class with the 8 checks
    (`outside_active_hours`, `recipient_cooldown`, `duplicate_content`,
    `quota_exceeded`, `MIN/MAX_DELAY_MS + JITTER_FACTOR`, `BATCH_SIZE +
    BATCH_PAUSE_MS`, `MAX_SEND_RETRIES` via `_sendWithRetry`,
    `CONNECTION_WAIT_TIMEOUT_MS` via `waitForConnection`), master
    switch (`isEnabled`), `getStats`, `recordSent` /
    `recordFailure`.
- **Cross-cutting (F-39)**: `src/middleware/errorHandler.js`
  (`notFound` 404 + `errorHandler` reading `err.statusCode`),
  `src/config/index.js` (env-driven config: `server`, `whatsapp`,
  `antiBan`, `inbox`).
- **LID↔PN integration into the inbox pipeline** (D2 from
  `PLAN-RETROFIT-001` §1.3) — already in `src/inbox/writer.js`
  (the `resolveJid`, `registerLid`, `setSelfPn`, `seenLidInbound`,
  `.lid-mappings.json` / `.lid-seen-inbound.json` persistence,
  and `seedSeenInboundFromLogs`) and exposed via
  `src/controllers/contactsController.js` + `src/routes/contacts.js`.

### 2.2 Out of scope

- **Re-implementation of any feature.** This Plan documents the
  work that was done; the seq 4 SoT-fidelity audit may surface
  drift, which becomes a finding — not a call to rewrite code.
- **The `be-typing-indicators-2026-07-10` cycle** (seq 1) — its
  3 integration sites in `src/controllers/messageController.js`
  (startTyping line 55, stopTyping line 115), `src/whatsapp/broadcaster.js`
  (lines 179, 245-247), and the seq-3 AI trigger are covered by
  their own per-cycle plan (`docs/be/features/whatsapp-typing/plan.md`,
  PLAN-TYPING-1). This Plan cites the seq 1 integration line
  ranges as cross-cycle invariants the seq 4 audit re-checks; it
  does NOT re-describe the typing utility.
- **The `be-ai-auto-reply-2026-07-03` cycle** (seq 3) — its 10
  modules (`ai-llm`, `ai-retrieval`, `ai-whatsapp`, `ai-crm`,
  `ai-audit`) and the 3 post-cycle hotfixes (episodic memory,
  summary, fallback phrase rewrite) are covered by the seq 3
  retro-fit. The inbox writer's `getRecentHistory`
  (`src/inbox/writer.js:599-627`) is one of those hotfixes — it is
  cited here as the inbox module's history-reading surface (F-8
  AC-8.10) but its authoring is recorded in the seq 3 plan.
- **The server-bootstrap AI cycle hookup**
  (`src/index.js:105-138` — the `sock.ev.on('messages.upsert')`
  dispatcher that calls `processInboundMessage`) is owned by
  the seq 3 retro-fit. The MVP Plan records only the
  auth-routes / messages-routes / broadcast-routes / contacts-routes
  mounting and the helmet/cors/json/`/health` setup.
- **`frontend/` (Vite + React mockup).** Mock-only per README
  §"Security notes" and `PRD-001 §2.2 NG4`. No FE wiring of the
  MVP endpoints exists; the MVP is purely a BE → WhatsApp-server
  surface.
- **FE divergence** (`be_dev_history.md:41`) — the typing-cycle
  AI fallback phrase is the seq 1/seq 3 divergence, not the MVP.
- **Cross-encoder reranker, NLI entailment, KB auto-tag
  extraction, streaming replies with typing indicators (Phase 2 /
  Phase 3 per README §"Deferred to Phase 2 / Phase 3")** — not
  in scope of any shipped cycle, including this one.

### 2.3 Boundary decisions inherited from upstream artifacts

| ID | Decision | Drives |
|---|---|---|
| D1 | Retro-fit, not re-implementation. Code is the source of truth; this Plan is the as-built record. | Plan body cites `src/<path>:<line>` for every step. |
| D2 | Per-cycle Plans live under `docs/be/features/<feature>/plan.md`. Per-cycle Plans are migration outputs. | This file lives at `docs/be/features/mvp/plan.md`. |
| D3 | Cycle-batched artifacts for seq 2 (one PRD/Plan/Build/Audit bundle per cycle; per-feature SPEC nested underneath). Per `PLAN-RETROFIT-001 §1.3 D3`, seq 2 ships a single cycle bundle for the MVP (since the 5 features share one ship boundary). | This file is the cycle-level Plan; the PRD/SPEC for the MVP are also cycle-level (`docs/be/features/mvp/{prd.md,spec.md}`). |
| D4 | LID↔PN mapping (`/api/contacts`, `inbox.listLidMappings`, `contacts.upsert` subscription) rolls into seq 2 inbox work. Per `PLAN-RETROFIT-001 §1.3 D2`. | T6 covers the LID↔PN mapper as part of the inbox module, not a separate inbox cycle. |
| D5 | Chronological order is inferred from the dependency graph (auth first because every endpoint assumes `wa.isConnected()`; then send because it is the simplest anti-ban consumer; then broadcast because it consumes the same anti-ban gate at scale; then inbox because both `client.js` and the controllers call `inbox.markLogged` / `inbox.record`; then antiBan is its own module but the broadcaster is the heaviest consumer). | T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 ordering. |
| D6 | The MVP shipped without dedicated `src/test/*.test.mjs` files for the auth / send / broadcast / inbox / antiBan paths. The existing test files (`typing.test.mjs` = seq 1; `inbox-history.test.mjs` = seq 3; `episodic.test.mjs` = seq 3; `hybrid.test.mjs`, `parse.test.mjs`, `llm-retry.test.mjs`, `chunker.test.mjs`, `ingest.test.mjs`, `audit.test.mjs`, `composer-byte-identity.test.mjs`, `contact-scope.test.mjs`, `state-machine.test.mjs`, `routes-ai.test.mjs`, `settings-*.test.mjs`, `hardened-rules.test.mjs`, `db-preflight.test.mjs`, `db-migrations.test.mjs`, `ai-settings-roundtrip.test.mjs` = all AI / seq 3) cover the AI cycle, NOT the MVP. The MVP's verification is `curl`-based per README §"API reference" + §"Authentication flow" + §"Broadcasting a message (with anti-ban)". | T8 documents the gap; the seq 4 audit records it as a known characteristic (NOT a finding — the MVP pre-dates the AI cycle's test discipline). |
| D7 | The PRD §5 NFR table lists `JITTER_FACTOR=0.3` and `CONNECTION_WAIT_TIMEOUT_MS=15 000` but the code defaults to `0.4` and `30 000`. Per `FRD-001 §7.4 OQ-A1`, code is source of truth. | T5 (antiBan) cites `src/config/index.js:45` (jitter=0.4) and `src/config/index.js:58-61` (connectionWait=30 000). The PRD drift is a known characteristic, not a re-implementation call. |

## 3. Dependencies

### 3.1 Hard dependencies (must exist before this Plan's tasks)

- **`PRD-001`** (`sot/general/PRD.md`) — defines the project's
  goals and NFRs for the pre-cycle MVP (§4.1 rows FR-1..FR-11)
  plus §5 NFRs that this Plan's tasks implement.
- **`FRD-001`** (`sot/general/FRD.md`) — captures the 9 MVP
  features (F-1, F-2, F-3, F-4, F-6, F-8, F-9, F-10, F-11) plus
  F-39 (server bootstrap), each with full ACs and
  `src/<path>:<line>` citations.
- **`PLAN-RETROFIT-001`** (`sot/general/Plan.md`) — Batch 2 (seq 2)
  is the retro-fit batch for the MVP; this Plan is the per-cycle
  Plan that Batch 2 mandates.
- **`TaskPlan-RETROFIT-001`** (`sot/general/TaskPlan.md`) —
  Sprint 2 (seq 2) is the per-cycle sprint; this Plan fits
  Sprint 2's documentation deliverables.
- **`PRD-MVP-1`** (`docs/be/features/mvp/prd.md`) — cycle-level
  PRD, authored in this run in parallel.
- **`SPEC-MVP-1`** (`docs/be/features/mvp/spec.md`) —
  cycle-level SPEC, authored in this run in parallel.
- The Baileys library (`@whiskeysockets/baileys`) — already a
  declared dependency (`package.json:28`).
- `qrcode`, `helmet`, `cors`, `express`, `dotenv`, `pino` —
  declared dependencies used by the MVP code.
- `auth_info/` (session folder) — runtime artefact created on
  first QR scan; not committed.

### 3.2 Task-level dependency graph

```
T1 (auth + client.js)
   |
   v
T2 (single-send + messageController.js) ──┐
   |                                      |
   v                                      v
T3 (broadcaster.js + broadcastController.js)
   |                                      |
   v                                      v
T4 (inbox writer + contactsController.js) (also depends on T1)
   |
   v
T5 (antiBan.js — used by T2, T3, but its own module)
   |
   v
T6 (LID↔PN mapper + /api/contacts)        (depends on T4)
   |
   v
T7 (server bootstrap + index.js)          (depends on all of the above)
   |
   v
T8 (MVP test suite / verification)        (depends on T1..T7)
```

In the code: `client.js` is imported by `messageController.js`,
`broadcaster.js`, and `inbox/writer.js`; `antiBan.js` is imported
by `messageController.js` and `broadcaster.js`; `inbox/writer.js`
is imported by `client.js` (line 14), `messageController.js`
(line 4), and `broadcaster.js` (line 7). The Plan records the
chronological order as: **T1 (auth + client.js) → T2
(messageController single-send) → T3 (broadcaster) → T4 (inbox
writer) → T5 (antiBan) → T6 (LID↔PN) → T7 (server bootstrap +
index.js + middleware + config) → T8 (verification)**.

The reverse order was rejected because: (a) the Baileys socket
(`client.js`) must exist before any controller can guard against
`wa.isConnected() === false`; (b) the inbox writer's
`recordFromBaileys` is invoked from `client.js`'s
`sock.ev.on('messages.upsert', …)`, so the writer must exist
before the socket wires up; (c) `index.js` mounts the routers
and is the last glue.

### 3.3 Cycle-level retro-fit context

Per `PLAN-RETROFIT-001 §3 Batch 2`:

- **Goal**: Produce a mavis per-cycle bundle for the pre-cycle MVP
  and fold in the LID↔PN mapping work (`/api/contacts`,
  `contacts.upsert`, `inbox.listLidMappings`, `contacts.update`)
  that the user confirmed rolls into the inbox feature (D2).
- **Source of truth** (recorded in the YAML front matter):
  - `src/whatsapp/{client.js, antiBan.js, broadcaster.js}`.
  - `src/controllers/{authController.js, messageController.js,
    broadcastController.js, contactsController.js}`.
  - `src/inbox/writer.js` (per-contact markdown log + LID↔PN
    mapper + `getRecentHistory`).
  - `src/routes/{auth.js, messages.js, broadcast.js, contacts.js}`.
  - `src/middleware/errorHandler.js` + `src/config/index.js` +
    `src/index.js`.
  - README §"API reference", §"Authentication flow",
    §"Broadcasting a message (with anti-ban)", §"Inbound
    message logging", §"Connection-state error handling",
    §"Anti-ban behaviour".
  - FRD-001 §3 (auth), §4 (send), §5 (broadcast), §6 (inbox),
    §7 (antiBan).
- **Deliverable**: One top-level cycle bundle under
  `docs/be/features/mvp/{prd.md, spec.md, plan.md, build.md}`
  (this file is `plan.md`).

## 4. Task Breakdown

The MVP shipped as **8 discrete implementation tasks** (T1–T8), in
the order they were taken. Each task records its id, title, goal,
status (done), acceptance criteria, files touched (with line
ranges), and verification.

### T1 — WhatsApp client wrapper + auth lifecycle

| Field | Value |
|---|---|
| **id** | T1 |
| **title** | Implement `src/whatsapp/client.js` + `src/controllers/authController.js` + `src/routes/auth.js` (Baileys socket lifecycle + QR + status + logout) |
| **goal** | Establish the foundational Baileys socket wrapper that every other module assumes. Surface the lifecycle as 5 HTTP endpoints under `/api/auth/*` and persist credentials to `auth_info/`. |
| **status** | done |
| **acceptance criteria** | (1) `WhatsAppClient` class with 4-state machine (`close | connecting | qr | open`) frozen as `CONNECTION_STATES` (`src/whatsapp/client.js:16-21`). (2) `initialize()` builds the socket via `useMultiFileAuthState(config.whatsapp.sessionDir)` + `makeWASocket({ version, auth, printQRInTerminal, logger, browser, keepAliveIntervalMs, connectTimeoutMs, defaultQueryTimeoutMs, markOnlineOnConnect, syncFullHistory, generateHighQualityLinkPreview, fireInitQueries })` (`src/whatsapp/client.js:91-111`). (3) `_handleConnectionUpdate(update, gen)` translates `qr` → render PNG via `qrcode.toDataURL` + `qrcode.toBuffer` and store in `lastQR` / `lastQRBuffer` (`src/whatsapp/client.js:232-247`); `open` → store user, call `inbox.setSelfPn`, clear QR (`src/whatsapp/client.js:249-267`); `close` with `statusCode === DisconnectReason.loggedOut` → wipe `auth_info/` (`src/whatsapp/client.js:275-299`), other closes → exponential-backoff reconnect `2s * 2^min(attempt-1,4)` capped 30 s (`src/whatsapp/client.js:301-320`). (4) `_teardownSocket()` bumps `_sockGen` so stale events are ignored (`src/whatsapp/client.js:323-350`). (5) `sendTextMessage(phone, text)` validates, calls `sock.sendMessage`, marks `inbox.markLogged(sent?.key?.id)`, records outbound via `inbox.record` (`src/whatsapp/client.js:379-426`). (6) `_toJid` enforces 8–15 digits and emits `…@s.whatsapp.net` (`src/whatsapp/client.js:428-442`). (7) `src/controllers/authController.js` exposes `init` (202 + `wa.initialize()`), `qr` (PNG bytes or 202 with `X-WhatsApp-State`), `qrJson` (data-URL JSON), `status` (`wa.getStatus()`), `logout` (`wa.logout()`). (8) `src/routes/auth.js` wires the 5 routes. |
| **files touched** | `src/whatsapp/client.js:1-450` (new), `src/controllers/authController.js:1-105` (new), `src/routes/auth.js:1-14` (new). |
| **verification** | `grep -n 'router\.' src/routes/auth.js` → `init`, `qr`, `qr.json`, `status`, `logout`. Live smoke: `curl -X POST http://HOST:PORT/api/auth/init` → 202; `curl http://HOST:PORT/api/auth/qr` → PNG (or 202); after phone scan, `curl http://HOST:PORT/api/auth/status` → `state: "open"`. README §"Authentication flow" reproduces the same flow. The seq 1 typing cycle's 3 integration sites all read `wa.sock` / `wa.isConnected()` / `wa.getSocket()` from this module (seq 1 T3 / T4 / T5). |

### T2 — Single-send controller + anti-ban gate

| Field | Value |
|---|---|
| **id** | T2 |
| **title** | Implement `src/controllers/messageController.js` + `src/routes/messages.js` (`POST /api/messages/send`) |
| **goal** | Expose the simplest outbound path: validate phone, normalise to JID, consult `antiBan.check`, throttle if `kind === 'wait'`, call `wa.sock.sendMessage`, log outbound via `inbox.markLogged` + `inbox.record`. The single-send is the canonical anti-ban integration site that the broadcast re-uses. |
| **status** | done |
| **acceptance criteria** | (1) `validateSendPayload` requires `phone` (string) and `message` (string); 400 + `{error: "ValidationError", details}` on miss (`src/controllers/messageController.js:11-28`). (2) `wa.isConnected()` guard throws 503 (`src/controllers/messageController.js:38-44`). (3) JID via `wa.phoneToJid(phone)` (`src/controllers/messageController.js:46`). (4) `contentHash = sha256(message)` for `antiBan.check(jid, contentHash)` (`src/controllers/messageController.js:47-58`). (5) `check.kind === 'skip'` → 429 + `error: "AntiBanBlocked"` + `reason` + `antiBan.getStats()` (`src/controllers/messageController.js:59-67`). (6) `check.kind === 'wait'` → `await sleep(min(delayMs, 60_000))`; re-check `wa.isConnected()`; throw 503 if dropped (`src/controllers/messageController.js:68-79`). (7) `wa.sock.sendMessage(jid, { text: message })` (`src/controllers/messageController.js:81`). (8) `antiBan.recordSent` + `inbox.markLogged(sent?.key?.id)` + explicit `inbox.record` (`src/controllers/messageController.js:82-102`). (9) 200 + `{success: true, data: { messageId, to, text, timestamp }}` (`src/controllers/messageController.js:103-113`). (10) `src/routes/messages.js` mounts `POST /send`. |
| **files touched** | `src/controllers/messageController.js:1-122` (new), `src/routes/messages.js:1-10` (new). |
| **verification** | `grep -n 'router\.' src/routes/messages.js` → `POST /send`. Live smoke: `curl -X POST http://HOST:PORT/api/messages/send -H 'Content-Type: application/json' -d '{"phone":"628123456789","message":"hello"}'` returns `{success: true, data: {…}}`; with `ANTI_BAN_ENABLED=false` after quota exhaustion, returns 429; with no socket, returns 503. The seq 1 typing integration (seq 1 T3) wired `startTyping` at line 55 and `stopTyping` in `finally` at line 115 — that integration is owned by seq 1 but lives in this file. |

### T3 — Broadcaster (in-memory job worker + anti-ban pacing + retry)

| Field | Value |
|---|---|
| **id** | T3 |
| **title** | Implement `src/whatsapp/broadcaster.js` + `src/controllers/broadcastController.js` + `src/routes/broadcast.js` (async batch worker) |
| **goal** | Add an in-memory background-job worker that paces many sends through the same `antiBan.check` gate. Identified by an 8-byte hex `jobId`. Supports create / get / list / cancel / stats. Single-socket writes serialised per recipient. Transient vs terminal Baileys errors classified explicitly. |
| **status** | done |
| **acceptance criteria** | (1) `TRANSIENT_STATUS_CODES` (`408, 429, 500, 502, 503, 504, 521, 522, 524`) and `TERMINAL_STATUS_CODES` (`400, 401, 403, 404, 405, 410`) defined as `Set`s (`src/whatsapp/broadcaster.js:11-30`). (2) `toJid(phone)` + `isJid(phone)` phone validators (`src/whatsapp/broadcaster.js:32-46`). (3) `waitForConnection(timeoutMs, signal)` polls `wa.isConnected()` every 500 ms (`src/whatsapp/broadcaster.js:48-58`). (4) `sendOnce(jid, text)` races `wa.sock.sendMessage` against a 30 000 ms `SEND_TIMEOUT_MS` timer (`src/whatsapp/broadcaster.js:60-88`). (5) `Broadcaster` class holds `antiBan`, `jobs` (`Map`), `_tickScheduled` flag (`src/whatsapp/broadcaster.js:90-95`). (6) `_tick()` finds the active running job, respects `_nextAt`, pops one recipient per tick, calls `antiBan.check`, handles `skip` → log+continue, `wait` → `unshift` + `_nextAt` + `_scheduleTick`, then per-recipient send (`src/whatsapp/broadcaster.js:108-256`). (7) `_sendWithRetry(job, jid, text)` loops up to `config.antiBan.maxSendRetries`, exponential backoff `min(30_000, 2_000 * 2^attempt)`, respects `TERMINAL_STATUS_CODES` (no retry), respects `NOT_CONNECTED` (throw), respects `cancelled` (throw) (`src/whatsapp/broadcaster.js:258-288`). (8) `createJob({ phones, message })` validates (non-empty array, non-empty string, ≤10 000), dedupes, builds the job with `AbortController`, `_queue`, `_finalizeRecipient` (`src/whatsapp/broadcaster.js:290-373`). (9) `cancel(id)` aborts the signal, flips remaining `pending` → `skipped` (`src/whatsapp/broadcaster.js:375-399`). (10) `summarize(job)` produces the `{jobId, status, total, sent, failed, skipped, pending, results, errors, antiBan, createdAt, completedAt}` API shape (`src/whatsapp/broadcaster.js:411-435`). (11) `broadcastController.js` exposes `create` (202), `get` (200 or 404), `list`, `cancel`, `stats` (`src/controllers/broadcastController.js:1-45`). (12) `routes/broadcast.js` mounts the 5 routes. |
| **files touched** | `src/whatsapp/broadcaster.js:1-438` (new), `src/controllers/broadcastController.js:1-45` (new), `src/routes/broadcast.js:1-14` (new). |
| **verification** | `grep -n 'router\.' src/routes/broadcast.js` → 5 routes. Live smoke: `curl -X POST http://HOST:PORT/api/messages/broadcast -d '{"phones":["628…","628…"], "message":"promo"}'` → 202 + `{jobId, …}`; poll `GET /api/messages/broadcast/:jobId` until `pending: 0`; `curl -X DELETE /api/messages/broadcast/:jobId` mid-run cancels. The seq 1 typing integration (seq 1 T4) wired `startTyping` at line 179 and `stopTyping` in `finally` at line 245-247 + the `shouldReturnAfterCatch` deferred-return flag at line 180 — that integration is owned by seq 1 but lives in this file. |

### T4 — Inbox per-contact markdown writer

| Field | Value |
|---|---|
| **id** | T4 |
| **title** | Implement `src/inbox/writer.js` (per-contact markdown log + per-JID write serialiser) |
| **goal** | Persist every WhatsApp event (in + out, including media placeholders) to a per-contact markdown file under `inbox_logs/`. Serialise writes per JID via an in-memory promise chain so concurrent events for the same contact never interleave. Skip reactions / protocol / view-once-wrapper shells. Mark explicit outbound ids so the `messages.upsert` echo handler can dedupe. |
| **status** | done |
| **acceptance criteria** | (1) Module-level `writeQueues`, `meta`, `writtenIds`, `lidToPn`, `seenLidInbound`, `selfPnBare` state (`src/inbox/writer.js:8-13`). (2) `sanitizeForFile`, `isGroup`, `isStatus`, `isNewsletter`, `isLid` helpers (`src/inbox/writer.js:28-47`). (3) `fileNameFor(remoteJid)` returns `wa-chat-<barepn>.md` for 1:1, `wa-chat-group-<bareid>.md` for `@g.us`, `wa-chat-status.md` for `status@broadcast` (`src/inbox/writer.js:229-242`). (4) `unwrapMessage` peels `ephemeralMessage`, `viewOnceMessage`, `viewOnceMessageV2`, `documentWithCaptionMessage` (`src/inbox/writer.js:257-279`). (5) `extractText` covers `conversation`, `extendedTextMessage`, `imageMessage`, `videoMessage`, `documentMessage`, `audioMessage`, `stickerMessage`, `contactMessage`, `locationMessage`, `liveLocationMessage`, `reactionMessage`, `protocolMessage`, `pollCreationMessage` (`src/inbox/writer.js:281-344`). (6) `formatEntry` produces `**[YYYY-MM-DD HH:MM:SS] [in /out] name**\n<body>\n\n` with media `[kind:mime]` label (`src/inbox/writer.js:346-361`). (7) `record(remoteJid, opts)` resolves `@lid` → PN, dedupes via `writtenIds`, skips `empty` / `reaction` / `protocol` / `unknown`, then chains the write into the per-JID promise (`src/inbox/writer.js:391-457`). (8) `recordFromBaileys(msg)` extracts `direction`, `pushName`, `ts`, body, kind, mime, then auto-learns LID↔PN from `senderPn` / `participantPn` and tracks `seenLidInbound` (`src/inbox/writer.js:459-543`). (9) `markLogged` / `wasLogged` for the explicit-outbound dedup; ids auto-expire after `RECENT_TTL_MS = 10 min` (`src/inbox/writer.js:565-578`). (10) `getRecentHistory(chatId, limit)` parses the canonical markdown format and returns up to `limit` prior `{role, content, ts}` entries, dropping the most recent (the in-flight one) (`src/inbox/writer.js:599-627`). (11) `getStats` returns the `[jid, …meta]` array for `/api/inbox` (`src/inbox/writer.js:545-547`). |
| **files touched** | `src/inbox/writer.js:1-644` (new). |
| **verification** | `grep -n 'module.exports' src/inbox/writer.js` → `record, recordFromBaileys, getStats, flush, markLogged, wasLogged, fileNameFor, pathFor, reset, registerLid, listLidMappings, resolveJid, setSelfPn, getRecentHistory`. Live smoke: send a message; `cat inbox_logs/wa-chat-<pn>.md` shows `[out] me` entry; receive a message; `[in ] <pushName>` entry. `grep -c '\[in \]' inbox_logs/wa-chat-*.md` returns non-zero. The inbox writer's `getRecentHistory` is also exercised by `src/test/inbox-history.test.mjs` (5 specs) — but that test was added in the seq 3 post-cycle hotfix cycle, not as part of the MVP (D6). The seq 1 typing integration does not touch the inbox writer. |

### T5 — AntiBan engine

| Field | Value |
|---|---|
| **id** | T5 |
| **title** | Implement `src/whatsapp/antiBan.js` (the 8-check rate-limiter + master switch) |
| **goal** | Encapsulate all 8 anti-ban checks as a single per-process module that `send` (T2) and `broadcast` (T3) consult before touching the socket. Default to conservative values; expose a master switch (`ANTI_BAN_ENABLED`). |
| **status** | done |
| **acceptance criteria** | (1) `AntiBan` class with per-instance state `_hourTimestamps`, `_dayTimestamps`, `_lastSentPerPhone`, `_contentHashesPerPhone`, `_lastSendAt`, `_lastCleanup` (`src/whatsapp/antiBan.js:40-49`). (2) `isEnabled()` returns `this.opts.enabled !== false` (master switch) (`src/whatsapp/antiBan.js:51-53`). (3) `_inActiveHours(now)` handles start < end (e.g. 9–17) and start > end (overnight, e.g. 22–6); equal → always-on (`src/whatsapp/antiBan.js:55-62`). (4) `_maybeCleanup(now)` trims `_hourTimestamps` to `HOUR_MS`, `_dayTimestamps` to `DAY_MS`, drops stale `_lastSentPerPhone` entries past `SKIP_IF_MESSAGED_WITHIN_MS`, drops stale `_contentHashesPerPhone` hashes past `DEDUPE_WINDOW_MS` (`src/whatsapp/antiBan.js:64-80`). (5) `_withinQuotas(now)` returns true only if `MAX_PER_HOUR` and `MAX_PER_DAY` are not yet hit (`src/whatsapp/antiBan.js:82-89`). (6) `_isDuplicate(phone, contentHash, now)` and `_skipIfRecentlyMessaged(phone, now)` (`src/whatsapp/antiBan.js:91-103`). (7) `check(phone, contentHash, now)` returns `{kind: 'ok'}` (proceed), `{kind: 'skip', reason}` (one of `outside_active_hours`, `recipient_cooldown`, `duplicate_content`, `quota_exceeded`), or `{kind: 'wait', delayMs}` (re-check after `_desiredGap`) (`src/whatsapp/antiBan.js:114-141`). (8) `_desiredGap` is `BATCH_PAUSE_MS ± JITTER` if a batch boundary is being crossed, else `minDelayMs + random × (maxDelayMs - minDelayMs)` then `± JITTER` (`src/whatsapp/antiBan.js:143-164`). (9) `recordSent(phone, content, now)` pushes to hour + day timestamps, sets `_lastSentPerPhone`, hashes content via `sha256` and stores in `_contentHashesPerPhone` (`src/whatsapp/antiBan.js:166-184`). (10) `recordFailure(phone)` is a no-op (failures do not consume quota) (`src/whatsapp/antiBan.js:186-190`). (11) `getStats()` returns `{enabled, messagesLastHour, messagesLastDay, limits}` (`src/whatsapp/antiBan.js:192-215`). (12) `sleep(ms, signal)` is an abortable `setTimeout` (`src/whatsapp/antiBan.js:23-38`). |
| **files touched** | `src/whatsapp/antiBan.js:1-218` (new). |
| **verification** | `grep -n 'module.exports' src/whatsapp/antiBan.js` → `{AntiBan, sleep}`. Live smoke: with `MAX_PER_HOUR=1`, send 2 messages to 2 different recipients — first goes through, second returns `429` + `reason: "quota_exceeded"`; with `MAX_PER_HOUR=50` and `JITTER_FACTOR=0.4` defaults (per `src/config/index.js:45`), a 5-message broadcast spans the expected delay envelope. `getStats()` is exposed at `GET /api/messages/broadcast/stats` via `broadcastController.stats` (`src/controllers/broadcastController.js:41-43`). The PRD drift (`JITTER_FACTOR=0.3` in PRD-001 §5 vs `0.4` in code) is recorded by FRD-001 §7.4 OQ-A1 and is a known characteristic, NOT a finding (D7). |

### T6 — LID↔PN mapper + `/api/contacts` + `/api/inbox`

| Field | Value |
|---|---|
| **id** | T6 |
| **title** | Wire the LID↔PN mapper surface (`/api/contacts`) + `/api/inbox` stats endpoint (already in writer.js) |
| **goal** | Expose the inbox writer's LID↔PN table as a first-class API so the operator can manually register a mapping when Baileys does not surface `senderPn`. Surface the per-JID stats from `getStats()` as `/api/inbox`. Roll the entire feature into seq 2 inbox work per `PLAN-RETROFIT-001 §1.3 D2`. |
| **status** | done |
| **acceptance criteria** | (1) `resolveJid(jid)` replaces a `@lid` JID with the registered `@s.whatsapp.net` JID; returns the input unchanged when no mapping exists or the input is already a PN / group (`src/inbox/writer.js:61-67`). (2) `registerLid(lid, pn)` validates both shapes (8–15 digit bare, `…@lid`, `…@s.whatsapp.net`), persists to `.lid-mappings.json` (`src/inbox/writer.js:178-188, 69-77`). (3) `listLidMappings()` returns `[{lid: '…@lid', pn: '…@s.whatsapp.net'}, …]` (`src/inbox/writer.js:190-195`). (4) `setSelfPn(pnOrJid)` strips `@s.whatsapp.net` + `:deviceId` + non-digits, persists (`src/inbox/writer.js:204-227`). (5) `loadMappings` + `loadSeenInbound` + `seedSeenInboundFromLogs` run on `require` so the writer is ready before the first event (`src/inbox/writer.js:95-171`). (6) Auto-self-LID learning via `seenLidInbound` guard: a self-echo into a `@lid` JID is mapped to `selfPnBare` ONLY if that LID has never been seen as an inbound recipient (`src/inbox/writer.js:521-533`). (7) `src/controllers/contactsController.js` exposes `list` (`GET /api/contacts`) and `register` (`POST /api/contacts`); `register` validates `@lid` suffix and returns `{registered, mappings}` (`src/controllers/contactsController.js:5-31`). (8) `src/routes/contacts.js` mounts the 2 routes. (9) `GET /api/inbox` returns `{contacts: inbox.getStats()}` from `src/index.js:39`. |
| **files touched** | `src/inbox/writer.js:61-67, 69-77, 79-93, 95-115, 117-135, 141-167, 168-171, 178-227, 484-533, 599-627` (LID↔PN surface, all inside the writer); `src/controllers/contactsController.js:1-33` (new); `src/routes/contacts.js:1-11` (new); `src/index.js:39, 44` (`/api/inbox` + `/api/contacts` mounting). |
| **verification** | `grep -n 'router\.' src/routes/contacts.js` → 2 routes. Live smoke: `curl http://HOST:PORT/api/contacts` → `{contacts: []}` before any inbound; `curl -X POST http://HOST:PORT/api/contacts -d '{"lid":"123@lid","pn":"628123456789"}'` → `{registered: true, mappings: [...]}`; `curl http://HOST:PORT/api/contacts` → mapping present. `curl http://HOST:PORT/api/inbox` → `{contacts: [...]}` after the first event. FRD-001 §6.3 AC-9.5 / AC-9.6 / AC-9.7 / AC-9.8 cite these as evidence. |

### T7 — Server bootstrap + middleware + config

| Field | Value |
|---|---|
| **id** | T7 |
| **title** | Implement `src/index.js` + `src/middleware/errorHandler.js` + `src/config/index.js` (Express bootstrap, route mounting, helmet/cors, /health, error handler, env-driven config) |
| **goal** | Glue the MVP modules into a single HTTP service. Helmet + CORS for transport security; JSON body parser; `GET /health` for liveness; route mounting under `/api/{auth,messages,messages/broadcast,contacts}`; 404 + `errorHandler` reading `err.statusCode`; env-driven config with `dotenv`; auto-init from saved `auth_info/creds.json` so a restart does not require re-scanning. |
| **status** | done |
| **acceptance criteria** | (1) `dotenv.config()` runs before any other module reads `process.env` (`src/index.js:6`). (2) `buildApp()` applies `helmet()`, `cors()`, `express.json({limit: '1mb'})`, `express.urlencoded({extended: true})` (`src/index.js:33-36`). (3) `GET /health` returns `{ok: true, uptime: process.uptime()}` (`src/index.js:38`). (4) `GET /api/inbox` returns `{contacts: inbox.getStats()}` (`src/index.js:39`). (5) `app.use('/api/auth', authRoutes)` etc. mounts the 4 routers (`src/index.js:41-44`). (6) `notFound` (404) + `errorHandler` (reads `err.statusCode || 500`, logs at error/warn per status, returns `{error, message}`) (`src/middleware/errorHandler.js:5-24`). (7) `instanceLock.acquire()` refuses to start a second instance (`src/index.js:58-65`). (8) `mkdirSync(AUDIT_DIR, {recursive: true})` + `mkdirSync(KB_DIR, …)` for the AI cycle's runtime dirs (still safe for MVP-only run; logs a warning if the dirs are unwritable) (`src/index.js:70-74`). (9) `runMigrations()` runs on boot, idempotent, tolerates DB-unavailable (`src/index.js:77-83`). (10) Auto-init from saved `auth_info/creds.json` (`src/index.js:105-138`) — wires the seq-3 AI trigger subscription as a side effect (owned by seq 3 retro-fit; cited here as cross-cycle evidence for F-2 AC-2.1). (11) SIGINT / SIGTERM shutdown sequence aborts broadcast jobs, tears down the socket, flushes the inbox, closes the DB, releases the instance lock, exits 0 (`src/index.js:144-181`). (12) `uncaughtException` / `unhandledRejection` log fatal and exit (`src/index.js:174-180`). (13) `config/index.js` exposes `server.{port, host, env}`, `whatsapp.{sessionDir, logLevel, printQRInTerminal}`, `antiBan.{enabled, minDelayMs, maxDelayMs, jitterFactor, batchSize, batchPauseMs, maxPerHour, maxPerDay, dedupeWindowMs, skipIfMessagedWithinMs, activeHoursStart, activeHoursEnd, maxSendRetries, connectionWaitTimeoutMs}`, `inbox.{enabled, dir, includeStatus}` (`src/config/index.js:27-71`). (14) `intEnv` / `boolEnv` / `floatEnv` helpers handle env defaults cleanly (`src/config/index.js:7-25`). |
| **files touched** | `src/index.js:1-190` (new), `src/middleware/errorHandler.js:1-26` (new), `src/config/index.js:1-73` (new). |
| **verification** | `grep -n 'app\.\(use\|get\|listen\)' src/index.js` → helmet, cors, json, urlencoded, `/health`, `/api/inbox`, 4 routers, notFound, errorHandler, listen. Live smoke: `curl -i http://HOST:PORT/health` → 200 + CORS headers. With no auth scanned, `curl -i http://HOST:PORT/api/messages/send` → 400 (validation) before any socket check. With socket unlinked, `curl http://HOST:PORT/api/messages/send -d '{"phone":"…","message":"…"}'` → 503. With helmet, `curl -i` shows `X-Powered-By` absent. Restart with saved `auth_info/creds.json` re-opens the session without QR (F-2 AC-2.1). |

### T8 — MVP test suite / verification posture

| Field | Value |
|---|---|
| **id** | T8 |
| **title** | Document the MVP's verification posture (no dedicated `.test.mjs` files; `curl` smoke + the 17 existing AI/hotfix tests as the cross-cycle regression net) |
| **goal** | Be honest about the MVP's test posture. The shipped MVP shipped without dedicated unit tests for the auth / send / broadcast / inbox / antiBan paths. The verification model is the README's `curl`-based smoke + the existing vitest suite (17 files, all AI / hotfix / state-machine / typing). The seq 4 SoT-fidelity audit records this as a known characteristic, not a finding (D6). |
| **status** | done (the verification posture is the as-shipped posture; no new tests added in this retro-fit cycle) |
| **acceptance criteria** | (1) Document that **no** `src/test/*.test.mjs` file covers the MVP auth / send / broadcast / inbox / antiBan paths. (2) List the existing vitest files that are out-of-scope for this Plan and that the seq 4 audit must NOT confuse with MVP coverage: `typing.test.mjs` (seq 1), `inbox-history.test.mjs` (seq 3), `episodic.test.mjs` (seq 3), and the 14 AI-cycle files (`hybrid`, `parse`, `llm-retry`, `chunker`, `ingest`, `audit`, `composer-byte-identity`, `contact-scope`, `state-machine`, `routes-ai`, `settings-defaults`, `settings-endpoint`, `hardened-rules`, `db-preflight`, `db-migrations`, `ai-settings-roundtrip`). (3) Document the verification path the MVP actually relies on: README §"API reference" + §"Authentication flow" + §"Sending a text message" + §"Broadcasting a message (with anti-ban)" + §"Inbound message logging" + §"Connection-state error handling" + §"Anti-ban behaviour" — each section is a manual `curl` smoke script. (4) Document the cross-cycle regression net: `pnpm test` runs the 17 vitest files; the seq 4 audit checks that the seq-1 typing integration (3 sites in `messageController.js` / `broadcaster.js` / `trigger.js`) and the seq-3 AI trigger integration (13-step pipeline in `trigger.js`) still pass, which transitively verifies that the MVP's `client.js`, `messageController.js`, `broadcaster.js`, and `inbox/writer.js` boundaries have not regressed. (5) Note that `pnpm test` exits 0 today (per the AI cycle's "≥ 30 specs across ≥ 5 spec files" discipline in PRD-001 §5); the MVP retro-fit does NOT add to this count, by design (retro-fit is docs-only, per `PLAN-RETROFIT-001 §1.2`). |
| **files touched** | None. The MVP shipped without `src/test/*.test.mjs` files for the auth / send / broadcast / inbox / antiBan paths. |
| **verification** | `Get-ChildItem src/test/*.test.mjs` returns 19 files (none covering the MVP auth / send / broadcast / inbox / antiBan paths). `pnpm test` exits 0 with 17+ specs green (the AI cycle + seq 1 typing + seq 3 inbox-history + seq 3 episodic suites — none owned by this Plan). README §"API reference" + §"Authentication flow" + §"Broadcasting a message (with anti-ban)" + §"Inbound message logging" + §"Connection-state error handling" + §"Anti-ban behaviour" are the live smoke scripts the MVP relies on. |

## 5. Task-to-FRD feature coverage matrix

The MVP's 10 FRD-001 features are covered by these tasks:

| FRD Feature | Tasks | Evidence anchors |
|---|---|---|
| F-1 Lifecycle (init/qr/status/logout) | T1, T7 | `src/controllers/authController.js:5-103`, `src/routes/auth.js:8-12`, `src/whatsapp/client.js:38-57, 63-321` |
| F-2 Session persistence + reconnect-with-backoff | T1, T7 | `src/whatsapp/client.js:91-321`, `src/index.js:105-138` |
| F-3 Connection-state events (4-state machine) | T1 | `src/whatsapp/client.js:16-21, 207-321` |
| F-4 Single-send | T2 (T7) | `src/controllers/messageController.js:30-119`, `src/routes/messages.js:8` |
| F-6 Broadcast job CRUD + stats | T3 (T7) | `src/whatsapp/broadcaster.js:108-435`, `src/controllers/broadcastController.js:6-43`, `src/routes/broadcast.js:8-12` |
| F-8 Per-contact markdown log writer | T4 (T6) | `src/inbox/writer.js:14-19, 69-77, 79-93, 95-115, 117-135, 141-167, 168-171, 178-238, 257-457, 459-543, 545-547, 555-578, 599-627` |
| F-9 LID↔PN mapping + /api/contacts | T6 | `src/inbox/writer.js:61-67, 69-77, 79-93, 95-115, 117-135, 141-167, 168-171, 178-227, 484-533`, `src/controllers/contactsController.js:5-31`, `src/routes/contacts.js:8-9` |
| F-10 `/api/inbox` stats endpoint | T4, T7 | `src/index.js:39`, `src/inbox/writer.js:545-547` |
| F-11 Anti-ban policy (8 checks + master switch) | T5 (T2, T3) | `src/whatsapp/antiBan.js:51-215`, `src/config/index.js:41-62` |
| F-39 Server bootstrap, helmet + cors + /health | T7 | `src/index.js:30-103`, `src/middleware/errorHandler.js:5-24`, `src/config/index.js:27-71` |

Every PRD-001 §4.1 row (FR-1..FR-11) has at least one evidence
anchor in the matrix above. The seq 4 SoT-fidelity audit uses this
matrix to verify cross-doc consistency.

## 6. Cross-References

- **Cycle PRD**: [`docs/be/features/mvp/prd.md`](./prd.md) (PRD-MVP-1)
- **Cycle SPEC**: [`docs/be/features/mvp/spec.md`](./spec.md) (SPEC-MVP-1)
- **Cycle Build** (forthcoming): `docs/be/features/mvp/build.md`
- **Project PRD**: [`sot/general/PRD.md`](../../../../sot/general/PRD.md) (PRD-001)
- **Project FRD**: [`sot/general/FRD.md`](../../../../sot/general/FRD.md) (FRD-001 — see F-1, F-2, F-3, F-4, F-6, F-8, F-9, F-10, F-11, F-39)
- **Project Plan**: [`sot/general/Plan.md`](../../../../sot/general/Plan.md) (PLAN-RETROFIT-001 — see §3 Batch 2)
- **Project TaskPlan**: [`sot/general/TaskPlan.md`](../../../../sot/general/TaskPlan.md) (TaskPlan-RETROFIT-001 — see Sprint 2)
- **Source-of-truth external evidence**:
  - `src/index.js` (server bootstrap)
  - `src/middleware/errorHandler.js` (404 + error handler)
  - `src/config/index.js` (env-driven config)
  - `src/whatsapp/client.js` (Baileys socket + QR + state machine)
  - `src/whatsapp/antiBan.js` (8-check rate-limiter)
  - `src/whatsapp/broadcaster.js` (in-memory job worker)
  - `src/controllers/authController.js` (`/api/auth/*` handlers)
  - `src/controllers/messageController.js` (`/api/messages/send`)
  - `src/controllers/broadcastController.js` (`/api/messages/broadcast/*`)
  - `src/controllers/contactsController.js` (`/api/contacts`)
  - `src/routes/{auth,messages,broadcast,contacts}.js`
  - `src/inbox/writer.js` (per-contact markdown log + LID↔PN mapper + stats)
  - README §"API reference", §"Authentication flow", §"Sending a text message", §"Broadcasting a message (with anti-ban)", §"Inbound message logging", §"Connection-state error handling", §"Anti-ban behaviour"

## 7. Validation Rules (Auditor Checks)

This Plan passes the auditor checks if:

- [ ] **Metadata**: every metadata field in the YAML front matter
      is filled (`doc_id`, `version`, `status`, `created`, `updated`,
      `author`, `attempt_id`, `run_id`, `cycle_id`,
      `linked_prd_cycle`, `linked_spec`, `linked_prd_project`,
      `linked_frd_project`, `linked_plan_project`,
      `linked_task_plan_project`, `source_versions_covered`,
      `linked_frd_features`, `linked_prd_requirements`,
      `source_of_truth`). No `TBD`.
- [ ] **8 discrete tasks**: T1 auth, T2 single-send, T3 broadcast,
      T4 inbox writer, T5 antiBan, T6 LID↔PN + /api/contacts,
      T7 server bootstrap, T8 verification posture. Each task has
      id, title, goal, status (done), acceptance criteria, files
      touched with line ranges, verification.
- [ ] **Task ordering**: §4 documents the chronological order
      `T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8`, with the
      dependency rationale recorded in §3.2.
- [ ] **Cross-references**: PRD-MVP-1, SPEC-MVP-1, PRD-001,
      FRD-001, PLAN-RETROFIT-001, TaskPlan-RETROFIT-001 are all
      cited verbatim and resolve to existing files (PRD-MVP-1 and
      SPEC-MVP-1 land in seq 2 alongside this Plan; until they
      land, this Plan cites them as `docs/be/features/mvp/{prd.md,
      spec.md}` per the D3 cycle-batched shape).
- [ ] **No new product scope**: the MVP ships as documented; no
      forward-looking tasks are added. Drift surfaced by the seq 4
      audit (e.g. PRD §5 NFR `JITTER_FACTOR=0.3` vs code `0.4`,
      PRD §5 NFR `CONNECTION_WAIT_TIMEOUT_MS=15 000` vs code
      `30 000`) is a finding — not a call to rewrite code (per D7
      and FRD-001 §7.4 OQ-A1).
- [ ] **Test coverage honest**: T8 explicitly documents the MVP's
      lack of dedicated `.test.mjs` files and the cross-cycle
      regression net the MVP actually relies on (per D6). The
      seq 4 audit records this as a known characteristic, not a
      finding.
- [ ] **FRD coverage**: §5's matrix maps every MVP FRD-001
      feature (F-1, F-2, F-3, F-4, F-6, F-8, F-9, F-10, F-11,
      F-39) to at least one task; every PRD-001 §4.1 row
      (FR-1..FR-11) is anchored.
- [ ] **Cross-cycle invariants** (recorded here so the seq 4
      audit re-checks them): the seq-1 typing integration into
      `src/controllers/messageController.js:55, 115` and
      `src/whatsapp/broadcaster.js:179, 246` lives in MVP files
      and is owned by seq 1; the seq-3 AI trigger subscription
      lives in `src/index.js:105-138` and is owned by seq 3; the
      seq-3 inbox `getRecentHistory` lives in
      `src/inbox/writer.js:599-627` and is owned by seq 3. None
      of these cross-cycle touch points are re-described here —
      they are cited as line-range invariants only.

## 8. Notes

- **Why the chronological order is inferred, not recorded**: the
  pre-cycle MVP pre-dates the `be_dev_history.md` convention
  (which starts at the AI cycle). The order in this Plan is
  inferred from (a) the dependency graph in the source
  (`client.js` is imported by `messageController.js`,
  `broadcaster.js`, and `inbox/writer.js`; `antiBan.js` is
  imported by `messageController.js` and `broadcaster.js`),
  (b) the README's section order (auth → send → broadcast →
  inbox → connection-state → anti-ban), and (c) the
  module-level state in `be_dev_history.md` (only the AI cycle
  and post-cycle hotfixes are recorded there). The seq 4 audit
  may surface a different chronological reconstruction — that
  becomes a finding, not a call to rewrite this Plan.

- **Why no per-task test**: the MVP shipped without dedicated
  unit tests (D6, T8). Adding MVP tests in this retro-fit cycle
  is explicitly out of scope (`PLAN-RETROFIT-001 §1.2 NG5` —
  "Re-implementation of any feature. Code is the source of
  truth; the retro-fit produces mavis artifacts that describe
  the code. Drift surfaced by the seq 4 audit is a finding —
  not a call to rewrite code."). The MVP test gap is a known
  characteristic of the as-shipped code, recorded by the seq 4
  audit as a non-finding.

- **Why the broadcaster is T3 and not T2**: the single-send is
  the simplest anti-ban integration (one `check` call, one
  `sendMessage`). The broadcast is the scale-up: it must (a)
  handle transient vs terminal errors, (b) implement retry with
  backoff, (c) drive `_tick` with a single in-flight socket
  write at a time, (d) flip a recipient from `sent` to `failed`
  to `skipped` based on the antiBan verdict. Building the
  single-send first means T3 can reuse `AntiBan.check` + the
  `inbox.markLogged` + `inbox.record` pattern verbatim.

- **Why the inbox writer is T4 (not earlier)**: the inbox writer
  is consumed by `client.js` (`inbox.recordFromBaileys` on
  `messages.upsert`) and by `messageController.js` /
  `broadcaster.js` (`inbox.markLogged` + `inbox.record` on
  outbound). Its internal state machine (per-JID write queues,
  `writtenIds` set with TTL eviction, `meta` map for stats,
  LID↔PN mapper) is large enough that it benefits from the
  callers' interfaces being stable first. Building `client.js`
  (T1), `messageController.js` (T2), and `broadcaster.js` (T3)
  first means the writer's external surface is fixed before
  its internals are fleshed out.

- **Why antiBan is T5 (and not used directly by the writers
  above)**: `antiBan.check` is a pure function that the writers
  (T2, T3) consume. The AntiBan module itself can be developed
  in any order relative to T2/T3 because it has no BE-side
  dependencies. Listing it as T5 keeps the order consistent
  with the README's "Anti-ban behaviour" section being the last
  MVP topic the operator reads.

- **Why the LID↔PN mapper is T6 and not earlier**: the mapper
  is a pure addition to `src/inbox/writer.js` that does not
  block T1–T5. Surfacing it as T6 keeps the inbox-as-shipped
  boundary clean: T4 ships the markdown writer, T6 ships the
  contact-registry surface. The seq 4 audit verifies both
  halves together because they live in the same file.

- **Why the server bootstrap is T7 (last)**: `src/index.js` is
  pure glue — it mounts the routers and wires the signal
  handlers. Until every other module exists, the glue has
  nothing to mount. Building T7 last means the bootstrap can be
  authored against the final module shapes.

- **Why T8 is a documentation task, not a code task**: per D6,
  the MVP shipped without dedicated `.test.mjs` files. T8
  records that fact, names the verification posture the MVP
  actually relies on (`curl` smoke + cross-cycle vitest
  regression net), and tells the seq 4 audit to record the gap
  as a known characteristic, not a finding.

- **What "done" looked like for each task**:
  - T1: `curl POST /api/auth/init` → 202; `curl GET /api/auth/qr`
    → PNG; after phone scan, `curl GET /api/auth/status` →
    `state: "open"`; restart with saved `creds.json` reconnects
    without QR.
  - T2: `curl POST /api/messages/send -d '{"phone":"…","message":"…"}'`
    → `{success: true, data: {…}}`; with `MAX_PER_HOUR=1`, second
    send → 429 + `reason: "quota_exceeded"`.
  - T3: `curl POST /api/messages/broadcast -d '{"phones":[…],
    "message":"…"}'` → 202 + `{jobId, …}`; poll `GET
    /api/messages/broadcast/:jobId` until `pending: 0`;
    `curl DELETE /api/messages/broadcast/:jobId` mid-run cancels.
  - T4: send a message; `cat inbox_logs/wa-chat-<pn>.md` shows
    `[out] me`; receive a message; `[in ] <pushName>` appears.
  - T5: with `MAX_PER_HOUR=1` exhausted, send returns 429;
    `GET /api/messages/broadcast/stats` reports the live counters
    and limits.
  - T6: `curl GET /api/contacts` → `{contacts: []}`; `curl POST
    /api/contacts -d '{"lid":"123@lid","pn":"628123456789"}'`
    → `{registered: true, mappings: [...]}`.
  - T7: `curl -i GET /health` → 200 + CORS headers; with helmet,
    `X-Powered-By` absent; restart with saved creds reconnects.
  - T8: documented.

- **Anti-patterns (do not)**:
  - Do not add a `src/middleware/auth.js` file — there is no
    such file in the shipped MVP. The brief's T1 illustration
    cited `src/middleware/auth.js` but the actual MVP module is
    `src/whatsapp/client.js`. The routes / controllers /
    middleware triad lives at `routes/auth.js`,
    `controllers/authController.js`, `middleware/errorHandler.js`.
  - Do not add new features in this Plan — retro-fit is
    docs-only per `PLAN-RETROFIT-001 §1.2 NG5`.
  - Do not write to `sot/general/*` from this Plan — the
    Supervisor owns those files.
  - Do not re-define the typing indicator here — seq 1 owns it
    (PLAN-TYPING-1).
  - Do not re-define the AI trigger here — seq 3 owns it.

## 9. Change Log

| Version | Date       | Author             | Change |
|---------|------------|--------------------|--------|
| 1.0.0   | 2026-07-10 | @technical-planner | Initial draft. Cycle-level Plan for `be-mvp-retrofit-2026-07-10`. Documents the 8 implementation steps that were actually taken to ship the pre-cycle MVP — auth / single-send / broadcast / inbox / antiBan — in the chronological order they were taken. Cites PRD-MVP-1, SPEC-MVP-1 (cycle), PRD-001, FRD-001, PLAN-RETROFIT-001, TaskPlan-RETROFIT-001 (project). Documents the MVP's lack of dedicated `.test.mjs` files as a known characteristic (D6), not a finding. Records PRD-001 §5 NFR drift (`JITTER_FACTOR=0.3` vs code `0.4`; `CONNECTION_WAIT_TIMEOUT_MS=15 000` vs code `30 000`) as a known characteristic (D7, FRD-001 §7.4 OQ-A1). attempt_id: `ATT-SEQ2-TP-1`. doc_id: `PLAN-MVP-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. |

---

**Next step after this Plan lands**: the parallel seq 2 dispatch
for `@be-engineer` (`ATT-SEQ2-BE-1`) authors
`docs/be/features/mvp/build.md` anchored against this Plan's §4
(task breakdown), §5 (FRD coverage matrix), and §6
(cross-references). Round 2 (Audit) then verifies PRD-MVP-1 /
SPEC-MVP-1 / this Plan / the Build record agree against the
9 MVP source files listed in §6's "Source-of-truth external
evidence" block. The seq 4 SoT-fidelity audit (Batch 4)
re-checks the cross-cycle invariants recorded in §7 (typing
integration into `messageController.js` / `broadcaster.js` from
seq 1; AI trigger subscription in `src/index.js:105-138` from
seq 3; inbox `getRecentHistory` in `src/inbox/writer.js:599-627`
from seq 3).