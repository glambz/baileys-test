<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/frontend/general/MODULE_OVERVIEW.md
  - docs/tech/ai-reply-state-machine.md
  - docs/crm/features/*/spec.md
-->

# CRM Data Model — `crm/`

> Authoritative TypeScript interfaces for the CRM + RAG module. Shapes
> only — no runtime code, no Zod schemas inlined, no classes. The
> zod-validator cache lives in the FE layer per
> `docs/tech/frontend-stack.md` §4.

## 1. Conventions

- All identifiers are `string` (UUID v4 in the real backend, `mock-…`
  prefix in the mock layer).
- All timestamps are `number` representing **Unix epoch seconds**
  (matches the existing convention in
  [`chat-data-model.md`](chat-data-model.md) §1).
- All ISO fields end with `At`.
- Optional fields use `?` and must be defensively read by the UI.
- Single Postgres database; **no RLS** in this run (single-tenant).
  Multi-tenant isolation is documented as future work in
  [`../crm/general/MODULE_OVERVIEW.md`](../crm/general/MODULE_OVERVIEW.md) §6.

## 2. AIReplyMode (byte-identical literal union)

The state of the AI autoreply for a chat. The literal union is
**byte-identical** in three files: this file (here), in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §3,
and in [`ai-reply-state-machine.md`](ai-reply-state-machine.md) §1.
**No other file is allowed to spell this type any differently.**

```ts
type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';
```

Semantics:

| Value | Meaning |
|---|---|
| `'ai'` | The AI is allowed to answer inbound messages on this chat. The RAG pipeline runs with the WhatsApp-side hard filter applied. |
| `'human'` | The operator is answering manually. The AI pipeline is **not** invoked. The `'human' → 'human_pending_flag'` transition is **forbidden** — a human-mode chat never auto-flags. |
| `'human_pending_flag'` | The operator asked the AI to draft a reply, the AI produced one with `confidence < 0.7`, the operator must review before it is sent. The bubble is rendered with a "Review" affordance. |

The full transition table is in
[`ai-reply-state-machine.md`](ai-reply-state-machine.md) §2 and
reproduced byte-identical in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §3.

## 3. Confidence threshold (CRM/RAG — distinct from the WhatsApp module)

The CRM/RAG module uses a confidence threshold of **`0.7`**. This is
the value the spec evaluates `RagAnswer.confidence` against to decide
between returning an answer and returning a fallback.

> **Distinct from the WhatsApp module's `0.65`.** The WhatsApp
> `0.65` threshold (declared in [`chat-data-model.md`](chat-data-model.md) §2.6
> and [`../frontend/features/ai-chat/spec.md`](../frontend/features/ai-chat/spec.md) §4)
> applies **only** to the legacy `/api/ai/ask` endpoint. The new
> CRM/RAG pipeline always uses `0.7`. The two thresholds coexist.

Justification for `0.7` (short form): the RAG pipeline composes an
embedding cosine with a metadata overlap score; the combined score
clusters tightly around `0.55` for relevant-but-not-identical records
and `0.82+` for on-topic records on the seed set. `0.7` lands in the
gap with a false-negative rate ≤ 5% and a false-positive rate ≤ 2%.

The constant lives in a single CRM config file
(`frontend/src/lib/config-crm.ts` — the canonical declaration site is
`frontend/src/lib/config-crm.ts:16`) so it can be tuned without code
scattering. The legacy WhatsApp-module `0.65` lives in a different file
(`frontend/src/lib/config.ts`); the two constants are intentionally
separate locked values and must not be consolidated.

## 4. Storage tables (EAV + JSONB)

The five tables declared in
[`../crm/general/MODULE_OVERVIEW.md`](../crm/general/MODULE_OVERVIEW.md) §2
map onto these TypeScript shapes:

### 4.1 `EntityDefinition`

```ts
interface EntityDefinition {
  /** Stable id. */
  id: string;
  /** Machine name; unique per version lineage. e.g. `"customer"`. */
  name: string;
  /** Human label; rendered in nav, schema designer, data viewer. e.g. `"Customer"`. */
  label: string;
  /** lucide-react icon name; rendered in nav. */
  icon: string;
  /** Optional free-text description for the schema designer tooltip. */
  description?: string | null;
  /** Current schema, in the order the operator defined fields. */
  schema_json: EntitySchema;
  /** Monotonically increasing per `name`. New row per edit. */
  version: number;
  /** Unix seconds; the moment this row was created. */
  createdAt: number;
  /** Username / operator id who created this version. */
  createdBy: string;
}

interface EntitySchema {
  fields: FieldDef[];
  relations: RelationDef[];
}

type FieldType =
  | "text" | "longtext" | "number" | "boolean"
  | "date" | "enum" | "relation" | "file"
  | "phone" | "email";

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enumValues?: string[];
  };
  /** When `true`, the field is included in the search index and the
   *  RAG metadata overlap score. */
  indexable: boolean;
}

interface RelationDef {
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  cardinality: "one-to-one" | "one-to-many" | "many-to-many";
}
```

### 4.2 `EntityRecord`

```ts
interface EntityRecord {
  id: string;
  /** Foreign key into `entity_definitions.id` (the *current* version). */
  entityDefinitionId: string;
  /** The machine name of the entity this record belongs to. */
  entityName: string;
  /**
   * Optional FK into the WhatsApp-module `contacts` table. When
   * non-null, the record is "owned" by that contact and the WhatsApp
   * auto-reply hard filter (§5) restricts retrieval to records with
   * the same `contactId` value. The in-app `/ai` path does NOT apply
   * this filter.
   */
  contactId?: string | null;
  /** Field values keyed by `FieldDef.name`. Validated against the
   *  cached zod schema built from `entity_definitions.schema_json`. */
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

### 4.3 `EntityRelationship`

Resolved at query time from `entity_definitions.schema_json.relations`;
materialized into its own table only when the cardinality is
`many-to-many` (so the join is indexable). For one-to-X, the FK lives
on the record's `data` JSONB.

### 4.4 `KnowledgeFile`

```ts
interface KnowledgeFile {
  id: string;
  /** FK into `entity_definitions.id`. */
  entityId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  storageUrl: string;          // signed URL to the object store
  status: "pending" | "chunked" | "embedded" | "failed";
  errorMessage?: string | null;
  uploadedAt: number;
}
```

### 4.5 `KnowledgeChunk`

```ts
interface KnowledgeChunk {
  id: string;
  fileId: string;
  entityId: string;
  ordinal: number;             // position within the file
  text: string;                // ≤ 800 chars per chunk
  /** Mock returns a deterministic 1536-dim vector; real backend uses
   *  `text-embedding-3-small` (or equivalent). */
  embedding: number[];
  tokenCount: number;
  /** Optional citation hint; rendered in evidence. */
  source?: string | null;
}
```

## 5. The hard contact filter (WhatsApp auto-reply)

The WhatsApp auto-reply path applies a **defense-in-depth** hard filter
at the data layer. The filter is **not** a prompt instruction.

The SQL/JOIN in `entity_records` reads:

```sql
SELECT r.*
FROM   entity_records r
JOIN   chats c ON c.id = $chatId
WHERE  r.entity_definition_id = $entityDefinitionId
  AND  r.contact_id = c.contact_id;     -- HARD FILTER (not a prompt)
```

The same query in the in-app `/ai` path:

```sql
SELECT r.*
FROM   entity_records r
WHERE  r.entity_definition_id = $entityDefinitionId;
-- no contact_id predicate
```

The full behavioral contract, the evidence-trail semantics, and the
test that rejects cross-contact leakage are documented in
[`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md) §5.

## 6. Future DB mapping

When the real backend ships, every interface above maps onto a SQL
table of the same name. The mapping:

| Interface | Table | Notes |
|---|---|---|
| `EntityDefinition` | `entity_definitions` | PK = `id`; unique index on `(name, version)`. New row per edit; the current row is the one with the highest `version` per `name`. |
| `EntityRecord` | `entity_records` | PK = `id`; index on `entity_definition_id` and `contact_id` (when present). GIN index on `data jsonb` for the searchable field path. |
| `EntityRelationship` | `entity_relationships` | PK = `(from_entity, from_field, to_entity, to_field)`. |
| `KnowledgeFile` | `knowledge_files` | PK = `id`; FK `entity_id` → `entity_definitions.id`; unique on `sha256`. |
| `KnowledgeChunk` | `knowledge_chunks` | PK = `id`; FK `file_id` → `knowledge_files.id`; FK `entity_id` → `entity_definitions.id`. The `embedding` column uses `pgvector`'s `vector(1536)`. |

The boundary is enforced by a single zod schema in
`frontend/src/lib/contract.ts`; the schemas mirror these interfaces so
the mock layer and the future real backend cannot drift apart silently.
