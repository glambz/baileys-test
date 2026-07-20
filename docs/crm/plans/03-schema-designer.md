# Plan 03: Schema Designer

**Goal**: Implement the `/crm/_schema` page from `docs/crm/features/schema-designer/spec.md` — entity list, entity editor (name/label/icon/description), field editor with all 10 field types and drag-to-reorder, relation editor, version history with diff view, and rollback — wired to the Plan 02 mock layer so saves create new `EntityDefinition` versions (never overwrite).
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — page lives at `/crm/_schema` inside the new shell.
- Plan 02 (`02-crm-workspace-and-mock-layer.md`) — types, mock endpoints, and `useEntities` hooks are prerequisites.

## Micro-Tasks

1. **Replace the `/crm/_schema` placeholder with the real schema-designer page**
   - Create `frontend/src/pages/CrmSchemaDesignerPage.tsx` rendering two columns: left = entity list + `+ New entity` button; right = the active entity's editor (or an empty-state card when nothing is selected).
   - The entity list columns: `Name` (monospaced chip), `Label`, `Icon` (lucide), `Fields` (count), `Records` (live count from `useRecords`), `Last edit` (`[YYYY-MM-DD HH:mm]`), `Actions` (`Edit`, `History`, `Delete (soft)`) — per `docs/crm/features/schema-designer/spec.md` §2.
   - States: loading (6 skeleton rows), empty (`Belum ada entity. Klik + New entity untuk mulai.`), error (red card + `Coba lagi`).
   - **Acceptance**: visiting `/crm/_schema` shows the list against the mock; clicking a row opens the editor on the right; `Delete` is disabled (with tooltip `Archive instead; records depend on this entity.`) when `useRecords(entityId).data.total > 0`; `pnpm typecheck` passes.

2. **Build the entity editor modal**
   - Create `frontend/src/components/crm/schema/EntityEditor.tsx` (TSX) with a `<Dialog>` containing fields: `name` (regex `^[a-z][a-z0-9_]{0,63}$`), `label` (1–64), `icon` (lucide-react picker — searchable select of all `lucide-react` icon names), `description` (≤ 280).
   - Inline within the modal: the entity's `Fields` list (with `+ Add field` button) and `Relations` list (with `+ Add relation` button) — those sub-editors land in tasks 3 and 4.
   - On `Save`: call `useCreateEntity()` for new or `useUpdateEntity()` for existing; on success, close the modal, show toast `Tersimpan (version N)`, and let the entity list refetch.
   - **Acceptance**: saving a valid entity inserts a new `EntityDefinition` row with `version = max(prior) + 1` (verified in the mock store via `window.__crmMock.listEntities()`); an invalid `name` shows an inline red error under the field and blocks save; `pnpm typecheck` passes.

3. **Build the field editor for all 10 types**
   - Create `frontend/src/components/crm/schema/FieldRow.tsx` (one row per field) and `frontend/src/components/crm/schema/FieldEditor.tsx` (the expanded edit panel for the selected field).
   - Render the right inputs per `EntityField.type`:
     - `text` / `longtext`: `name`, `label`, `required`, `default`, `validation.pattern`, `validation.min`/`max` (length)
     - `number`: `name`, `label`, `required`, `default`, `validation.min`/`max` (numeric), `indexable`
     - `boolean`: `name`, `label`, `required`, `default`, `indexable`
     - `date`: `name`, `label`, `required`, `default`, `indexable`
     - `enum`: `name`, `label`, `required`, `default`, `validation.enumValues[]` (chip list with add/remove)
     - `relation`: `name`, `label`, `required`, `targetEntity` (select from `useEntities()`), `cardinality` (`one-to-one`/`one-to-many`/`many-to-many`), `targetField` (defaults to `id`)
     - `file`: `name`, `label`, `required`, `default`
     - `phone`: `name`, `label`, `required`, `default`, `validation` (E.164 regex enforced by the shared validator from Plan 02)
     - `email`: `name`, `label`, `required`, `default`, `validation` (RFC-5321-ish regex)
   - **Acceptance**: each field type renders its expected inputs and saves through `useUpdateEntity()`; the shared zod validator from Plan 02 (`getCachedValidator`) rejects an invalid `phone` value before the API call is made; `pnpm typecheck` passes.

4. **Implement drag-to-reorder of fields and the relations editor**
   - In the `Fields` list, use a minimal HTML5 drag-and-drop (no extra deps) to reorder rows; the new order is the array order in `schemaJson.fields`. On drop, call `useUpdateEntity()` with the reordered array.
   - Create `frontend/src/components/crm/schema/RelationEditor.tsx`: a row per relation with `fromEntity`, `fromField`, `toEntity`, `toField` (defaults to `id`), `cardinality`. `+ Add relation` appends a row; `Delete` removes it.
   - **Acceptance**: reordering two fields persists across a page reload (the mock store's `sessionStorage` keeps it); the new order is reflected in the column list when the Data Viewer (Plan 04) renders; `pnpm typecheck` passes.

5. **Build the version history pane with diff view and rollback**
   - Create `frontend/src/components/crm/schema/VersionHistoryPane.tsx` mounted on the right of the entity editor (per `docs/crm/features/schema-designer/spec.md` §1, §6). Lists every `EntityDefinition` row with the same `name` (newest first), grouped by version.
   - Clicking a row opens a diff view comparing the current version to the selected history row:
     - Added fields: green chip.
     - Removed fields: red chip.
     - Changed fields: yellow chip with a side-by-side detail panel.
     - Reordered fields: small arrow with the new position index.
   - A `Restore this version` button creates a **new** `EntityDefinition` row with `version = max + 1` (never overwrites); the new row carries `restoredFrom: <historyId>` in the audit `data` blob (per spec §6.1).
   - States: loading (3 skeleton rows), identical (muted caption `Tidak ada perubahan`), diverged (chips as above).
   - **Acceptance**: saving a field, then changing its `label`, then opening history and restoring the prior version produces a new row whose `version = 2` and whose `schemaJson` matches the prior version; `pnpm typecheck` passes.

## Cross-References
- Page scope (entity list, entity editor, field editor, relations, versioning): `docs/crm/features/schema-designer/spec.md` §1–§7
- Field types + validation rules: `docs/crm/features/schema-designer/spec.md` §4, §4.1
- Versioning + rollback contract: `docs/crm/features/schema-designer/spec.md` §6, §6.1
- Locked behavior (no id/name/version edits; soft delete only): `docs/crm/features/schema-designer/spec.md` §7
- Data shapes (EntityDefinition, EntityField, EntityRelationship): `docs/tech/crm-data-model.md` §2
- Mock endpoints consumed: `docs/frontend/api/api-spec.md` §6 (`GET/POST/PATCH/DELETE /api/crm/entities…`, fields, relations)
- Shared zod validator (the runtime schema): `docs/tech/crm-data-model.md` §3; this plan calls `getCachedValidator` from `frontend/src/lib/crm/zodFromSchema.ts`

## Notes
- The Data Viewer (Plan 04) reads the `schemaJson.fields` array in declared order — schema designer's reorder directly drives the column list order in Plan 04.
- Soft delete sets `archivedAt`; the entity list filters `archivedAt == null`. The mock store honors this.
- `+ Add relation` saves the relation inside the same `EntityDefinition` row under `schemaJson.relations`, NOT as a separate top-level mutation — Plan 02's mock handler enforces this.
- Locked: do NOT add field-level permissions, import/export, or cross-entity joins — those are out of scope per `docs/crm/features/schema-designer/spec.md` §9.
- Do NOT touch `src/` (backend is out of scope this run). The version history is the mock store's history table.