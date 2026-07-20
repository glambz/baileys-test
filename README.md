# Baileys WhatsApp REST API

A modular Node.js RESTful API for WhatsApp built on top of
[`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys). It
exposes a small HTTP surface for:

1. Initialising WhatsApp authentication and retrieving the QR code.
2. Persisting the session credentials so the connection survives restarts.
3. Sending plain-text messages to any phone number.
4. **Broadcasting** the same message to many recipients with built-in
   **anti-ban** rate limiting, dedup, and connection-loss recovery.
5. **Inbound log** — every message (in or out) is appended to a per-contact
   markdown file in `inbox_logs/`, suitable for grep / LLM ingestion.

---

## Requirements

- **Node.js** >= 18 (tested on 18 / 20 / 22)
- **npm** >= 9
- A WhatsApp account that can scan a QR code from
  *Linked Devices → Link a Device*

> Windows note: Baileys works on Windows out of the box, but on older Node
> builds you may need `npm install -g windows-build-tools` only if you hit
> native build errors — this project has no native deps.

---

## Installation

```bash
# 1. Clone / cd into this folder
cd "baileys test"

# 2. Install dependencies
npm install

# 3. Copy the environment template and edit if needed
cp .env.example .env       # on Windows PowerShell:  Copy-Item .env.example .env
```

`.env` variables:

| Key                  | Default          | Purpose                                |
|----------------------|------------------|----------------------------------------|
| `PORT`               | `3000`           | HTTP port                              |
| `HOST`               | `0.0.0.0`        | HTTP bind host                         |
| `NODE_ENV`           | `development`    | Toggles pretty logger transport        |
| `SESSION_DIR`        | `./auth_info`    | Folder where creds are persisted       |
| `LOG_LEVEL`          | `info`           | pino log level                         |
| `PRINT_QR_IN_TERMINAL` | `true`         | Also print QR to terminal (optional)   |

#### Anti-ban (broadcast + single send)

All knobs are tunable. Defaults are intentionally conservative so a fresh
number can warm up safely; crank them up only once you have an established
reputation. See `.env.example` for the full list and the
[Anti-ban behaviour](#anti-ban-behaviour) section below for what each one
does.

---

## Running

```bash
# Production
npm start

# Auto-reload during development
npm run dev
```

You should see something like:

```
WhatsApp API listening on http://0.0.0.0:3000
POST /api/auth/init   -> start authentication
GET  /api/auth/qr     -> fetch the QR code (base64 PNG)
GET  /api/auth/status -> connection state
POST /api/messages/send -> { phone, message }
```

---

## Authentication flow

1. **Start the server** — `npm start`.
2. **Initialise auth:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/init
   ```
3. **Fetch the QR code:**
   ```bash
   # Open this in a browser, or save to a file:
   curl -o qr.png http://localhost:3000/api/auth/qr
   ```
   The endpoint returns the **raw PNG bytes** with `Content-Type: image/png`
   so it renders directly in any browser, Postman preview, or `<img>` tag:
   ```html
   <img src="http://localhost:3000/api/auth/qr" alt="WhatsApp QR" />
   ```
   If the socket is still connecting, the endpoint responds `202 Accepted`
   with a small JSON body and an `X-WhatsApp-State` header — just retry
   after a second.
4. **Scan** the QR with WhatsApp on your phone. Within a few seconds
   `/api/auth/status` will report `state: "open"`:
   ```bash
   curl http://localhost:3000/api/auth/status
   # { "status": { "state": "open", "connected": true, "user": { ... } } }
   ```

> Want the JSON form (e.g. to embed a data URL in JS)?
> Hit `GET /api/auth/qr.json` instead — same QR, returned as
> `{ "qr": "data:image/png;base64,…", "mimeType": "image/png", "status": … }`.

The credentials are saved to `auth_info/` automatically. On subsequent
restarts, the server will reconnect using the stored credentials — no need
to scan again unless you call `POST /api/auth/logout` or the credentials
expire / are invalidated remotely.

---

## Sending a text message

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{ "phone": "628123456789", "message": "Hello from Baileys!" }'
```

- `phone` accepts digits with or without `+`, spaces, dashes, etc. (e.g.
  `+62 812-3456-7890`, `628123456789`).
- The server validates the number (8–15 digits per E.164) and converts it
  to a WhatsApp JID (`628123456789@s.whatsapp.net`).

Response:

```json
{
  "success": true,
  "data": {
    "messageId": "3EB0...",
    "to": "628123456789@s.whatsapp.net",
    "text": "Hello from Baileys!",
    "timestamp": 1719030000
  }
}
```

---

## API reference

| Method | Path                  | Description                                                |
|--------|-----------------------|------------------------------------------------------------|
| GET    | `/health`             | Liveness probe + uptime                                    |
| POST   | `/api/auth/init`      | Start the Baileys socket (no-op if already connected)      |
| GET    | `/api/auth/qr`        | Latest QR code as a **raw PNG image** (`image/png`)        |
| GET    | `/api/auth/qr.json`   | Same QR as `{ qr: "data:image/png;base64,…", … }`          |
| GET    | `/api/auth/status`    | Current connection state, user, and last error             |
| POST   | `/api/auth/logout`    | Disconnect and wipe `auth_info/` (forces re-auth on next start) |
| POST   | `/api/messages/send`  | Send a single text message — body: `{ "phone": "...", "message": "..." }` |
| POST   | `/api/messages/broadcast` | Queue a broadcast — body: `{ "phones": [...], "message": "..." }` |
| GET    | `/api/messages/broadcast` | List all broadcast jobs (in-memory; lost on restart)   |
| GET    | `/api/messages/broadcast/stats` | Current anti-ban counters and limits             |
| GET    | `/api/messages/broadcast/:jobId` | Job status with per-recipient results          |
| DELETE | `/api/messages/broadcast/:jobId` | Cancel a running job                            |
| GET    | `/api/inbox`                  | In-memory stats of contacts that have a log file |

---

## Broadcasting a message (with anti-ban)

```bash
curl -X POST http://localhost:3000/api/messages/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "phones": [
      "6281234567890",
      "6281234567891",
      "6281234567892"
    ],
    "message": "Promo: weekend sale starts Friday!"
  }'
```

The endpoint returns `202 Accepted` immediately with a job descriptor.
Sends are processed in the background, one recipient at a time, paced
by the anti-ban policy.

```json
{
  "jobId": "9c1b8f3a2d4e6f80",
  "status": "running",
  "total": 3,
  "sent": 0,
  "failed": 0,
  "skipped": 0,
  "pending": 3,
  "results": [
    { "phone": "6281234567890", "jid": "6281234567890@s.whatsapp.net", "status": "pending" },
    { "phone": "6281234567891", "jid": "6281234567891@s.whatsapp.net", "status": "pending" },
    { "phone": "6281234567892", "jid": "6281234567892@s.whatsapp.net", "status": "pending" }
  ],
  "antiBan": { "enabled": true, "messagesLastHour": 0, "messagesLastDay": 0, "limits": { ... } },
  "createdAt": 1782119000000
}
```

Poll the job:

```bash
curl http://localhost:3000/api/messages/broadcast/9c1b8f3a2d4e6f80
```

Cancel it:

```bash
curl -X DELETE http://localhost:3000/api/messages/broadcast/9c1b8f3a2d4e6f80
```

View global anti-ban counters:

```bash
curl http://localhost:3000/api/messages/broadcast/stats
```

> Broadcast jobs live in-memory and are lost on server restart. If you
> need durability, run them through a queue (BullMQ, etc.) and re-issue
> pending jobs on boot.

---

## Anti-ban behaviour

The anti-ban system is **always on by default** and is consulted by both
the single-send endpoint and the broadcast worker. It does the following
on every send:

| Check | Effect |
|---|---|
| **Hourly / daily cap** (`MAX_PER_HOUR`, `MAX_PER_DAY`) | If exceeded, the recipient is **skipped** with reason `quota_exceeded` — does not consume the slot. |
| **Per-recipient cooldown** (`SKIP_IF_MESSAGED_WITHIN_MS`) | If we sent the same number anything in the last N ms, it is **skipped** with reason `recipient_cooldown`. |
| **Content dedup** (`DEDUPE_WINDOW_MS`) | If we sent this exact `message` to the same number in the last N ms, it is **skipped** with reason `duplicate_content`. |
| **Active hours** (`ACTIVE_HOURS_START..END`, 0–24) | Outside the window, sends are **skipped** with reason `outside_active_hours`. |
| **Random delay** (`MIN_DELAY_MS`..`MAX_DELAY_MS`, ±`JITTER_FACTOR`) | The next send is delayed by a uniformly random value in `[min, max]` then jittered by `±JITTER_FACTOR × delay`. |
| **Batch pause** (`BATCH_SIZE`, `BATCH_PAUSE_MS`) | After every N sends, a longer pause (`batchPauseMs`) is inserted to mimic a human stopping to check replies. |
| **Send retry** (`MAX_SEND_RETRIES`) | Transient Baileys errors (408/429/5xx) are retried with exponential backoff. Terminal errors (400/401/403/404) are marked `failed` and never retried. |
| **Connection wait** (`CONNECTION_WAIT_TIMEOUT_MS`) | If the socket is briefly disconnected mid-broadcast, the worker waits up to N ms for it to come back, then proceeds. |

The defaults (15s–45s random delay, 50/hour, 250/day, 20-per-batch with
90s pause, 2-min recipient cooldown, 24h dedup) are tuned for a brand-new
number. As your reputation grows you can lower the delays and raise the
caps. Set `ANTI_BAN_ENABLED=false` to disable all of the above and send
as fast as the socket allows (not recommended — accounts have been
banned within hours of doing this).

> These are **best-effort heuristics**, not a guarantee. WhatsApp does
> not publish its ban thresholds and they change. Combine this with
> opt-in consent, non-duplicate content, and reasonable list sizes.

---

## Inbound message logging

Every WhatsApp event received on the socket (`messages.upsert` for both
inbound and outbound messages, `fromMe` distinguishes the two) is
appended to a per-contact markdown file in `./inbox_logs/`. This is
useful as a raw, human-readable record you can `grep`, hand to an LLM,
or post-process into a structured deal store later.

**File layout**

```
inbox_logs/
├── wa-chat-6285179652486.md     # 1:1 with this phone number
├── wa-chat-6281234567890.md
├── wa-chat-group-120363012345678.md   # @g.us group chats
└── wa-chat-status.md                  # status@broadcast (off by default)
```

**File format** (example)

```markdown
# WhatsApp chat with 6285179652486 (ray)

> Created: 2026-06-29 10:30:51

---

**[2026-06-29 10:30:51] [in ] ray**
Halo kak, mau konfirmasi campaign Senin ya

**[2026-06-29 10:31:12] [out] me**
Siap kak, draft-nya saya kirim siang ini

**[2026-06-29 10:35:03] [in ] ray**
[image:jpeg] (attached)

  Ini mockupnya
```

- `in ` (inbound, contact → you) and `out` (outbound, you → contact).
- `[in ]` / `[out]` are right-padded for column alignment in monospace.
- Media messages (image / video / document / audio / sticker) are recorded
  as `[kind:mime]` placeholders with their caption if any. The raw binary
  is **not** saved by default — this is a text log, not a media store.
- History sync messages (`messages.upsert` with `type: "append"`) are
  included, so the file builds up the full history on first reconnect.
- Reactions, ephemeral view-once wrapper shells, and protocol messages
  (delete / edit) are skipped.
- Writes are serialised per JID via an in-memory promise chain, so
  concurrent events for the same contact never interleave.

**Configuration** (see `.env.example`):

| Env | Default | Purpose |
|---|---|---|
| `INBOX_ENABLED` | `true` | Master switch |
| `INBOX_LOG_DIR` | `./inbox_logs` | Where the `.md` files are written |
| `INBOX_INCLUDE_STATUS` | `false` | Also log `status@broadcast` posts |

**Inspecting the logs**

```bash
# Per-contact read
cat inbox_logs/wa-chat-6285179652486.md

# Find all conversations that mention a campaign
grep -l "campaign" inbox_logs/*.md

# Feed a contact's full history to an LLM
cat inbox_logs/wa-chat-6285179652486.md
```

`GET /api/inbox` returns a small JSON summary of the in-memory counters
(first seen, last seen, count, push name) — useful as a sanity check.
The `.md` files themselves are the source of truth.

> These files are the **raw message log only**. They are not a deal
> database. Once you add AI deal-extraction, write the structured
> results to a real store (SQLite, a CRM, a Google Sheet) and keep
> this as the source of truth for the words.

---

## Connection-state error handling

`connection.update` events from Baileys are translated into a single
`state` field with one of these values:

| state          | Meaning                                                       |
|----------------|---------------------------------------------------------------|
| `close`        | Not connected. Server will auto-reconnect with backoff unless `loggedOut`. |
| `connecting`   | Socket is being opened.                                       |
| `qr`           | A QR code is available via `GET /api/auth/qr`.               |
| `open`         | Authenticated and ready. Messages can be sent.               |

If the remote side returns `loggedOut`, the session folder is deleted and
you must scan again. Any other close reason triggers an exponential
backoff reconnect (`2s`, `4s`, `8s`, `16s`, capped at `30s`).

All HTTP endpoints return appropriate status codes:

- `400` — bad input (invalid phone, empty message)
- `404` — unknown route
- `503` — operation requires an active WhatsApp connection
- `500` — unexpected error

---

## Project layout

```
src/
├── index.js                # Express bootstrap + lifecycle hooks
├── config/index.js         # env loader (server, whatsapp, antiBan, inbox)
├── whatsapp/
│   ├── client.js           # Baileys socket: init, QR, session, send, messages.upsert
│   ├── antiBan.js          # Rate limiter, dedup, quotas
│   └── broadcaster.js      # Background job worker for batch sends
├── inbox/
│   └── writer.js           # Per-contact .md log writer
├── controllers/
│   ├── authController.js
│   ├── messageController.js
│   └── broadcastController.js
├── routes/
│   ├── auth.js
│   ├── messages.js
│   └── broadcast.js
├── middleware/errorHandler.js
└── utils/
    ├── logger.js
    └── instanceLock.js
auth_info/                  # generated at runtime — credentials live here
inbox_logs/                 # generated at runtime — per-contact .md history
```

---

## Security notes

- This API **has no authentication**. Bind it to `127.0.0.1` or put it
  behind a reverse proxy with auth if it is reachable from the network.
- Treat `auth_info/` as a secret — anyone with those files can impersonate
  the linked WhatsApp account.
- Helmet + CORS are enabled by default; tighten `cors()` in `src/index.js`
  if you only consume the API from known origins.

---

## Troubleshooting

- **"WhatsApp is not connected" on send** — you have not called
  `/api/auth/init` yet, or the last QR was never scanned. Check
  `/api/auth/status`.
- **QR refreshes immediately** — common on first run while Baileys negotiates
  the session; just keep polling `/api/auth/qr` until `state` becomes
  `open`.
- **`Error: ENOENT auth_info`** — the folder is created automatically on
  first init; if you deleted it manually, call `/api/auth/init` again.
- **Cannot send to a number** — the phone must already have WhatsApp
  installed. The number must be in international format (no leading `0`).

---

## License

MIT. Use at your own risk: Baileys is an unofficial library and WhatsApp
may rate-limit or ban accounts that send unsolicited bulk messages.

## BE AI Auto-Reply (cycle: be-ai-auto-reply-2026-07-03)

Added in this cycle:

- **LLM gateway** — MiniMax-M3 via the OpenAI-compatible SDK (default) with an Anthropic-compatible fallback selectable via `LLM_PROVIDER`. Structured outputs, 2-attempt HTTP retry, ≤3 parse retries.
- **PostgreSQL** (`pg` + `kysely`) — `ai_settings`, `knowledge_files`, `knowledge_chunks` (pgvector), `entity_definitions`, `entity_records`, `entity_relationships`. Migrations live in `src/db/migrations/`.
- **Full embedding pipeline** — MiniMax embeddings, semantic chunker (~512 tokens, 50-token overlap), `ivfflat` cosine index, hash idempotency.
- **Hybrid retrieval** — Postgres FTS (BM25) + pgvector ANN (cosine) + RRF fusion + cosine rerank + turbo cutoff (`τ_retrieval = 0.30`).
- **WhatsApp trigger** — subscribed to `messages.upsert`, runs the 13-step MVP pipeline, fires fire-and-forget.
- **AIReplyMode state machine** — `ai | human | human_pending_flag` enforced at SQL CHECK + JS layers. `human → human_pending_flag` forbidden.
- **14 REST endpoints** under `/api/crm/{ai,entities,records,knowledge}/...`.
- **Audit log** — NDJSON append-only to `./data/audit/<UTC-date>.ndjson`.
- **Vitest suite** — ≥30 specs across ≥5 spec files. The `composer-byte-identity.test.js` enforces byte-equality between the BE composer and `frontend/src/lib/ai/systemPrompt.ts`.

### Run locally

```bash
# 1. Install
pnpm install

# 2. Copy .env.example → .env and set DATABASE_URL, OPENAI_API_KEY, OPENAI_BASE_URL, LLM_MODEL
cp .env.example .env

# 3. Apply migrations + seed (requires a running Postgres)
pnpm db:check           # NEW — fails fast with install instructions if pgvector is missing
pnpm db:migrate
pnpm db:seed

# 4. Start the BE
pnpm start
```

### Postgres + pgvector setup

The BE depends on the [pgvector](https://github.com/pgvector/pgvector)
extension (used by the embedding / ANN retrieval layer). The migration
runner **refuses to start** without it, and `pnpm db:check` reports a
structured failure with OS-specific install instructions rather than the
raw `extension "vector" is not available` from `CREATE EXTENSION`.

#### Windows (recommended: Docker)

The pgvector project does **not** publish native Windows binaries — the
only practical Windows-friendly paths are:

```powershell
# Option A — Docker Desktop (recommended)
docker run --name baileys-pg `
  -e POSTGRES_PASSWORD=baileys `
  -p 5432:5432 `
  -d pgvector/pgvector:pg16

setx DATABASE_URL "postgres://postgres:baileys@localhost:5432/postgres"
# open a new shell after `setx` so the env var is picked up

# Option B — WSL2 + Ubuntu (native pgvector via apt)
wsl --install -d Ubuntu                  # one-time, then restart
wsl
sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgvector
sudo service postgresql start
sudo -u postgres createuser -s baileys
sudo -u postgres createdb baileys -O baileys
# then set DATABASE_URL to point at the WSL Postgres from Windows

# Option C — Supabase local stack (uses Docker under the hood)
npm install -g supabase
supabase init
supabase start
# copy the printed "DB URL" into DATABASE_URL
```

After starting Postgres, verify the BE can see pgvector:

```powershell
pnpm db:check
# expected:  [preflight] OK — Postgres reachable, pgvector installed.
```

If `pnpm db:check` reports `no_pgvector`, follow the printed install
instructions for your platform. If your DB user can `CREATE EXTENSION`
(typical for the `postgres` superuser), `pnpm db:install-pgvector`
will do it automatically; otherwise it prints the same manual steps.

#### macOS

```bash
brew install pgvector
brew services restart postgresql@16   # match the version you have
```

Or install [Postgres.app](https://postgresapp.com/) (16+ ships pgvector
built-in).

#### Linux

```bash
# Debian / Ubuntu
sudo apt install postgresql-16-pgvector

# Fedora / RHEL / Rocky
sudo dnf install pgvector_16

# Alpine (community package)
sudo apk add postgresql-pgvector
```

Then restart Postgres so the extension loads:

```bash
sudo systemctl restart postgresql
pnpm db:check
```

#### What `pnpm db:check` actually does

1. Opens a connection to `DATABASE_URL` (default
   `postgres://baileys:baileys@localhost:5432/baileys`).
2. Runs `SELECT version()` — confirms Postgres is reachable.
3. Runs `SELECT extname FROM pg_extension WHERE extname = 'vector'`
   — confirms pgvector is registered.

Failure exit codes:

| code              | meaning                                              |
|-------------------|------------------------------------------------------|
| `no_db`           | `DATABASE_URL` unreachable / wrong / Postgres down   |
| `pgvector_check_failed` | DB reachable, but the `pg_extension` lookup failed |
| `no_pgvector`     | DB reachable, but `vector` extension not registered  |

### Locked values

| Value | Where | Reference |
|---|---|---|
| `τ_retrieval = 0.30` | `src/ai/retrieval/hybrid.js::TAU_TURBO` | `docs/be/MVP.md §3.3` |
| `τ_user = settings.whatsappAutoReply.confidenceThreshold` (default 0.7, range 0.5–0.95 step 0.05) | `src/ai/settings/defaults.js` | `docs/be/MVP.md §3.3` |
| `AIReplyMode = 'ai' | 'human' | 'human_pending_flag'` | `src/db/migrations/001-initial.sql`, `src/ai/whatsapp/handoff.js` | `frontend/src/types/crm.ts:7` |
| Hardened 4-rule block (Indonesian) | `src/ai/settings/hardened-rules.js` | `frontend/src/lib/ai/systemPrompt.ts::getHardenedRulesBlock()` |
| `BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` | `src/ai/llm/base-prompts.js` | `frontend/src/lib/ai/systemPrompt.ts` |
| `DEFAULT_AI_SETTINGS` | `src/ai/settings/defaults.js` | `frontend/src/types/aiSettings.ts::DEFAULT_AI_SETTINGS` |

### Endpoints

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/api/crm/ai/ask` | team | RAG ask (no contact filter) |
| POST | `/api/crm/ai/reply-preview` | team | Preview auto-reply without sending |
| POST | `/api/crm/ai/toggle-mode` | team | `{chatId, mode: 'ai'|'human'}` — rejects `human_pending_flag` |
| GET | `/api/crm/entities` | team | List entity definitions |
| POST | `/api/crm/entities` | team | Create entity |
| PATCH | `/api/crm/entities/:id` | team | New version |
| DELETE | `/api/crm/entities/:id` | team | Soft delete |
| GET | `/api/crm/entities/:id/records` | team | List records |
| POST | `/api/crm/entities/:id/records` | team | Create record |
| PATCH | `/api/crm/records/:id` | team | Update record |
| DELETE | `/api/crm/records/:id` | team | Delete record |
| GET | `/api/crm/knowledge/files` | team | List KB files |
| POST | `/api/crm/knowledge/upload` | team | Multipart upload → queued ingest |
| GET | `/api/crm/knowledge/files/:id` | team | File metadata |
| DELETE | `/api/crm/knowledge/files/:id` | team | Delete file + cascade chunks |

### Defense-in-depth (7 layers)

| # | Layer | Where |
|---|---|---|
| 1 | Locked system prompt (BASE + tenant + HARDENED) | `src/ai/settings/composer.js` |
| 2 | Structured output schema (zod) | `src/ai/llm/parse.js` |
| 3 | Citation grounding (cosine ≥ 0.85 per cite) | `src/ai/whatsapp/trigger.js` |
| 4 | Numerical consistency | `src/ai/whatsapp/trigger.js` |
| 5 | NLI entailment | (Phase 2) |
| 6 | Contact-scope hard filter (data layer + prompt + post-validate) | `src/db/migrations/003-indexes.sql` + `src/ai/retrieval/hybrid.js` + `src/ai/whatsapp/trigger.js` |
| 7 | Confidence gate + turbo cutoff | `src/ai/whatsapp/trigger.js` + `src/ai/retrieval/hybrid.js` |

### Deferred to Phase 2 / Phase 3

- NLI cross-check (HTTP NLI endpoint)
- Cross-encoder reranker (replace cosine rerank)
- Multi-tenant wrapper (RLS, per-tenant vector namespacing, JWT)
- WebSocket for real-time `aiMode` changes
- Audit-log export (compliance / S3)
- Streaming replies with typing indicators

Source of truth for cycle scope: `docs/be/MVP.md`.

## Frontend mockup

A Vite + React 18 + TypeScript WhatsApp UI mockup lives at
[`frontend/`](./frontend/README.md). To run it:
`cd frontend && pnpm install && pnpm dev` — http://localhost:5173.
The mock is mock-only — it does not call the Baileys backend in `src/`.