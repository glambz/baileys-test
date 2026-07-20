<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/crm/features/data-viewer/spec.md
  - docs/tech/crm-data-model.md
-->

# PRD — Data Viewer

## 1. Problem

Once the operator has defined entities, they need a fast way to see,
search, and edit records without leaving the CRM surface.

## 2. Goal

A schema-driven, paginated, searchable table per entity, with a
record form that uses the same validator as the API.

## 3. Users

| Persona | Why they care |
|---|---|
| Operator | Reads and edits records quickly; trusts the validation because it matches the API. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-1 | operator | a table of records per entity, with the columns the schema designer defined | I do not need a developer to add a column. |
| US-2 | operator | to create / edit / delete a record via a form | the data stays clean. |
| US-3 | operator | to search across `indexable` fields | I find a record in seconds. |
| US-4 | operator | the form to use the same validator as the API | what I see is what gets stored. |

## 5. Non-goals

- Bulk edit / bulk delete.
- Cross-entity pivot.
- Inline edit.

## 6. Success criteria

| ID | Measurable |
|---|---|
| A1 | The column list matches `schema_json.fields` in order, type, and label. |
| A2 | A record save round-trips through the form, the API, and the DB without manual reformatting. |
| A3 | The search bar returns only records whose indexed fields contain the query. |
| A4 | The cached zod schema is the single validator for both the form and the API client. |

## 7. Open questions

- None for this run.

## 8. Cross-references

- Spec: [`spec.md`](spec.md).
- Data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- Schema designer: [`../schema-designer/spec.md`](../schema-designer/spec.md).
