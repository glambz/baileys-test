# Plan 02: CRM Workspace Shell + Shared CRM Types + Mock Layer

**Goal**: Stand up the `/crm` workspace shell (tab strip Schema / Data / Knowledge + entity list), add the shared CRM TypeScript types and the runtime zod-validator cache from `docs/tech/crm-data-model.md`, and extend `frontend/src/mock/interceptor.ts` with the mock handlers for every CRM endpoint listed in `docs/frontend/api/api-spec.md` §6 — so downstream plans (Schema designer, Data viewer, Knowledge, AI) can build UI against a working mock backend.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — workspace lives inside the new three-pane shell; new routes are wired by Plan 01.

## Micro-Tasks

1. **Add the shared CRM TypeScript types**
   - Create `frontend/src/types/crm.ts` exporting:
     - `EntityDefinition { id, name, label, icon?, description?, schemaJson, version, createdAt, updatedAt, archivedAt? }`
     - `EntityField { name, label, type: 'text'|'longtext'|'number'|'boolean'|'date'|'enum'|'relation'|'file'|'phone'|'email', required?, default?, validation?, indexable? }`
     - `EntityRelationship { id, fromEntity, fromField, toEntity, toField, cardinality: 'one-to-one'|'one-to-many'|'many-to-many' }`
     - `Record { id, entityId, data, contactId?, createdAt, updatedAt, createdBy }`
     - `KnowledgeFile { id, filename, mimeType, size, status: 'pending'|'chunked'|'embedded'|'failed', chunksCount, ingestedAt? }`
     - `KnowledgeChunk { id, fileId, index, text, embeddingRef, metadata }`
     - `AIReplyMode = 'ai' | 'human' | 'human_pending_flag'` (literal union, byte-identical to `docs/tech/crm-data-model.md` §2 / `docs/tech/ai-reply-state-machine.md` §1 / `docs/crm/features/ai-autoreply/spec.md` §2 — NO alternate spelling)
     - `ConfidenceScore`, `AiAnswer`, `FallbackAiAnswer`, `Evidence` mirroring the WhatsApp module's shapes in `frontend/src/types/ai.ts`
   - Re-export all of the above from `frontend/src/types/index.ts`.
   - **Acceptance**: `pnpm typecheck` passes; `grep -R "AIReplyMode" frontend/src/types/` returns exactly one definition (in `crm.ts`); every type listed above is exported and `import { … } from '@/types'` resolves.

2. **Build the runtime zod-validator cache**
   - Create `frontend/src/lib/crm/zodFromSchema.ts` exporting:
     - `buildZodSchema(entity: EntityDefinition): z.ZodObject<…>` — generates a zod schema from `entity.schemaJson.fields` honoring `required`, `validation.min/max`, `validation.pattern`, `validation.enumValues[]`, `validation.phone` E.164 pattern, `validation.email` RFC-5321-ish regex.
     - `getCachedValidator(entityId: string): z.ZodObject<…>` — memoized per `entityId`; cache is invalidated when a new `EntityDefinition.version` arrives via TanStack Query.
   - The Data Viewer (Plan 04) and the API client (this plan) both consume this cache — no other validator is allowed for record saves.
   - **Acceptance**: a unit test in `frontend/src/lib/crm/__tests__/zodFromSchema.test.ts` builds a schema with `text`, `number`, `enum`, `phone`, `email`, `required`, `min/max`, and verifies it rejects an out-of-range number and an invalid phone; `getCachedValidator` returns the same instance for the same `entityId` and a new instance after a version bump; `pnpm typecheck` passes.

3. **Extend the mock interceptor with the CRM endpoints**
   - In `frontend/src/mock/interceptor.ts`, add handlers (all returning `Promise` with `~120 ms` simulated latency, deterministic data, in-memory store):
     - `GET/POST /api/crm/entities`, `PATCH /api/crm/entities/:id`, `DELETE /api/crm/entities/:id` (soft-delete → set `archivedAt`)
     - `GET/POST /api/crm/entities/:id/fields`, `PATCH /api/crm/fields/:id`, `DELETE /api/crm/fields/:id`
     - `GET /api/crm/entities/:id/records?limit&offset&filter&sort&q` (implements the ILIKE-on-indexable-fields search from `docs/crm/features/data-viewer/spec.md` §5 against the in-memory store), `POST /api/crm/entities/:id/records`, `PATCH /api/crm/records/:id`, `DELETE /api/crm/records/:id`
     - `POST /api/crm/ai/ask` (team-scope: NO contact filter; returns `{ answer, confidence, evidence[] }`; the evidence item carries the `contactId` from the chunk's record)
     - `POST /api/crm/ai/toggle-mode` (`{ chatId, mode: 'ai' | 'human' }`; rejects `mode === 'human_pending_flag'` because that state is system-set only — per `docs/tech/ai-reply-state-machine.md` §2)
     - `POST /api/crm/ai/reply-preview` (`{ chatId, message }` → returns `{ answer, confidence, evidence, would_send: boolean, reason }`; the handler MUST apply the hard contact filter `record.contact_id === chat.contact_id` at the data layer — see Plan 04 cross-ref and `docs/crm/features/ai-autoreply/spec.md` §5)
     - `GET /api/crm/knowledge/files`, `POST /api/crm/knowledge/upload` (multipart base64), `DELETE /api/crm/knowledge/files/:id`
   - The handlers persist across hot-reload via `sessionStorage` under the key `crm.mock.state.v1` (so a page reload keeps the operator's edits during a demo).
   - **Acceptance**: `pnpm dev` boots; from the browser console, calling `await window.__crmMock.listEntities()` (a small debug helper added to `interceptor.ts`) returns the seeded entities; calling `POST /api/crm/ai/toggle-mode` with `mode: 'human_pending_flag'` returns `400`; a reload preserves the seeded state.

4. **Build the `/crm` workspace shell and the entity list page**
   - Create `frontend/src/pages/CrmWorkspacePage.tsx` that renders:
     - A top tab strip with three tabs (`Schema`, `Data`, `Knowledge`) using shadcn `<Tabs>` from `frontend/src/components/ui/`. The active tab is mirrored to the URL (`/crm`, `/crm/_schema`, `/crm/_knowledge`, or `/crm/:entityName`).
     - Below the strip, an "Entities" card listing every non-archived `EntityDefinition` (name, label, icon, field count, record count, last edit) — fetched via `useQuery({ queryKey: ['crm','entities'], queryFn: … })` from `frontend/src/lib/apiClient.ts`.
     - States: loading (6 skeleton rows), empty (`Belum ada entity. Klik + New entity untuk mulai.`), error (red card with `Coba lagi`).
   - The `+ New entity` button opens a modal that calls `POST /api/crm/entities` (the form itself is implemented in Plan 03 — for now the button opens a placeholder modal that logs `"create entity TBD"` and is replaced wholesale by Plan 03).
   - **Acceptance**: visiting `/crm` renders the tab strip + entity list against the mock; clicking the `Schema` tab navigates to `/crm/_schema` and renders the Plan 03 placeholder; clicking `Knowledge` navigates to `/crm/_knowledge` (Plan 05 placeholder); `pnpm typecheck` passes.

5. **Wire TanStack Query hooks for the CRM domain**
   - Create `frontend/src/hooks/crm/useEntities.ts` exporting `useEntities()`, `useEntity(id)`, `useCreateEntity()`, `useUpdateEntity()`, `useArchiveEntity()`.
   - Create `frontend/src/hooks/crm/useRecords.ts` exporting `useRecords(entityId, { limit, offset, q, sort })`, `useRecord(entityId, recordId)`, `useCreateRecord(entityId)`, `useUpdateRecord()`, `useDeleteRecord()`.
   - Create `frontend/src/hooks/crm/useKnowledge.ts` exporting `useKnowledgeFiles()`, `useUploadKnowledgeFile()`, `useDeleteKnowledgeFile()`.
   - Create `frontend/src/hooks/crm/useCrmAi.ts` exporting `useAskAi()` (team scope), `useToggleAiMode()`, `useReplyPreview()`.
   - All hooks go through `frontend/src/lib/apiClient.ts` (no direct `fetch` calls); query keys are namespaced `['crm', …]`.
   - **Acceptance**: `pnpm typecheck` passes; `grep -R "fetch(" frontend/src/hooks/crm/` returns 0 hits; every hook returns a TanStack Query result with stable query keys; on a forced error the hooks surface a typed `ApiError` from `frontend/src/lib/apiError.ts`.

## Cross-References
- Type shapes (EntityDefinition, EntityField, …, AIReplyMode): `docs/tech/crm-data-model.md` §2, §3
- Hard contact filter + reply-preview contract: `docs/crm/features/ai-autoreply/spec.md` §5, §5.2
- State machine (toggle-mode rejection): `docs/tech/ai-reply-state-machine.md` §2
- CRM endpoints (the full surface this plan mocks): `docs/frontend/api/api-spec.md` §6
- Workspace tab strip + entity list behavior: `docs/crm/features/navigation/spec.md` §1.3 (route `/crm`); `docs/crm/features/schema-designer/spec.md` §2 (entity list columns); `docs/crm/features/data-viewer/spec.md` §1 (consumer)
- Module overview (route map, locked decisions): `docs/crm/general/MODULE_OVERVIEW.md` §1, §3, §4

## Notes
- This plan is the foundation for Plans 03, 04, 05, 06, 07 — they all consume the types, the zod cache, the mock layer, and the hooks created here. Do NOT skip or stub these — downstream plans will assume they exist.
- The mock interceptor's `ai/reply-preview` handler is the **only** place the WhatsApp-path contact filter is applied at the data layer in this run (the real backend is out of scope). It must mirror `docs/crm/features/ai-autoreply/spec.md` §5.2's test setup so the test in Plan 04 can be wired against it.
- `AIReplyMode` must NOT be redefined anywhere. If a future plan needs it, it imports from `frontend/src/types/crm.ts` only.
- `pnpm typecheck` and `pnpm build` must pass at the end of this plan; the Auditor will gate this.