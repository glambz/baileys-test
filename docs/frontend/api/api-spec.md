# API Spec — `frontend/`

> The mock-first API contract that the frontend implements today and the
> future Baileys backend in `src/` must satisfy 1:1. Every endpoint is
> tagged **[mock]** (implemented in `frontend/src/mock/*`) or **[future]**
> (to be wired when backend integration lands). Backend file:line
> citations point at the eventual integration target.

## 1. Conventions

- **Base path**: `/api`.
- **Encoding**: JSON request and response bodies; UTF-8.
- **Timestamps**: Unix **seconds** (not milliseconds). Matches the
  `timestamp` field returned by `src/controllers/messageController.js:96`.
- **IDs**: opaque strings. Mock IDs are `mock-<ulid>`; real IDs are the
  Baileys `key.id` (e.g. `3EB0...`).
- **Errors**: `{ error: "<MachineCode>", message: "<human>", details?: any }`
  with the appropriate HTTP status. The frontend treats `error` codes as
  branch points and `message` as display text.
- **Auth**: none yet. The backend today has no authentication layer (see
  `README.md` §Security). When the backend grows one, an `Authorization:
  Bearer …` header will be introduced; the mock already accepts and
  ignores it so the swap is mechanical.

## 2. Endpoints

### 2.1 `GET /api/chats` — list chats

**Tag:** **[mock]** (today) → **[future]** (replace with a real read of
`inbox_logs/*.md` aggregated by JID). **Contract for future Baileys backend:**
`Chat.phone` MUST be present and derived from the most recent
`Message.key.senderPn` for the chat — never parsed from the JID. Absence of
`phone` on a 1:1 chat is a contract violation.

**Response 200**

```jsonc
{
  "chats": [
    {
      "id": "mock-01HXYZ…",
      "jid": "6285179652486@s.whatsapp.net",
      "phone": "6285179652486",
      "lastMessagePreview": "Siap kak, draft-nya saya kirim siang ini",
      "lastMessageAt": 1751294400,
      "unreadCount": 2,
      "pinned": true,
      "muted": false,
      "archived": false
    }
    // …
  ]
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 503 | `BackendNotReachable` | (future only) the Baileys socket is in state `close`. |

### 2.2 `GET /api/chats/:id/messages` — thread history

**Tag:** **[mock]** (today) → **[future]** (replace with a server-side
reader over `inbox_logs/wa-chat-<phone>.md`). **Contract for future Baileys
backend:** every `Message` MUST include `key.senderPn` for 1:1 chats (it is
the display-source phone for the contact label per
[`../frontend/general/MODULE_OVERVIEW.md`](../frontend/general/MODULE_OVERVIEW.md)
§7). Absence of `senderPn` on an inbound 1:1 message is a contract
violation.

**Path params**

| Name | Type | Description |
|---|---|---|
| `id` | string | The `Chat.id`. The mock resolves it to a JID/phone internally. |

**Query params**

| Name | Type | Default | Description |
|---|---|---|---|
| `limit` | int | `50` | Page size, max 200. |
| `before` | int (unix seconds) | — | Return only messages strictly older than this; for "load older". |

**Response 200**

```jsonc
{
  "chatId": "mock-01HXYZ…",
  "messages": [
    {
      "id": "mock-msg-01",
      "chatId": "mock-01HXYZ…",
      "direction": "in",
      "key": {
        "remoteJid": "6285179652486@s.whatsapp.net",
        "fromMe": false,
        "senderPn": "6285179652486"
      },
      "senderName": "Pak Hendro",
      "body": "Halo kak, mau konfirmasi campaign Senin ya",
      "kind": "text",
      "caption": null,
      "mime": null,
      "timestamp": 1751290800
    }
    // …
  ],
  "nextBefore": 1751287200   // omit when there are no older messages
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 404 | `ChatNotFound` | `id` does not match any known chat. |

### 2.3 `POST /api/chats/:id/messages` — send a reply

**Tag:** **[mock]** (today; returns a fabricated id after a 400 ms
artificial delay) → **[future]** (delegates internally to
`POST /api/messages/send` defined at `src/routes/messages.js:1`, which
routes to the controller at `src/controllers/messageController.js:29`).

**Request body**

```jsonc
{
  "body": "Siap kak, draft-nya saya kirim siang ini"
}
```

**Validation** (zod in the mock, the same schema reused on the backend):

- `body` is required, string, trimmed length 1–4096.

**Response 200**

```jsonc
{
  "message": {
    "id": "mock-msg-99",
    "chatId": "mock-01HXYZ…",
    "direction": "out",
    "key": {
      "remoteJid": "6285179652486@s.whatsapp.net",
      "fromMe": true
    },
    "senderName": null,
    "body": "Siap kak, draft-nya saya kirim siang ini",
    "kind": "text",
    "caption": null,
    "mime": null,
    "timestamp": 1751294400
  }
}
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | `body` missing, wrong type, too long, or empty after trim. |
| 404 | `ChatNotFound` | `id` does not match. |
| 429 | `AntiBanBlocked` | (future only) anti-ban policy skipped the send — see `src/controllers/messageController.js:51`. |
| 503 | `WhatsAppNotConnected` | (future only) socket is not in the `open` state. |

### 2.4 `POST /api/ai/ask` — ask the knowledge base

**Tag:** **[mock]** (today; brute-force cosine over hardcoded
`KnowledgeEntry[]` in `frontend/src/mock/knowledge.ts`) → **[future]**
(retrieval-augmented pipeline over the `knowledge_entries` DB table
matching [`docs/tech/chat-data-model.md`](../../tech/chat-data-model.md)).

**Request body**

```jsonc
{
  "question": "Berapa harga paket campaign Bulanan?",
  "topK": 3                   // optional, default 3, max 5
}
```

**Validation**

- `question` is required, string, trimmed length 3–500.
- `topK` is optional, int, 1–5.

**Response 200 — answered** (`AiAnswer`)

```jsonc
{
  "kind": "answered",
  "answer": "Paket Bulanan Rp 4.500.000 include 12 posting dan 1 campaign.",
  "confidence": 0.92,
  "evidence": [
    {
      "entryId": "k-014",
      "excerpt": "Paket Bulanan — Rp 4.500.000 / bulan, 12 posting + 1 campaign",
      "source": "internal/pricing-2026Q3.md",
      "sourceUrl": "https://docs.internal/pricing-2026Q3",
      "confidence": 0.92
    }
  ],
  "generatedAt": 1751294400,
  "question": "Berapa harga paket campaign Bulanan?"
}
```

**Response 200 — fallback** (`FallbackAiAnswer`, when
`confidence < 0.65`)

```jsonc
{
  "kind": "fallback",
  "message": "Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …",
  "suggestion": {
    "entryId": "k-007",
    "question": "Berapa harga paket campaign Mingguan?",
    "source": "internal/pricing-2026Q3.md"
  },
  "rejectedCandidates": [
    { "entryId": "k-007", "confidence": 0.41 },
    { "entryId": "k-011", "confidence": 0.22 }
  ]
}
```

The `message` field is the **fixed Indonesian sentence** declared in
[`features/ai-chat/spec.md`](../features/ai-chat/spec.md) and **must be
byte-identical there** — no rewording.

The confidence threshold is **`0.65`**, the module-wide value declared in
[`../frontend/general/MODULE_OVERVIEW.md`](../frontend/general/MODULE_OVERVIEW.md).

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | `question` missing, wrong type, too short / too long. |
| 503 | `AiUnavailable` | (future only) retrieval pipeline is down. |

### 2.5 `GET /api/auth/status` — WhatsApp connection state

**Tag:** **[mock]** (today; always `{ connected: true, state: "open", … }`)
→ **[future]** (forwarded from `src/controllers/authController.js:90`,
route declared at `src/routes/auth.js:11`).

**Response 200**

```jsonc
{
  "connected": true,
  "state": "open",
  "userJid": "6281234567890@s.whatsapp.net",
  "userName": "Indocyber Studio",
  "lastUpdatedAt": 1751290000
}
```

`state` is one of `"open" | "qr" | "connecting" | "close"`. When
`state !== "open"`, `connected` is `false`.

The frontend uses this to render a small banner in the top-right of both
pages: green dot when `connected`, yellow during `qr`/`connecting`, red
when `close`.

## 3. Mock-only fields

These fields appear in mock responses today and will be removed when the
real backend lands because they cannot be sourced reliably:

| Field | Reason mock-only |
|---|---|
| `Chat.id` prefixed with `mock-` | The real id will be derived from the chat's first inbound message id. |
| `Chat.pinned`, `Chat.muted`, `Chat.archived` | Backend currently has no per-chat metadata store; future enhancement. |
| Random artificial delays in `POST /api/chats/:id/messages` | Removes when the real Baileys call is wired. |

Every mock-only field is explicitly marked with a comment in the mock
implementation files (`/* mock-only */`).

## 4. Future-only fields

These fields are documented here so the frontend can plan for them but are
**not** in any mock response yet:

| Field | Source when wired |
|---|---|
| `Message.caption`, `Message.mime` for media kinds | `src/whatsapp/client.js` already decodes media — see how `src/controllers/messageController.js:74` sends text; media is a small variant. |
| `AiAnswer.evidence[].confidence` (per-evidence) | Required for the audit log; can ship before per-evidence ranking. |
| `FallbackAiAnswer.rejectedCandidates` | Optional telemetry; off by default to keep responses lean. |

## 5. Cross-references

- Feature that uses §2.1 and §2.2 and §2.3:
  [`features/chats/spec.md`](../features/chats/spec.md).
- Feature that uses §2.4:
  [`features/ai-chat/spec.md`](../features/ai-chat/spec.md).
- Data shapes returned:
  [`../../tech/chat-data-model.md`](../../tech/chat-data-model.md).
- Backend integration target:
  `src/controllers/messageController.js`, `src/routes/messages.js:1`,
  `src/routes/auth.js:11`, `src/controllers/authController.js:90`,
  `src/controllers/contactsController.js:1`.

## 6. CRM endpoints

> **Status of CRM endpoints after the `be-ai-auto-reply-2026-07-03` run.**
>
> The endpoints in §6.1–§6.4 below are now tagged **`[future]`**
> rather than `[mock]`. The real BE implementation lives at
> [`../../be/api/api-spec.md`](../../be/api/api-spec.md) and replaces
> the FE mocks endpoint-for-endpoint with the same request /
> response shapes. The FE keeps its `frontend/src/mock/crm/*` layer
> as the local stub until the BE is wired up in a follow-up cycle.
> The existing WhatsApp endpoints (§2.1–§2.5) are unchanged.
>
> The CRM module coexists with the WhatsApp module. The locked
> values of the WhatsApp module (`0.65` AI threshold, the contact
> display rule, the "Grup belum dinamai" placeholder, the locked
> Indonesian fallback sentence, the stack pins) are **preserved
> byte-identical** in this section. The CRM module introduces its
> own CRM/RAG confidence threshold (see
> [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3);
> the two thresholds coexist and are not interchangeable.
>
> **Canonical BE source for the CRM contract:**
> [`../../be/api/api-spec.md`](../../be/api/api-spec.md).

### 6.1 Entity definitions — `[future]` (BE-wired in run `be-ai-auto-reply-2026-07-03`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/crm/entities` | List all current `EntityDefinition` rows (newest first). |
| GET | `/api/crm/entities/:name` | Get the current `EntityDefinition` for a given `name`. |
| POST | `/api/crm/entities` | Create a new entity (version `1`). |
| PUT | `/api/crm/entities/:name` | Save a new version of an existing entity. |
| GET | `/api/crm/entities/:name/history` | List every prior version of the entity, newest first. |
| POST | `/api/crm/entities/:name/restore` | Restore a prior version; the result is a new row with `version = max + 1` and a `restoredFrom` audit field. |

The request and response shapes mirror
[`EntityDefinition`](../../tech/crm-data-model.md) §4.1. The mock
seed includes `customer` and `invoice` entities. Full contract:
[`../../be/api/api-spec.md` §3](../../be/api/api-spec.md).

### 6.2 Records — `[future]` (BE-wired in run `be-ai-auto-reply-2026-07-03`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/crm/records?entityName=…&q=…&limit=…&offset=…` | List records of one entity, with optional `q` for full-text search over `indexable` fields. |
| GET | `/api/crm/records/:id` | Get one record. |
| POST | `/api/crm/records` | Create a record. Validates against the cached zod schema built from `entity_definitions.schema_json`. |
| PUT | `/api/crm/records/:id` | Update a record. |
| DELETE | `/api/crm/records/:id` | Soft delete. |

The response shape mirrors
[`EntityRecord`](../../tech/crm-data-model.md) §4.2. The `contactId`
field is **not** settable from this endpoint; it is set by the
future contact-linking workflow. Full contract:
[`../../be/api/api-spec.md` §3](../../be/api/api-spec.md).

### 6.3 Knowledge / RAG — `[future]` (BE-wired in run `be-ai-auto-reply-2026-07-03`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/crm/knowledge/files?entityId=…` | List `KnowledgeFile` rows for an entity. |
| POST | `/api/crm/knowledge/files` | Upload a file; returns `{ fileId, sha256 }`. |
| POST | `/api/crm/knowledge/files/:id/reembed` | Re-run the pipeline from the first failed stage. (Not in MVP.md §2.3 — Phase 2 candidate.) |
| DELETE | `/api/crm/knowledge/files/:id` | Delete a file and all its `KnowledgeChunk` rows. |
| POST | `/api/crm/ai/ask` | The **in-app** RAG query. **No contact filter.** Returns a `RagAnswer` or a `RagFallback` (CRM threshold declared in [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3). |

The `POST /api/crm/ai/ask` request and response shapes mirror
[`RagAnswer` / `RagFallback`](../../tech/crm-data-model.md) §4.5
and §6. The threshold is the CRM/RAG threshold declared in
[`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3,
**distinct** from the WhatsApp module's `0.65` in §2.4. The
Indonesian fallback sentence is **byte-identical** to the one in
§2.4 (locked across the whole project — see §7 of
[`../crm/features/knowledge-rag/spec.md`](../crm/features/knowledge-rag/spec.md)).

**Errors** (CRM endpoints)

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | Body fails the zod schema. |
| 400 | `RelationCycle` | The PUT would create a cyclic relation. |
| 404 | `EntityNotFound` | `:name` is not a current entity. |
| 404 | `RecordNotFound` | `:id` is not a known record. |
| 404 | `FileNotFound` | `:id` is not a known `KnowledgeFile`. |
| 503 | `CrmUnavailable` | (future) the Postgres store or the embeddings pipeline is down. |

### 6.4 WhatsApp auto-reply — `[future]` (BE-wired in run `be-ai-auto-reply-2026-07-03`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/whatsapp/auto-reply` | Future backend hook called by the Baileys inbound pipeline. Reads `chat.contact_id` and the chat's `ai_reply_mode`; calls the RAG pipeline **with the hard contact filter applied at the data layer**; returns a `WhatsAppAutoReplyDecision` (`send` / `hold` / `none`) and the evidence trail. |

This endpoint is implemented by the BE (run `be-ai-auto-reply-2026-07-03`)
and wired into Baileys's `messages.upsert` subscription
(non-HTTP entry point at `src/ai/whatsapp/trigger.js::processInboundMessage`).
The full contract — including the cross-contact leak test — lives in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §5
and §5.2. The state machine that decides between `send` / `hold` /
`none` is in
[`../../tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md)
and mirrored for the BE at
[`../../be/features/ai-state-machine/spec.md`](../../be/features/ai-state-machine/spec.md).

### 6.5 CRM cross-references

- CRM data shapes: [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md).
- State machine: [`../../tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md).
- CRM module overview: [`../../crm/general/MODULE_OVERVIEW.md`](../../crm/general/MODULE_OVERVIEW.md).
- Feature specs:
  [`../crm/features/navigation/spec.md`](../crm/features/navigation/spec.md),
  [`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md),
  [`../crm/features/schema-designer/spec.md`](../crm/features/schema-designer/spec.md),
  [`../crm/features/data-viewer/spec.md`](../crm/features/data-viewer/spec.md),
  [`../crm/features/knowledge-rag/spec.md`](../crm/features/knowledge-rag/spec.md).
