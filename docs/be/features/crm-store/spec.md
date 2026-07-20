<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md §2.2, §3.5
  - docs/be/features/ai-orchestration/spec.md
  - docs/be/features/ai-whatsapp-trigger/spec.md
  - docs/tech/crm-data-model.md
  - frontend/src/lib/crm/zodFromSchema.ts
-->

# CRM Store — Spec

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §2.2.
> If anything in this document conflicts with MVP.md §2.2, MVP.md wins.

The **CRM store** is the BE's persistence layer for the user-defined
entity schema and the records that conform to it. It is a hybrid
EAV + JSONB design with schema-versioning, zod-from-schema validation
(mirroring the FE's `zodFromSchema.ts`), and a contact-scope hard
filter at the SQL layer for WhatsApp-scope queries.

## 1. Hybrid EAV + JSONB

| Table | Role |
|---|---|
| `entity_definitions` | EAV metadata: name, label, icon, description, JSON-Schema in `schema_json`, immutable `version` |
| `entity_records` | EAV payload: `entity_id` FK + `data` JSONB; one row per record |
| `entity_relationships` | Join table for `many-to-many` cardinality; resolved at query time for `one-to-X` |

Why hybrid: `entity_definitions` is small and changes infrequently;
it gets its own columns for fast filtering. `entity_records.data` is
schema-driven and grows without ALTER TABLE; JSONB + GIN index gives
us the search and indexing we need without relational schema
migration overhead.

### 1.1 The `AiLanguage` union (byte-identical)

The composer reads `settings.language` for the per-tenant fragment
and the LLM call. The literal union is **byte-identical** across:

- `frontend/src/types/aiSettings.ts:32`
- `docs/tech/ai-settings-data-model.md` §1
- [`../../tech/be-data-model.md`](../../../tech/be-data-model.md) §1
- [`../ai-orchestration/spec.md`](../ai-orchestration/spec.md) §2.3
- this doc

```ts
type AiLanguage = 'id' | 'en' | 'id-mod';
```

## 2. Schema versioning

The `entity_definitions.version` column is **immutable**: a new
PATCH creates a new row with `version = max(version) + 1`. The
UNIQUE constraint is `(tenant_id, name, version)`.

- **Reads** default to the **latest** version of an entity by `name`.
- **Writes** go to the **latest** version.
- **Old records** stay bound to the version they were validated
  against; backfill is lazy: when a record is touched after a schema
  upgrade, it is re-validated against the latest version and rejected
  if it no longer validates.
- **Restoring** a prior version (`POST /api/crm/entities/:name/restore`,
  not in MVP.md §2.3's list but supported by the BE router) creates a
  new row with `version = max + 1` and `schema_json` copied from the
  restored version. The old row stays.

## 3. Zod-from-schema validator

The BE mirrors the FE's
[`frontend/src/lib/crm/zodFromSchema.ts`](../../../frontend/src/lib/crm/zodFromSchema.ts).
The BE's mirror lives at `src/ai/store/entities.js::buildZodSchema(entity)`.

Field-type mapping (FE parity, byte-equivalent for same input):

| FE `EntityFieldType` | BE zod |
|---|---|
| `'text'` | `z.string().max(255)` + optional `regex(validation.pattern)` |
| `'longtext'` | `z.string().max(8192)` |
| `'number'` | `z.number()` + optional `.min/.max(validation.min/max)` |
| `'boolean'` | `z.boolean()` |
| `'date'` | `z.string().regex(/^\d{4}-\d{2}-\d{2}/)` |
| `'enum'` | `z.enum(validation.enumValues)` (or `z.string()` if empty) |
| `'relation'` | `z.string()` |
| `'file'` | `z.string()` |
| `'phone'` | `z.string().regex(/^\+?[0-9]{6,15}$/, 'Nomor telepon tidak valid (E.164)')` |
| `'email'` | `z.string().regex(EMAIL_RFC5321ISH, 'Email tidak valid')` |

A cached validator per `(entityId, version)` is held in-memory
(`Map<entityId, { version, schema }>`), invalidated on PATCH.

## 4. Contact-scope hard filter at the SQL layer (defense-in-depth layer 6)

For ALL WhatsApp-scope queries, the BE emits:

```sql
SELECT r.*
FROM   entity_records r
JOIN   chats c ON c.id = $chatId
WHERE  r.entity_id = $entityId
  AND  r.contact_id = c.contact_id;     -- HARD FILTER
```

The `WHERE r.contact_id = c.contact_id` predicate is **not** a
prompt instruction; it is a SQL predicate applied **before** any LLM
sees the chunks. The BE test suite (`contact-scope.test.js`) seeds
two contacts' records and asserts that a query for chat A never
returns chat B's records at any layer (SQL, retrieval, post-LLM).

For the in-app `/ai` path (`POST /api/crm/ai/ask`), **no** contact
filter is applied:

```sql
SELECT r.*
FROM   entity_records r
WHERE  r.entity_id = $entityId;
-- no contact_id predicate
```

The FE's `/ai` dashboard page declares this scope (full KB + ALL
tenant CRM records); the BE honors it.

## 5. Index strategy

```sql
-- JSONB GIN with the path-ops operator class — better for "key = value"
-- lookups (which the dashboard filters on) than the default GIN.
CREATE INDEX entity_records_data_gin ON entity_records
  USING gin (data jsonb_path_ops);

-- Partial btree on contact_id where it is set; the WhatsApp-scope hard
-- filter is a single equality match against this index.
CREATE INDEX entity_records_contact_idx ON entity_records (contact_id)
  WHERE contact_id IS NOT NULL;
```

The `entity_records_contact_idx` is a **partial** index that only
covers rows with `contact_id IS NOT NULL`; it is small even when most
records have no contact.

## 6. Endpoint surfaces

| Verb | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/crm/entities` | `requireApiKey` | List current `entity_definitions` (latest version per `name`). |
| `POST` | `/api/crm/entities` | `requireApiKey` | Create entity at version `1`. Body validated against the `EntityDefinition` zod schema. |
| `PATCH` | `/api/crm/entities/:id` | `requireApiKey` | Update — creates a new row with `version = max + 1`; old row stays. |
| `DELETE` | `/api/crm/entities/:id` | `requireApiKey` | Soft-delete (set `deleted_at`). Records are NOT cascaded; the FE still renders them but the schema designer hides the entity. |
| `GET` | `/api/crm/entities/:id/records` | `requireApiKey` | Paginated, filtered, sorted list. WhatsApp-scope callers MUST add `?contactId=`; the BE rejects any other path that would expose a cross-contact view. |
| `POST` | `/api/crm/entities/:id/records` | `requireApiKey` | Validate against the entity's zod schema (cached per `entityId,version`). |
| `PATCH` | `/api/crm/records/:id` | `requireApiKey` | Re-validate on every write. |
| `DELETE` | `/api/crm/records/:id` | `requireApiKey` | Soft-delete (set `deleted_at`). |

The full request/response schemas live in [`../../api/api-spec.md`](../../api/api-spec.md).

## 7. The contact-scope endpoint guard

The BE enforces a second guard at the HTTP layer: a request to
`GET /api/crm/entities/:id/records` whose URL has no `contactId`
parameter and which originates from the WhatsApp trigger (internal
call, not operator HTTP) is rejected with `400 ContactScopeRequired`.

The intent is that no future caller can accidentally drop the
`WHERE r.contact_id = c.contact_id` predicate.

## 8. Cross-references

- Goals: [`docs/be/MVP.md`](../../../be/MVP.md) §2.2, §3.5.
- FE data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §4.
- FE zodFromSchema: [`../../../frontend/src/lib/crm/zodFromSchema.ts`](../../../frontend/src/lib/crm/zodFromSchema.ts).
- BE data model mirror: [`../../../tech/be-data-model.md`](../../../tech/be-data-model.md).
- Postgres DDL: [`../../../tech/postgresql-schema.md`](../../../tech/postgresql-schema.md).
- API: [`../../api/api-spec.md`](../../api/api-spec.md).
- AI orchestration (defense-in-depth layer 6):
  [`../ai-orchestration/spec.md`](../ai-orchestration/spec.md) §7.
- AI WhatsApp trigger (post-validation, layer 6 again):
  [`../ai-whatsapp-trigger/spec.md`](../ai-whatsapp-trigger/spec.md) §6.