<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/crm/features/schema-designer/spec.md
-->

# Feature Spec — Data Viewer

> The data viewer renders the records of one `EntityDefinition` at a
> time. The column list and the record form are **schema-driven**:
> they are rendered from the entity's `schema_json` at runtime, via
> the cached zod validator declared in
> [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3.

## 1. Scope

The data viewer is the page at `/crm/:entityName` plus a record
detail at `/crm/:entityName/:recordId`. It renders four things:

1. **Column list** — one column per `FieldDef` (in the order
   defined in `schema_json.fields`).
2. **Record form** — the form for creating or editing a record, with
   one input per field, validated by the cached zod schema.
3. **Record detail** — read-only view of one record, with the field
   values rendered by type.
4. **Search bar** — full-text search across `indexable` fields.

## 2. Column list

The table has one column per field in `schema_json.fields`, in the
declared order, plus:

| Column | Source | Notes |
|---|---|---|
| `#` | row index | for human reference. |
| `<per field>` | `record.data[field.name]` | rendered by `FieldRenderer` (see §3). |
| `Updated` | `record.updatedAt` | formatted as `[YYYY-MM-DD HH:mm]`. |
| `Actions` | — | `Open`, `Duplicate`, `Delete` (soft). |

### 2.1 Sorting and filtering

- Click a column header to toggle ASC / DESC. Default sort is
  `updatedAt DESC`.
- A filter row under the headers lets the operator type a substring
  for any text field. Numeric / date / enum fields get a dedicated
  filter UI.

### 2.2 Pagination

- 25 rows per page; pagination is a `LIMIT 25 OFFSET N` query.
- Server-side pagination is required once the row count exceeds
  1 000; the spec leaves the threshold to the implementation.

## 3. The `FieldRenderer` (per-type)

| `FieldDef.type` | Renderer | Notes |
|---|---|---|
| `text` | inline text, monospaced when the field name ends in `_id` | `maxLength: 255` enforced. |
| `longtext` | wrapped inline text | `maxLength: 8 192`. |
| `number` | right-aligned number | locale-aware grouping. |
| `boolean` | yes / no chip | green / grey. |
| `date` | `[YYYY-MM-DD]` | dayjs. |
| `enum` | colored chip per `enumValues[]` | the chip colors are stable per value. |
| `relation` | linked text to the target record's display label | the display label is the value of the target's first `indexable` field, or `"<no label>"` when absent. |
| `file` | filename + mime icon; click opens the file | files are stored in the object store at `KnowledgeFile.storageUrl`. |
| `phone` | `+<CC> <first-3>-<next-4>-<last-4>` | same formatter as the WhatsApp-module contact display rule. |
| `email` | `mailto:` link | mailto subject is left blank. |

## 4. Record form

The form renders one input per field, in the order declared in
`schema_json.fields`. The validation rules are:

- `required: true` → input shows a red asterisk and blocks save.
- `type: number` → numeric input; `validation.min` / `validation.max` enforced.
- `type: enum` → a select with `enumValues[]` as options.
- `type: phone` → E.164-only input (`^\+?[0-9]{6,15}$`).
- `type: email` → RFC-5321-ish regex.
- `type: date` → `<input type="date">`; ISO 8601 string.
- `type: relation` → a search-as-you-type picker of the target
  entity's records; the picker shows the target's first `indexable`
  field.

The cached zod schema is the **single** validator. The form and the
API client both use it. When the schema is updated, both
auto-refresh.

### 4.1 Save

A `Save` button at the bottom of the form POSTs to
`POST /api/crm/records` (or `PUT /api/crm/records/:id` for an
existing record). On success, the form closes, the table re-fetches,
and the new row is highlighted for 2 s.

### 4.2 Discard

A `Discard` button reverts the form to the loaded record. If the
form is dirty, a confirmation dialog appears.

## 5. Search

A search bar at the top of the column list runs a server-side
query:

```sql
SELECT r.*
FROM   entity_records r
WHERE  r.entity_definition_id = $entityDefinitionId
  AND  EXISTS (
    SELECT 1
    FROM   jsonb_each(r.data) AS kv(k, v)
    JOIN   entity_fields f ON f.entity_definition_id = r.entity_definition_id
                          AND f.name = kv.k
    WHERE  f.indexable = TRUE
      AND  kv.v::text ILIKE '%' || $q || '%'
  );
```

The query is a `q` parameter on `GET /api/crm/records?entityName=…&q=…`.
The mock layer returns deterministic results without Postgres; the
real backend uses the query above.

## 6. Locked behavior

The data viewer **does not** let the operator:

- Edit the `id`, `createdAt`, or `updatedAt` columns.
- Edit the `contactId` of a record from this page. The `contactId`
  is set by the future contact-linking workflow (out of scope this
  run) or imported via the API; the field is rendered read-only with
  a tooltip "Set via the contact-linking workflow".

## 7. States

| View | State | UI |
|---|---|---|
| Column list | Loading | skeleton rows × 6 |
| Column list | Empty | centered card "Belum ada record. Klik + New record untuk mulai." |
| Column list | Error | red card with `error.message` + `Coba lagi` |
| Column list | Searching | input shows a spinner; results refresh on debounce (250 ms). |
| Record form | Saving | disabled form, spinner on Save |
| Record form | Validation error | inline red message under the offending field |
| Record detail | Not found | red card with `Record tidak ditemukan` |

## 8. Out of scope

- Bulk edit / bulk delete.
- Inline edit (edit-in-place in the column list).
- Cross-entity pivot / join.

## 9. Cross-references

- Product framing: [`prd.md`](prd.md).
- Data shapes: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- Schema designer (the producer of these definitions):
  [`../schema-designer/spec.md`](../schema-designer/spec.md).
- API contract: [`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).
