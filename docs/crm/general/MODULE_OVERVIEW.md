<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/tech/ai-reply-state-machine.md
  - docs/crm/features/navigation/spec.md
  - docs/crm/features/ai-autoreply/spec.md
  - docs/crm/features/schema-designer/spec.md
  - docs/crm/features/data-viewer/spec.md
  - docs/crm/features/knowledge-rag/spec.md
  - docs/frontend/api/api-spec.md (§6 CRM endpoints)
  - docs/frontend/general/MODULE_OVERVIEW.md (coexistence)
-->

# Module Overview — `crm/`

> Single source of truth for the new **CRM + RAG** module. This module
> coexists with the existing WhatsApp module under `docs/frontend/` and
> does **not** change any locked value of that module (the `0.65` AI
> threshold, the contact display rule, the "Grup belum dinamai"
> placeholder, the locked Indonesian fallback sentence, and the stack
> pins are all preserved byte-identical).

## 1. Purpose

The CRM module adds a third surface to the operator dashboard. It
stores arbitrary entities the operator defines (customers, orders,
subscriptions, projects, etc.) and lets a retrieval-augmented AI
generate answers about those entities with full evidence and
strict contact-scoping on the WhatsApp side.

Three surfaces share one window:

1. **Chats** (existing) — WhatsApp inbox. Unchanged.
2. **CRM** (new) — schema-driven workspace for entities and records.
3. **AI** (new) — the same RAG pipeline, but driven from the in-app
   `/ai` surface; **not** contact-scoped.

## 2. Storage model — hybrid EAV + JSONB

Postgres is the single database (single-tenant for this run; multi-tenant
RLS is documented future work — see §6).

Five storage tables:

| Table | Purpose |
|---|---|
| `entity_definitions` | One row per user-defined entity (id, name, label, icon, description, current `schema_json`, current `version`). Versioned: each edit creates a new row. |
| `entity_records` | One row per record. The columns declared in the entity's `schema_json` are stored in a `data jsonb` column. A denormalized `contact_id` FK is added for entities that belong to a contact (optional). |
| `entity_relationships` | One row per declared relation. `{from_entity, from_field, to_entity, to_field, cardinality}`. |
| `knowledge_files` | Uploaded source documents per entity (filename, mime, size, sha256, storage_url, status). |
| `knowledge_chunks` | Chunked + embedded text from `knowledge_files`. `{file_id, entity_id, ordinal, text, embedding vector(1536), token_count}`. |

Every write to `entity_definitions` is a new version row; old versions
are kept for audit. The current version is the one with the highest
`version` per `name`.

### 2.1 Why EAV+JSONB

- **EAV** for the *shape* of entities (so the operator can add fields
  without migrations).
- **JSONB** for the *values* of a record (so we get Postgres GIN indexing
  on `data` and avoid 30+ sparse columns per table).
- A small TypeScript runtime builds a zod schema from `schema_json` and
  caches it, so the data viewer / form / API all share the same
  validator. See `docs/tech/crm-data-model.md` §3.

## 3. The two AI surfaces (and why they behave differently)

| Surface | Trigger | Contact scope | RAG source | Threshold |
|---|---|---|---|---|
| `/api/ai/ask` (in-app) | user submits a question in the AI panel | **none** — the operator sees everything they have access to | `knowledge_chunks` across all entities | CRM/RAG threshold (see [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3) |
| WhatsApp auto-reply (backend, future) | inbound WhatsApp message on a chat | **HARD FILTER at the data layer** — `entity_records.contact_id == chat.contact_id` | `knowledge_chunks` restricted to the chat's contact's entities | CRM/RAG threshold (see [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3) |

The CRM/RAG threshold is **distinct** from the existing WhatsApp-module
`0.65` (which gates the WhatsApp-side "ask the knowledge base" feature
that predates this module). The two thresholds coexist.

Defense-in-depth on the WhatsApp side: the contact filter is applied
**at the data layer** (the SQL/JOIN), not as a prompt instruction. A
test in `docs/crm/features/ai-autoreply/spec.md` §5 rejects any
auto-reply body whose content references a CRM record whose
`contact_id` does not match the chat's `contact_id`.

## 4. State machine for the AI reply mode

Each chat has an `ai_reply_mode` of
`'ai' | 'human' | 'human_pending_flag'`. Transitions are governed by
the state machine in `docs/tech/ai-reply-state-machine.md`. The full
transition table is reproduced byte-identical in
`docs/crm/features/ai-autoreply/spec.md` §3.

The union type is spelled byte-identical in three files:

```
'ai' | 'human' | 'human_pending_flag'
```

`docs/tech/crm-data-model.md` §X, `docs/crm/features/ai-autoreply/spec.md`
§X, `docs/tech/ai-reply-state-machine.md` §X. No other file is allowed
to spell this type any differently.

## 5. Scope

### 5.1 In scope (this run)

- Three-surface navigation (Chats / CRM / AI) — see
  `docs/crm/features/navigation/spec.md`.
- Schema designer: create / edit entities, fields, relations.
  Versioned. See `docs/crm/features/schema-designer/spec.md`.
- Data viewer: schema-driven list + form for records. See
  `docs/crm/features/data-viewer/spec.md`.
- Knowledge/RAG: upload files, chunk, embed, retrieve, answer with
  evidence. See `docs/crm/features/knowledge-rag/spec.md`.
- AI autoreply: state machine + WhatsApp-side contact scoping. See
  `docs/crm/features/ai-autoreply/spec.md`.

### 5.2 Out of scope (this run)

- Multi-tenant isolation (RLS). Documented as future work in §6.
- Real embeddings. The mock layer returns deterministic vectors.
- WhatsApp integration. The backend endpoint
  `POST /api/whatsapp/auto-reply` is **[mock]** until the Baileys
  pipeline is wired.
- Mobile / responsive < 1024 px. This module is desktop-only.

## 6. Future work (out of scope, captured for traceability)

| Item | Notes |
|---|---|
| Multi-tenant RLS | Add `tenant_id` to every storage table + a `USING (tenant_id = current_setting('app.tenant_id')::uuid)` policy. |
| Real embeddings | Replace the deterministic mock with `text-embedding-3-small` or local `bge-small`. |
| Streaming RAG | The new module is non-streaming in this run; the data shape leaves room for a future `stream: true` variant. |
| Cross-entity joins | The data viewer shows a single entity at a time; cross-entity pivot is a later feature. |

## 7. Localization convention

CRM-related keyboard shortcut labels (per Plan 08 MT-5: `crmSearch`,
`crmNewRecord`, `crmUpload`, `groupCrm`) are placed inside the existing
top-level `shortcuts.*` namespace in `frontend/src/i18n/id.json` (lines
84–100) and `frontend/src/i18n/en.json` (lines 84–100), rather than
under a new `crm.shortcuts.*` namespace. Rationale: the keys already
participate in the global "Keyboard shortcuts" overlay (which renders
one merged list for the operator), so grouping them under `shortcuts.*`
keeps that overlay single-source. A future move to `crm.shortcuts.*`
would require the overlay to merge two trees and is therefore deferred
until a second shortcuts surface (e.g. a CRM-only shortcuts dialog) is
introduced.

## 8. Cross-references

- Data shapes: [`docs/tech/crm-data-model.md`](../../tech/crm-data-model.md).
- State machine: [`docs/tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md).
- API contract (CRM section, all `[mock]`): [`docs/frontend/api/api-spec.md` §6](../../frontend/api/api-spec.md).
- Navigation: [`docs/crm/features/navigation/spec.md`](../features/navigation/spec.md).
- AI auto-reply: [`docs/crm/features/ai-autoreply/spec.md`](../features/ai-autoreply/spec.md).
- Schema designer: [`docs/crm/features/schema-designer/spec.md`](../features/schema-designer/spec.md).
- Data viewer: [`docs/crm/features/data-viewer/spec.md`](../features/data-viewer/spec.md).
- Knowledge / RAG: [`docs/crm/features/knowledge-rag/spec.md`](../features/knowledge-rag/spec.md).
- Coexistence with the existing WhatsApp module: [`docs/frontend/general/MODULE_OVERVIEW.md` §10](../../frontend/general/MODULE_OVERVIEW.md) (added by this patch).
