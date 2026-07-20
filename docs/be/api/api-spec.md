<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md §2.3
DEPENDS_ON:
  - docs/be/MVP.md §2.3
  - docs/be/general/MODULE_OVERVIEW.md
  - docs/be/features/*/spec.md
  - docs/frontend/api/api-spec.md §6 (FE mock contract being replaced)
  - frontend/src/types/crm.ts (FE type parity)
-->

# API Spec — `be/` (Real Implementation)

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../be/MVP.md) §2.3.
> If anything in this document conflicts with MVP.md §2.3, MVP.md wins.

The **real REST contract** that the BE in `src/` implements. This
replaces the FE's `[mock]` tags in
[`docs/frontend/api/api-spec.md` §6](../../frontend/api/api-spec.md)
with `[future]`. Every endpoint below mirrors the FE's mock response
shape byte-for-byte for the same input.

## 1. Conventions

- **Base path**: `/api`.
- **Encoding**: JSON request and response bodies; UTF-8.
- **Timestamps**:
  - HTTP layer: Unix **seconds** (matches the existing convention in
    `src/controllers/messageController.js:96`).
  - DB layer: `TIMESTAMPTZ` (Postgres).
  - Audit log: ISO 8601 string.
- **IDs**: opaque strings. Use `nanoid` for new IDs.
- **Errors**: `{ error: "<MachineCode>", message: "<human>", details?: any }`
  with the appropriate HTTP status.
- **Auth**: `requireApiKey` middleware on every endpoint in this run
  (BE has it from earlier cycles; the FE's mock ignores it for now).
- **Rate limits**: **none** for MVP. Flagged for Phase 2 in MVP.md §7.

## 2. AI endpoints

### 2.1 `POST /api/crm/ai/ask` — team-scope RAG query

Mirrors FE's `CrmAskAiResponse` schema (see
[`frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts) §117-149).

**Request**

```jsonc
{
  "question": "Berapa harga paket Bulanan?",
  "topK": 5            // optional, default 5, range [1, 10]
}
```

**Validation (zod)**

- `question`: string, trimmed length 3–500.
- `topK`: int, 1–10.

**Response 200 — answered**

```jsonc
{
  "kind": "answered",
  "answer": "Paket Bulanan Rp 4.500.000 include 12 posting dan 1 campaign.",
  "confidence": 0.92,
  "evidence": [
    {
      "kind": "kb",
      "entryId": "k-014",
      "excerpt": "Paket Bulanan — Rp 4.500.000 / bulan, 12 posting + 1 campaign",
      "source": "internal/pricing-2026Q3.md",
      "contactId": null,
      "confidence": 0.92
    }
  ],
  "generatedAt": 1751294400,
  "question": "Berapa harga paket Bulanan?"
}
```

**Response 200 — fallback** (confidence `< 0.7` or no evidence)

```jsonc
{
  "kind": "fallback",
  "message": "Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …"
}
```

The `message` is the **byte-identical** Indonesian fallback phrase
embedded in `BAILEYS_AI_SYSTEM_PROMPT_ID`. Same for English.

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | Body fails zod. |
| 401 | `Unauthorized` | `requireApiKey` missing or invalid. |
| 503 | `AiUnavailable` | LLM gateway or retrieval pipeline is down. |

### 2.2 `POST /api/crm/ai/reply-preview` — preview a WA auto-reply

Operator previews what the BE would reply for `(chatId, body)` **before**
flipping the chat to AI mode. **Does NOT send.**

**Request**

```jsonc
{
  "chatId": "...",
  "body": "Berapa harga paket Bulanan?"
}
```

**Response 200**

```jsonc
{
  "answer": "Paket Bulanan Rp 4.500.000 …",
  "confidence": 0.92,
  "evidence": [
    { "kind": "kb", "entryId": "k-014", "excerpt": "…", "source": "…", "contactId": null, "confidence": 0.92 }
  ],
  "would_send": true,
  "reason": null
}
```

`would_send` is `false` when the confidence is below `τ_user` or the
turbo cutoff fires; `reason` carries the human-readable explanation.

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | Body fails zod. |
| 401 | `Unauthorized` | Missing API key. |
| 404 | `ChatNotFound` | `chatId` not found. |
| 503 | `AiUnavailable` | LLM gateway is down. |

### 2.3 `POST /api/crm/ai/toggle-mode` — flip a chat's `ai_mode`

**Request**

```jsonc
{
  "chatId": "...",
  "mode": "human"     // "ai" | "human" — "human_pending_flag" is rejected
}
```

**Response 200**

```jsonc
{ "chatId": "...", "previousMode": "ai", "currentMode": "human" }
```

**Errors**

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | Body fails zod or `mode === "human_pending_flag"`. |
| 400 | `ForbiddenTransition` | E.g. `human → human_pending_flag` (forbidden by state machine). |
| 401 | `Unauthorized` | Missing API key. |
| 404 | `ChatNotFound` | `chatId` not found. |
| 409 | `ConflictTransition` | Concurrent caller beat the transition. |

## 3. CRM endpoints (entities + records)

### 3.1 `GET /api/crm/entities`

List current `EntityDefinition` rows (latest version per `name`).

**Response 200**

```jsonc
{
  "entities": [
    {
      "id": "...",
      "name": "customer",
      "label": "Customer",
      "icon": "users",
      "description": null,
      "schema_json": { "fields": [ ... ], "relations": [ ... ] },
      "version": 1,
      "createdAt": 1751294400
    }
  ]
}
```

### 3.2 `POST /api/crm/entities`

Create entity at version `1`.

**Request** — `EntityDefinition` minus `id`/`version`/`createdAt`/`updatedAt`.

**Response 201** — full `EntityDefinition` (with `id`, `version: 1`).

**Errors** — `400 ValidationError`, `401 Unauthorized`.

### 3.3 `PATCH /api/crm/entities/:id`

Update schema — creates a new row at `version = max + 1`. Old row stays.

**Response 200** — new `EntityDefinition` row.

**Errors** — `400 ValidationError`, `401 Unauthorized`, `404 EntityNotFound`.

### 3.4 `DELETE /api/crm/entities/:id`

Soft-delete (`deleted_at = now()`). Records are not cascaded.

**Response 204** — no body.

**Errors** — `401 Unauthorized`, `404 EntityNotFound`.

### 3.5 `GET /api/crm/entities/:id/records`

Paginated list of records for one entity.

**Query params**

| Name | Type | Default | Description |
|---|---|---|---|
| `limit` | int | `20` | Max `100`. |
| `offset` | int | `0` | |
| `contactId` | string (E.164 digits) | — | **Mandatory** for WhatsApp-scope callers (the internal trigger). Operator HTTP may omit. |
| `q` | string | — | Full-text search over `indexable` fields via GIN. |

**Response 200**

```jsonc
{
  "records": [
    {
      "id": "...",
      "entityId": "...",
      "entityName": "customer",
      "contactId": "6285179652486",
      "data": { "name": "Pak Hendro", "phone": "6285179652486" },
      "createdAt": 1751294400,
      "updatedAt": 1751294400,
      "createdBy": "operator-1"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 137
}
```

**Errors** — `400 ValidationError`, `401 Unauthorized`, `404 EntityNotFound`,
`400 ContactScopeRequired` (internal call without `contactId`).

### 3.6 `POST /api/crm/entities/:id/records`

Validate `data` against the entity's zod schema and persist.

**Request**

```jsonc
{
  "data": { "name": "Pak Hendro", "phone": "6285179652486" },
  "contactId": "6285179652486"     // optional; set when linking to a WA contact
}
```

**Response 201** — full record shape (see 3.5).

**Errors** — `400 ValidationError`, `401 Unauthorized`, `404 EntityNotFound`.

### 3.7 `PATCH /api/crm/records/:id`

Update record (re-validate on every write).

**Request** — partial `{ data?: { ... }, contactId?: string }`.

**Response 200** — full record shape.

**Errors** — `400 ValidationError`, `401 Unauthorized`, `404 RecordNotFound`.

### 3.8 `DELETE /api/crm/records/:id`

Soft-delete record.

**Response 204** — no body.

**Errors** — `401 Unauthorized`, `404 RecordNotFound`.

## 4. KB endpoints

### 4.1 `GET /api/crm/knowledge/files`

List `knowledge_files` for the current tenant.

**Query params** — `limit` (default `20`, max `100`), `offset`.

**Response 200** — array of `KnowledgeFile`-shaped objects (status
mapped to FE enum per [`../be/features/kb-ingestion/spec.md` §10`](../features/kb-ingestion/spec.md)).

```jsonc
{
  "files": [
    {
      "id": "...",
      "filename": "pricelist-2026.pdf",
      "mimeType": "application/pdf",
      "size": 1234567,
      "status": "embedded",     // "pending" | "chunked" | "embedded" | "failed"
      "chunksCount": 47,
      "ingestedAt": 1751294400,
      "errorMessage": null,
      "uploadedAt": 1751294000
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 12
}
```

**Errors** — `400 ValidationError`, `401 Unauthorized`.

### 4.2 `POST /api/crm/knowledge/upload`

Multipart upload. Pipeline runs async.

**Request** — `multipart/form-data` with the `file` part.

**Response 200** (immediate, async pipeline)

```jsonc
{ "fileId": "...", "sha256": "...", "chunksCount": 0, "status": "pending" }
```

**Errors** — `400 ValidationError` (unsupported mime, > 50 MB),
`401 Unauthorized`.

### 4.3 `GET /api/crm/knowledge/files/:id`

Metadata + chunk count + last-reindex timestamp.

**Response 200** — single `KnowledgeFile`-shaped object.

**Errors** — `401 Unauthorized`, `404 FileNotFound`.

### 4.4 `DELETE /api/crm/knowledge/files/:id`

Remove file + chunks (CASCADE on FK; binary unlinked).

**Response 204** — no body.

**Errors** — `401 Unauthorized`, `404 FileNotFound`.

## 5. Cross-references

- Goals: [`docs/be/MVP.md`](../../be/MVP.md) §2.3.
- Module overview: [`../general/MODULE_OVERVIEW.md`](../general/MODULE_OVERVIEW.md).
- Feature specs:
  [`../features/ai-orchestration/spec.md`](../features/ai-orchestration/spec.md),
  [`../features/ai-whatsapp-trigger/spec.md`](../features/ai-whatsapp-trigger/spec.md),
  [`../features/ai-state-machine/spec.md`](../features/ai-state-machine/spec.md),
  [`../features/kb-ingestion/spec.md`](../features/kb-ingestion/spec.md),
  [`../features/crm-store/spec.md`](../features/crm-store/spec.md).
- BE data model: [`../../tech/be-data-model.md`](../../tech/be-data-model.md).
- FE types (parity target): [`../../../frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts).
- FE mock contract (being replaced): [`../../frontend/api/api-spec.md` §6](../../frontend/api/api-spec.md).