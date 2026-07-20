# Plan 04: Data Viewer

**Goal**: Implement the `/crm/:entityName` records page and `/crm/:entityName/:recordId` record-detail page from `docs/crm/features/data-viewer/spec.md` — schema-driven column list with sort/filter/paginate, the per-type `FieldRenderer`, the create/edit record form validated by the cached zod schema from Plan 02, the search bar across `indexable` fields, and the cross-contact leak guard that mirrors the test declared in `docs/crm/features/ai-autoreply/spec.md` §5.2.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — pages live at `/crm/:entityName` inside the new shell.
- Plan 02 (`02-crm-workspace-and-mock-layer.md`) — types, mock endpoints, hooks, and the shared `getCachedValidator` are prerequisites.
- Plan 03 (`03-schema-designer.md`) — the entity's `schemaJson` is produced by the schema designer; the data viewer renders columns in the order Plan 03 defines.

## Micro-Tasks

1. **Replace the `/crm/:entityName` placeholder with the real data viewer page**
   - Create `frontend/src/pages/CrmDataViewerPage.tsx` rendering:
     - Top bar: entity label (from `useEntity(name)`), `+ New record` button, and a search input (debounced 250 ms; calls `useRecords(entityId, { q })`).
     - Column list table: one column per field in `schemaJson.fields` (declared order), plus `#`, `Updated` (`[YYYY-MM-DD HH:mm]`), and `Actions` (`Open`, `Duplicate`, `Delete (soft)`).
     - Pagination footer: 25 rows per page; `useRecords(entityId, { limit: 25, offset })`.
   - States per `docs/crm/features/data-viewer/spec.md` §7: loading (6 skeleton rows), empty (`Belum ada record. Klik + New record untuk mulai.`), error (red card + `Coba lagi`), searching (input spinner).
   - **Acceptance**: visiting `/crm/customer` (where `customer` is a Plan 02-seeded entity) renders the column list against the mock; the column order matches `schemaJson.fields`; clicking a column header toggles ASC/DESC (default `updatedAt DESC`); `pnpm typecheck` passes.

2. **Build the per-type `FieldRenderer`**
   - Create `frontend/src/components/crm/data/FieldRenderer.tsx` exporting `FieldRenderer({ field, value })` that switches on `field.type`:
     - `text` / `longtext`: inline text (monospaced when `field.name` ends in `_id`); `maxLength` 255 / 8 192.
     - `number`: right-aligned, locale-aware grouping via `Intl.NumberFormat`.
     - `boolean`: green yes / grey no chip.
     - `date`: `[YYYY-MM-DD]` via dayjs.
     - `enum`: colored chip (stable per `enumValues[]` entry via a hash).
     - `relation`: linked text to the target record's display label (the target's first `indexable` field, or `<no label>` when absent).
     - `file`: filename + mime icon; click opens the file URL in a new tab.
     - `phone`: `+<CC> <first-3>-<next-4>-<last-4>` (same formatter as the WhatsApp-module contact display rule; the formatter lives in `frontend/src/lib/contactLabel.ts` — call it, do NOT duplicate).
     - `email`: `mailto:` link (subject blank).
   - **Acceptance**: every field type renders against the mock seed; the `phone` formatter produces the same output as `contactLabel.ts` for an E.164 number; `pnpm typecheck` passes.

3. **Build the create / edit record form**
   - Create `frontend/src/components/crm/data/RecordForm.tsx` rendering one input per field in `schemaJson.fields` order:
     - `text` / `longtext` → shadcn `<Input>` / `<Textarea>`
     - `number` → numeric input; `validation.min`/`max` enforced
     - `boolean` → shadcn `<Switch>`
     - `date` → `<input type="date">` (ISO 8601)
     - `enum` → shadcn `<Select>` with `enumValues[]`
     - `phone` → masked input enforcing `^\+?[0-9]{6,15}$`
     - `email` → `<Input type="email">` with the RFC-5321-ish regex
     - `relation` → search-as-you-type picker (`Combobox`) over the target entity's records, displaying the target's first `indexable` field
     - `file` → filename + `<Input type="file">` (URL stored)
   - Validate via `getCachedValidator(entityId)` from Plan 02 (the **single** validator — do NOT introduce another zod schema here). `required: true` shows a red asterisk and blocks save.
   - On `Save`: call `useCreateRecord()` or `useUpdateRecord()`. On success, close the form, refetch the column list, and highlight the new/edited row for 2 s.
   - `Discard` reverts the form; if dirty, show a confirmation dialog before discarding.
   - **Acceptance**: submitting a valid record persists in the mock store; submitting an invalid `phone` shows the inline error from the shared zod schema (not a separate schema); editing `contactId` is impossible from this page (the field is rendered read-only with tooltip `Set via the contact-linking workflow`); `pnpm typecheck` passes.

4. **Build the record-detail page**
   - Create `frontend/src/pages/CrmRecordDetailPage.tsx` at `/crm/:entityName/:recordId` rendering the record as a read-only card with one row per field, using `FieldRenderer` from task 2.
   - States: loading (skeleton), error (red card), not found (`Record tidak ditemukan`).
   - Top-right action menu: `Edit` (opens the form drawer from task 3), `Duplicate` (creates a copy with a new id and `createdAt`), `Delete (soft)` (sets `archivedAt`).
   - **Acceptance**: visiting `/crm/customer/<id>` renders the read-only view; `Duplicate` produces a new record visible in the column list; `Delete` removes the row from the default view but keeps it in the store; `pnpm typecheck` passes.

5. **Wire the search bar against `indexable` fields and add the cross-contact leak guard**
   - The search input in task 1 calls `useRecords(entityId, { q })`; the mock handler implements the ILIKE-on-`indexable`-fields query from `docs/crm/features/data-viewer/spec.md` §5. Add a unit test in `frontend/src/mock/__tests__/dataViewer.test.ts` that seeds two records (`R-A` and `R-B`), marks `name` `indexable`, and asserts that searching for a substring present in both returns both, while searching for a substring present only in a non-indexable field returns none.
   - **Cross-contact leak guard (mandatory test):** add `frontend/src/mock/__tests__/autoReply.test.ts` (the test declared verbatim in `docs/crm/features/ai-autoreply/spec.md` §5.2): seed two contacts (`C-A`, `C-B`), seed `customer` records `R-A` and `R-B` with `contact_id` matching, seed one `knowledge_chunk` per record, run `useReplyPreview({ chatId: chatWithC-A.id, message: 'Berapa total invoice bulan ini?' })`, and assert (a) the returned `body` contains no identifying field values of `R-B`, (b) every `evidence` item has `contactId === C-A`, and (c) the mock handler's RAG SQL contains the predicate `r.contact_id = chat.contact_id`.
   - **Acceptance**: both tests pass via `pnpm test`; the cross-contact leak test fails if the mock handler drops the `r.contact_id = chat.contact_id` predicate (the CI gate is the contract from `docs/crm/features/ai-autoreply/spec.md` §5.2).

## Cross-References
- Page scope (column list, form, detail, search): `docs/crm/features/data-viewer/spec.md` §1–§5
- `FieldRenderer` per-type rules: `docs/crm/features/data-viewer/spec.md` §3
- Search SQL (mock implements equivalent): `docs/crm/features/data-viewer/spec.md` §5
- States + locked behavior: `docs/crm/features/data-viewer/spec.md` §6, §7
- Cross-contact leak test (the contract this plan enforces): `docs/crm/features/ai-autoreply/spec.md` §5, §5.2
- Data shapes: `docs/tech/crm-data-model.md` §2, §3
- Shared validator: `frontend/src/lib/crm/zodFromSchema.ts` (Plan 02)
- Mock endpoints consumed: `docs/frontend/api/api-spec.md` §6 (`/api/crm/entities/:id/records…`, `/api/crm/ai/reply-preview`)
- Phone formatter reuse (no duplication): `docs/frontend/features/chats/spec.md` (contact-display rule); `frontend/src/lib/contactLabel.ts`

## Notes
- The data viewer is the **consumer** of the schema designer's output; column order and field types are never duplicated — both pages read `schemaJson`.
- `pnpm typecheck`, `pnpm build`, and `pnpm test` must all pass at the end of this plan. The cross-contact leak test is mandatory; without it the Auditor will gate the plan.
- Do NOT add bulk edit, inline edit, or cross-entity pivot — those are out of scope per `docs/crm/features/data-viewer/spec.md` §8.
- Do NOT touch `src/`; everything is mocked via the Plan 02 interceptor.