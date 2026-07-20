<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/crm/features/data-viewer/spec.md
  - docs/crm/features/knowledge-rag/spec.md
-->

# Feature Spec — Schema Designer

> The schema designer lets the operator define and edit CRM entities,
> their fields, and their relations. Every edit is **versioned**: a
> new row in `entity_definitions` per save; old versions are kept.
> This spec is authoritative; the data shapes live in
> [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).

## 1. Scope

The schema designer is a single page (`/crm/_schema`) with three
nested views:

1. **Entity list** — all current `EntityDefinition` rows, newest first.
2. **Entity editor** — edit a single entity's metadata (name, label,
   icon, description).
3. **Field editor** — add / remove / reorder / edit fields within an
   entity.
4. **Relation editor** — declare a relation between two entities
   (from-entity, from-field, to-entity, to-field, cardinality).

A read-only "Version history" pane on the right shows every prior
version of the entity (one row per `EntityDefinition` with the same
`name`).

## 2. Entity list

| Column | Source | Notes |
|---|---|---|
| Name | `EntityDefinition.name` | monospaced chip. |
| Label | `EntityDefinition.label` | rendered. |
| Icon | `EntityDefinition.icon` | lucide-react icon. |
| Fields | `schema_json.fields.length` | count. |
| Records | join `entity_records` count | live count. |
| Last edit | `createdAt` | formatted as `[YYYY-MM-DD HH:mm]`. |
| Actions | — | `Edit`, `History`, `Delete` (soft). |

### 2.1 New entity

A `+ New entity` button opens a modal with the entity editor (§3)
pre-populated with empty fields. On save, a new `EntityDefinition`
row is inserted with `version: 1`.

### 2.2 Delete

Soft delete only: the row is marked `archived_at` and hidden from
the default list view. Existing records keep working (the
`data_viewer` keeps showing them). The Planner may rename this
mechanism if the storage layer needs a different flag.

## 3. Entity editor

| Field | Validation | Notes |
|---|---|---|
| `name` | required, regex `^[a-z][a-z0-9_]{0,63}$` | unique per `name` lineage; renaming a published entity is a "new lineage" operation (the old name keeps its old versions). |
| `label` | required, string 1–64 | rendered in the UI. |
| `icon` | required, must be a valid `lucide-react` icon name | previewed in the modal. |
| `description` | optional, string ≤ 280 | tooltip in the entity list. |

The entity editor also contains an inline list of the entity's
**fields** (with a `+ Add field` button) and **relations** (with a
`+ Add relation` button).

## 4. Field editor

A field is a row in the field list with the following columns:

| Column | Type | Notes |
|---|---|---|
| `name` | string, regex `^[a-z][a-z0-9_]{0,63}$` | unique within the entity. |
| `label` | string, 1–64 | rendered. |
| `type` | enum | one of `text`, `longtext`, `number`, `boolean`, `date`, `enum`, `relation`, `file`, `phone`, `email`. |
| `required` | bool | validation rule. |
| `default` | any | the value used when the field is absent on a record. |
| `validation` | object | type-dependent: `text` / `longtext` → `pattern` + `min` / `max` length; `number` → `min` / `max`; `enum` → `enumValues[]`; `phone` → E.164 pattern. |
| `indexable` | bool | when `true`, the field is included in the search index and the RAG metadata overlap score. Defaults to `false`. |

### 4.1 Field type `relation`

When `type === "relation"`, the editor expands to show:

- `targetEntity` — select from the list of current `EntityDefinition.name` values.
- `cardinality` — `one-to-one` / `one-to-many` / `many-to-many`.
- `targetField` — the field on the target entity that is the join key.
  Defaults to `id`.

A `relation` field contributes to the `entity_relationships` table
(or, for `one-to-X`, the FK lives on the record's `data` JSONB).

### 4.2 Reordering

Fields are drag-to-reorder within the field list. The order in
`schema_json.fields` is the rendered order in the data viewer's
column list and record form.

## 5. Relation editor

A relation is a row in the relation list with:

| Column | Type | Notes |
|---|---|---|
| `fromEntity` | `EntityDefinition.name` | the entity that holds the FK. |
| `fromField` | string | the field name on `fromEntity` of type `relation`. |
| `toEntity` | `EntityDefinition.name` | the target entity. |
| `toField` | string | defaults to `id`. |
| `cardinality` | enum | `one-to-one`, `one-to-many`, `many-to-many`. |

A `+ Add relation` button adds a row. A relation is saved as part
of the same `EntityDefinition` row (under `schema_json.relations`),
not a separate top-level table.

## 6. Versioning

Every save creates a **new** `EntityDefinition` row with
`version = max(prior version) + 1` for the same `name`. Old rows
are kept; the current row is the one with the highest `version`.

The version history pane on the right of the editor lists every
prior version, newest first. Clicking a row shows a **diff view**
between the current version and that prior version:

- Added fields: green chip.
- Removed fields: red chip.
- Changed fields: yellow chip with a side-by-side detail.
- Reordered fields: a small arrow indicating the new position.

### 6.1 Rollback

A `Restore this version` button on a history row creates a **new**
`EntityDefinition` row whose `schema_json` is a copy of the
selected history row's. Rollback never overwrites; the new row has
`version = max + 1` and a `restoredFrom: <historyId>` field on the
row for audit (in the JSONB `data` of a separate
`entity_definition_history` audit table; not part of the public
shape in [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md)).

## 7. Locked behavior

The schema designer **does not** let the operator:

- Change the storage engine (Postgres is fixed).
- Edit the `id`, `name`, or `version` columns directly — the storage
  layer owns them.
- Delete a `EntityDefinition` that has any `EntityRecord` rows
  attached. The `Delete` button is disabled and the tooltip explains
  "Archive instead; records depend on this entity".

## 8. States

| View | State | UI |
|---|---|---|
| Entity list | Loading | skeleton rows × 6 |
| Entity list | Empty | centered card "Belum ada entity. Klik + New entity untuk mulai." |
| Entity list | Error | red card with `error.message` + `Coba lagi` |
| Entity editor | Saving | disabled form, spinner on Save |
| Entity editor | Saved | toast "Tersimpan (version N)" |
| Entity editor | Validation error | inline red message under the offending field |
| Version history | Loading | skeleton rows × 3 |
| Diff view | identical | muted caption "Tidak ada perubahan" |
| Diff view | diverged | chips with the diff as in §6 |

## 9. Out of scope

- Field-level permissions per operator.
- Import / export of entity definitions.
- Cross-entity join definitions (the data viewer shows one entity
  at a time).

## 10. Cross-references

- Product framing: [`prd.md`](prd.md).
- Data shapes: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- Data viewer (the consumer of these definitions):
  [`../data-viewer/spec.md`](../data-viewer/spec.md).
- Knowledge / RAG (consumes `entity_definitions.id` for `knowledge_chunks`):
  [`../knowledge-rag/spec.md`](../knowledge-rag/spec.md).
