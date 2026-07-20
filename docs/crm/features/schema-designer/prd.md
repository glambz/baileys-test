<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/crm/features/schema-designer/spec.md
-->

# PRD — Schema Designer

## 1. Problem

The operator's CRM needs to fit their business, not the other way
around. Today they would have to ask a developer to add a column.
That is a bottleneck.

## 2. Goal

The operator can define and evolve the CRM's entities, fields, and
relations from the UI, with full version history and rollback.

## 3. Users

| Persona | Why they care |
|---|---|
| Operator (admin) | The CRM shapes itself around the business without engineering help. |
| Operator (data entry) | Indirectly benefits from the new fields without needing to know they exist. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-1 | operator | to create a new entity (name, label, icon, description) | I can model a new business object. |
| US-2 | operator | to add / edit / remove / reorder fields per entity | the entity grows with the business. |
| US-3 | operator | to declare a relation between two entities | the data model is connected. |
| US-4 | operator | to see the version history of an entity | I can audit or roll back a bad change. |
| US-5 | operator | to roll back to any prior version | mistakes are cheap. |

## 5. Non-goals

- Field-level permissions.
- Schema import / export.
- Cross-entity join definitions.

## 6. Success criteria

| ID | Measurable |
|---|---|
| A1 | Creating a new entity inserts exactly one row in `entity_definitions` with `version: 1`. |
| A2 | Editing an existing entity inserts a new row with `version = max + 1`; the old row is preserved. |
| A3 | The diff view shows added / removed / changed fields per the spec. |
| A4 | The data viewer picks up the new schema within one query refetch (no page reload). |

## 7. Open questions

- None for this run.

## 8. Cross-references

- Spec: [`spec.md`](spec.md).
- Data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- Data viewer: [`../data-viewer/spec.md`](../data-viewer/spec.md).
