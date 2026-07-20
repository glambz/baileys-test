# Plan 21: REST Endpoints — 14 Express Routes Covering MVP.md §2.3

**Goal**: Ship `src/ai/routes/{ai,crm,knowledge}.js` + `src/controllers/ai/{ask,replyPreview,toggleMode}.js` — the 14 REST endpoints from `docs/be/MVP.md` §2.3, each backed by a zod-validated request body, the appropriate store/retrieval module, and the `CrmAskAiResponse` shape from `docs/frontend/api/api-spec.md` §6.3 mirrored on the BE side.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- Plan 16 (`16-settings-store-composer-hardened.md`) — needs `store.js` (settings CRUD).
- Plan 17 (`17-llm-gateway.md`) — needs `createChatCompletion`, `buildUserPrompt`, `parseStructuredOutput`.
- Plan 18 (`18-kb-ingestion.md`) — needs `ingestFile`, `getChunksForFile`, `searchByTextFts`.
- Plan 19 (`19-retrieval-pipeline.md`) — needs `hybridRetrieval`.
- Plan 20 (`20-whatsapp-trigger-state-machine.md`) — needs `transitionChatMode`, `loadChatMode`.

## Micro-Tasks

1. **Author `src/ai/routes/ai.js` (the 3 `/api/crm/ai/*` endpoints)**
   - **`POST /api/crm/ai/ask`** — body `{ question: string, topK?: number }` (zod: question 3–500 chars, topK 1–10 default 5). Calls `buildSystemPrompt({ settings, tenantName: 'Tenant', language: settings.language, basePrompt: ... })`, then `hybridRetrieval({ query: question, scope: 'team', topK })`, then `buildUserPrompt({ question, contextChunks: chunks, chatHistory: [], contactPhone: undefined })`, then `createChatCompletion` + `parseStructuredOutput` against `RagAnswerSchema`. Returns the `CrmAskAiResponse` shape: `{ kind: 'answered', answer, confidence, evidence: [{ entryId, excerpt, source, confidence }], generatedAt, question }` OR `{ kind: 'fallback', message: <locked Indonesian sentence>, suggestion?, rejectedCandidates? }`. **Team scope: NO contact filter** (the operator is asking on behalf of the tenant).
   - **`POST /api/crm/ai/reply-preview`** — body `{ chatId: string, body: string }`. Validates the chat exists and reads `chat.contact_id` + `chat.ai_mode`. If `aiMode === 'human'`, returns `{ kind: 'preview_blocked', reason: 'chat_in_human_mode' }`. Otherwise runs the same retrieval + LLM + parse pipeline as the trigger, scoped to `contactPhone = chat.contact_id`. Returns the candidate answer + confidence + citations WITHOUT sending. Operator uses this to decide whether to flip the chat to AI mode.
   - **`POST /api/crm/ai/toggle-mode`** — body `{ chatId: string, mode: 'ai'|'human' }`. Calls `transitionChatMode(chatId, currentMode, mode, 'operator_toggle')`. Rejects `mode === 'human_pending_flag'` (only the BE sets that — Plan 20). On `ForbiddenTransitionError`, returns HTTP 400 `{ error: 'ForbiddenTransition', message: 'Cannot transition from <from> to <to>' }`. Idempotent: setting the same mode returns `{ ok: true, chatId, mode }` without writing.
   - All three endpoints share a `requireTenant()` middleware (single-tenant for MVP — reads `process.env.DEFAULT_TENANT_ID`, default `'default'`).
   - **Acceptance**: vitest specs (a) `ask` returns a `CrmAskAiResponse` with `kind: 'answered'`; (b) `reply-preview` returns the preview WITHOUT calling `sendReply`; (c) `toggle-mode` with `mode='human_pending_flag'` returns HTTP 400; (d) `toggle-mode` with `mode='human'` and current `aiMode='human'` returns `{ ok: true }` without a DB write.

2. **Author `src/ai/routes/crm.js` (8 entity CRUD endpoints from MVP.md §2.3)**
   - `GET /api/crm/entities` — list all non-deleted `entity_definitions` ordered by `updated_at DESC`. Response shape mirrors `EntityDefinition` from `docs/tech/crm-data-model.md` §4.1.
   - `POST /api/crm/entities` — body `{ name, label, icon?, description?, schemaJson: JsonSchema }`. Creates a new `entity_definitions` row with `version=1`. Validates `name` is unique per tenant.
   - `PATCH /api/crm/entities/:id` — body partial (rename / add field). Inserts a NEW row with `version = max(version) + 1`; the old row remains for history (does NOT soft-delete the old version — version history is preserved per `docs/frontend/api/api-spec.md` §6.5 + `docs/be/features/crm-store/spec.md`).
   - `DELETE /api/crm/entities/:id` — soft-delete: sets `deleted_at = now()`. The entity no longer appears in `GET /api/crm/entities` but is preserved for FK integrity on existing records.
   - `GET /api/crm/entities/:id/records` — paginated (`?limit=50&offset=0`), sorted by `created_at DESC`. Filters: `?contactId=<phone>` (optional), `?q=<text>` (optional, FTS over `data::text`).
   - `POST /api/crm/entities/:id/records` — body validated against the cached zod schema built from `entity.schema_json` (mirrors FE's `zodFromSchema.ts` per `docs/tech/frontend-stack.md` §4). Returns the created `EntityRecord`.
   - `PATCH /api/crm/records/:id` — body partial, re-validated against the entity's current schema.
   - `DELETE /api/crm/records/:id` — hard delete (MVP scope — no soft-delete for records; documented as future work in `docs/be/features/crm-store/spec.md`).
   - All 8 endpoints use zod request validation; failures return HTTP 400 `{ error: 'ValidationError', message, details: zodError.issues }`.
   - **Acceptance**: vitest specs cover each endpoint; the `POST /records` spec asserts that a payload missing a required field returns HTTP 400 with the field name in `details`.

3. **Author `src/ai/routes/knowledge.js` (3 KB endpoints from MVP.md §2.3)**
   - `GET /api/crm/knowledge/files` — list `knowledge_files` rows for the current tenant, with `?status=` filter (default: all). Returns metadata only (no chunk bodies).
   - `POST /api/crm/knowledge/upload` — multipart upload (multer with `memoryStorage`, 50 MB limit). Body: `{ file: <binary> }`. Returns `{ fileId, status: 'queued' }` immediately (HTTP 202). The background worker (registered in `src/index.js`, same as Plan 20) drains the queue and calls `ingestFile` from Plan 18.
   - `GET /api/crm/knowledge/files/:id` — metadata + `chunks_count` + `ingested_at` + `last_error`.
   - `DELETE /api/crm/knowledge/files/:id` — removes the file from disk + cascades to `knowledge_chunks` via the FK (Plan 15). Returns `{ ok: true }`.
   - **Acceptance**: vitest spec uploads a small PDF fixture; the route returns 202 + `{ fileId, status: 'queued' }`; within 2 seconds the `knowledge_files` row is `status='indexed'` with a positive `chunks_count` (proves the async worker drains).

4. **Author `src/ai/routes/index.js` (router aggregator)**
   - Mounts the three routers at their respective paths. Exports `mountAiRoutes(app)` which is called from `src/index.js`.
   - Adds a `404` fallback for unmatched `/api/crm/*` paths.
   - **Acceptance**: `mountAiRoutes(app)` on a fresh Express app exposes all 14 endpoints; OPTIONS preflight returns 204 for each path.

5. **Author `src/controllers/ai/{ask,replyPreview,toggleMode}.js` (handler split)**
   - Each handler is a thin wrapper: validate input via zod, call the relevant store/retrieval function, format the response, write an audit log row (Plan 22).
   - On any thrown error, the handler maps to the appropriate HTTP status:
     - `ValidationError` → 400.
     - `EntityNotFound` / `RecordNotFound` / `FileNotFound` / `ChatNotFound` → 404.
     - `ForbiddenTransitionError` → 400 (per MVP.md §2.3).
     - `LlmPermanentError` / `LlmParseError` → 503.
   - **Acceptance**: vitest spec for each handler asserts the right status code is returned for each error class; the `CrmAskAiResponse` shape matches the FE's `RagAnswer` / `RagFallback` interfaces byte-for-byte (compared via deep-equal against a checked-in fixture).

6. **Wire `src/index.js` to mount the routers**
   - Import `mountAiRoutes` and call it after the existing WhatsApp routes are mounted (do NOT remove or alter the WhatsApp routes — the new routers are additive).
   - The Express JSON body parser is already configured globally; multipart is added by `multer` only for `/api/crm/knowledge/upload`.
   - **Acceptance**: `pnpm start` starts the BE; `curl http://localhost:3000/api/crm/entities` returns 200 + the seeded list (after `db:seed` from Plan 15).

7. **Author `src/test/routes-ai.test.js` (Plan 23 contract; this plan plants the seeds)**
   - Specs covering: (a) each endpoint returns the documented status code; (b) `CrmAskAiResponse` matches the FE fixture byte-for-byte; (c) `toggle-mode` rejects `human_pending_flag` with HTTP 400; (d) `reply-preview` does NOT call `sendReply` (assert via spy).
   - **Acceptance**: `pnpm vitest run src/test/routes-ai.test.js` is green; total spec count ≥ 10.

## Cross-References
- Endpoint table (14 endpoints): `docs/be/MVP.md` §2.3.
- API contract mirrored from FE: `docs/frontend/api/api-spec.md` §6 (CRM endpoints) + §6.3 (`CrmAskAiResponse` / `RagAnswer` / `RagFallback`).
- Data shapes: `docs/tech/crm-data-model.md` §4.1 (EntityDefinition), §4.2 (EntityRecord), §4.5 (RagAnswer / RagFallback).
- Locked Indonesian fallback phrase (referenced in `kind: 'fallback'` response): `docs/frontend/features/ai-chat/spec.md` + `frontend/src/i18n/id.json -> ai.fallback.message`.
- Locked CRM/RAG threshold `0.7`: `docs/tech/crm-data-model.md` §3.
- Composer: `docs/crm/plans/16-settings-store-composer-hardened.md`.
- Retrieval: `docs/crm/plans/19-retrieval-pipeline.md`.
- State machine + toggle-mode: `docs/crm/plans/20-whatsapp-trigger-state-machine.md`.
- LLM gateway: `docs/crm/plans/17-llm-gateway.md`.
- KB ingest: `docs/crm/plans/18-kb-ingestion.md`.
- Audit log on every endpoint: `docs/crm/plans/22-audit-log.md`.

## Notes
- **14 endpoints from MVP.md §2.3.** The list is non-negotiable: 3 `/api/crm/ai/*` + 8 `/api/crm/entities*` + `/records*` + 3 `/api/crm/knowledge/*`. Adding more endpoints is a doc-gap → escalate. Removing any is a scope-reduction → user approval required.
- **Mirror FE's `CrmAskAiResponse`.** The `RagAnswer` and `RagFallback` shapes from `docs/tech/crm-data-model.md` §4.5 + `docs/frontend/api/api-spec.md` §6.3 are byte-equal between the FE and BE. The vitest fixture in step 5 enforces this.
- **Single-tenant for MVP.** `requireTenant()` middleware reads `process.env.DEFAULT_TENANT_ID` (default `'default'`). Multi-tenant isolation is Phase 3 per MVP.md §7.
- **The `/api/crm/ai/ask` endpoint uses `scope='team'`** (no contact filter) because the operator is asking on behalf of the tenant. **The trigger in Plan 20 uses `scope='whatsapp'`** (contact filter applied). These two scopes coexist; neither regresses the other.
- **`toggle-mode` rejects `human_pending_flag`.** The state machine in Plan 20 already rejects it; the REST endpoint surfaces the rejection as HTTP 400. The BE is the ONLY writer of `human_pending_flag`.
- The multipart upload uses `multer.memoryStorage` (not disk) so the buffer can be passed directly to `ingestFile`. The 50 MB limit matches MVP.md §9 estimated KB file sizes.
- **No WebSocket** — Phase 3 per MVP.md §7. Real-time `aiMode` changes propagate via polling on `GET /api/chats/:id` (existing endpoint, untouched).
- The 14 endpoints are **additive** — the existing WhatsApp endpoints (`/api/chats`, `/api/chats/:id/messages`, `/api/ai/ask` legacy) are NOT modified. The legacy `/api/ai/ask` keeps its `0.65` threshold and its mock-data fallback; the new `/api/crm/ai/ask` uses the CRM/RAG `0.7` threshold and the MiniMax pipeline.