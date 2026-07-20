<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/features/crm-store/spec.md
-->

# CRM Store — PRD

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md) §2.2.

The PRD for the CRM persistence layer. Internal infrastructure, plus
the operator-facing entity-designer / data-viewer API.

## CRM-1. Operator defines a new entity

- **As an** operator,
- **when** I POST `/api/crm/entities` with
  `{ name, label, icon?, description?, schema_json: { fields, relations } }`,
- **I want** the BE to persist a new `entity_definitions` row at
  version `1`,
- **so that** I can start creating records against it.

**Acceptance**

- The `name` is unique per `(tenant_id, name, version)`.
- The `schema_json` is validated against the
  `EntitySchemaJson` zod schema.
- The response includes the new entity's `id` and `version`.

## CRM-2. Operator edits an entity schema

- **As an** operator,
- **when** I PATCH `/api/crm/entities/:id`,
- **I want** the BE to create a **new** row with
  `version = max(version) + 1`,
- **so that** old records stay bound to their validated version.

**Acceptance**

- The old row is NOT mutated.
- The new row's `schema_json` is the post-PATCH value.
- The cached validator (per `entityId,version`) is invalidated.

## CRM-3. Operator creates a record

- **As an** operator,
- **when** I POST `/api/crm/entities/:id/records` with `{ data: { ... } }`,
- **I want** the BE to validate `data` against the entity's zod
  schema and persist the record,
- **so that** the data is consistent with the entity definition.

**Acceptance**

- Validation failure → `400 ValidationError` with zod issue details.
- Success → `201 Created` with the new record's `id`, `entityId`,
  `createdAt`, `updatedAt`.

## CRM-4. Operator lists records

- **As an** operator,
- **when** I GET `/api/crm/entities/:id/records?limit=&offset=`,
- **I want** a paginated list of records,
- **so that** the data viewer can render the table.

**Acceptance**

- Pagination is server-side (`limit` default `20`, max `100`).
- Sorted by `created_at DESC` by default.

## CRM-5. The WhatsApp trigger cannot leak contact data

- **As the** BE,
- **when** the WhatsApp trigger queries records for a chat,
- **I want** the SQL predicate `WHERE contact_id = c.contact_id` to
  be applied **before** any LLM call,
- **so that** no cross-contact leak is possible.

**Acceptance**

- The internal call path always passes `contactId` from
  `chats.contact_id`.
- A test `contact-scope.test.js` seeds two contacts and asserts
  the chat-A query never returns chat-B records.

## CRM-6. Operator soft-deletes an entity or record

- **As an** operator,
- **when** I DELETE the entity or a record,
- **I want** the row marked `deleted_at`,
- **so that** I can restore it later (entity) and the audit log
  preserves the deletion.

**Acceptance**

- `deleted_at` is set to `now()`.
- The row is excluded from default queries.
- Restoration is a separate operation (not in MVP.md §2.3's endpoint
  list; available via direct DB or future endpoint).