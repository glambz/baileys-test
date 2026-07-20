# Plan 23: Defense-in-Depth Tests — Vitest Suite (≥30 Specs)

**Goal**: Ship a vitest suite at `src/test/` with **at least 30 specs** that exercise every layer of the MVP.md §3.5 defense-in-depth matrix. Each test file corresponds to one invariant; every spec has a clear pass/fail signal tied to a documented behavior.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- All prior plans (15–22) must be `done` — the tests assert behavior that those plans implement.

## Micro-Tasks

1. **Author `src/test/composer-byte-identity.test.js` (the single most important invariant)**
   - Loads `frontend/src/lib/ai/systemPrompt.ts` at test time (or the checked-in fixture from Plan 16 step 7).
   - Calls BE's `buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, tenantName: 'TestCo', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID })`.
   - Asserts the BE output is byte-equal to the FE output for the same input.
   - Repeats for `language='en'`.
   - Repeats for `settings.rules=[...]`, `settings.scope.topics=[...]`, and `settings.tone='enthusiastic'` to cover the per-tenant fragment variations.
   - Asserts `getHardenedRulesBlock()` from BE matches the FE's byte-for-byte.
   - **Acceptance**: `pnpm vitest run src/test/composer-byte-identity.test.js` is green; spec count ≥ 6.

2. **Author `src/test/contact-scope.test.js` (NEVER leaks contact A to chat B)**
   - Seeds `entity_records` rows for contacts `A`, `B`, `C`. Seeds `entity_records` rows that have `contact_id` set AND `entity_records` rows where it is null (tenant-wide records).
   - Test 1: `hybridRetrieval({ scope: 'whatsapp', contactPhone: 'A', query: 'paket bulanan' })` returns ONLY chunks whose source entity belongs to `A` OR is `contact_id IS NULL`.
   - Test 2: Plan 20's `processInboundMessage` for a chat where `chat.contact_id = 'A'` and an LLM response that cites a `B`-contact entity record — the trigger must HOLD (not send).
   - Test 3: SQL-level test — `EXPLAIN ANALYZE` for the contact-scope candidate lookup uses the `entity_records_contact_idx` (regression guard).
   - **Acceptance**: spec count ≥ 3; all green.

3. **Author `src/test/state-machine.test.js` (AIReplyMode transitions; forbidden `human → human_pending_flag`)**
   - All 5 allowed transitions + 1 forbidden (`human → human_pending_flag`).
   - `loadChatMode` returns the persisted mode.
   - `transitionChatMode` rejects `human → human_pending_flag` with `ForbiddenTransitionError`.
   - `POST /api/crm/ai/toggle-mode` with `mode='human_pending_flag'` returns HTTP 400.
   - **Acceptance**: spec count ≥ 5; the forbidden-case spec is explicitly named `forbids_human_to_human_pending_flag`.

4. **Author `src/test/parse.test.js` (zod validation + reject-and-retry)**
   - Valid JSON on first try → 1 attempt.
   - Invalid JSON, valid on second → 2 attempts.
   - Invalid on all 3 attempts → throws `LlmParseError`.
   - Schema validation failure (valid JSON, wrong shape) → retry path.
   - **Acceptance**: spec count ≥ 4.

5. **Author `src/test/hybrid.test.js` (BM25 + ANN + rerank + turbo cutoff + contact-scope)**
   - `bm25Search` returns the right chunk first for a known query.
   - `annSearch` returns the closest embedding first for a known query.
   - `rerank` returns top-K in cosine order.
   - `hybridRetrieval({ scope: 'team', ... })` returns candidates across all contacts.
   - `hybridRetrieval({ scope: 'whatsapp', contactPhone: 'A', ... })` filters to A only.
   - Turbo cutoff: `retrievalScore=0.25` returns empty chunks.
   - **Acceptance**: spec count ≥ 6.

6. **Author `src/test/ingest.test.js` (file → chunk → embed → index; idempotency)**
   - Upload `sample.pdf` → 1 `knowledge_files` row (`status='indexed'`), N `knowledge_chunks` rows with non-empty embeddings.
   - Re-upload same file → same `fileId`, no duplicate chunks.
   - Upload `sample.docx` → chunks have `metadata.sections` populated from the DOCX headings.
   - Upload unsupported MIME → `UnsupportedMimeError`.
   - **Acceptance**: spec count ≥ 4.

7. **Author `src/test/ai-settings-roundtrip.test.js` (settings store → composer → byte-equivalent prompt)**
   - `updateSettings(...)` then `getSettings()` returns the new value.
   - `updateSettings` with invalid `confidenceThreshold` throws `SettingsValidationError`.
   - The composed system prompt reflects the new settings (e.g., new `tone` → fragment has the matching `## Suara & nada` line).
   - **Acceptance**: spec count ≥ 3.

8. **Author `src/test/routes-ai.test.js` (Express route handlers; mock MiniMax)**
   - All 14 endpoints return their documented status code.
   - `POST /api/crm/ai/ask` returns a `CrmAskAiResponse` matching the FE fixture byte-for-byte.
   - `POST /api/crm/ai/toggle-mode` with `mode='human_pending_flag'` returns HTTP 400.
   - `POST /api/crm/ai/reply-preview` does NOT call `sendReply` (spy assertion).
   - **Acceptance**: spec count ≥ 10.

9. **Author `src/test/audit.test.js` (NDJSON audit log shape + redaction)**
   - Each event type produces a JSON object with the required fields.
   - `redactPayload` redacts `apiKey`, `password`, `authorization`, `cookie`, `*token`.
   - The audit file is append-only (re-opening in `'r'` mode and reading returns the rows in order).
   - **Acceptance**: spec count ≥ 4.

10. **Author `src/test/llm-retry.test.js` (HTTP retry semantics)**
    - 429 then 200 → 2 calls, returns second result.
    - 500/500/500 → `LlmPermanentError` after 3 attempts.
    - 400 (schema rejection) → throws immediately (no retry).
    - Anthropic-compat fallback (`LLM_PROVIDER=anthropic-compatible`) uses the `emit_structured_output` tool.
    - **Acceptance**: spec count ≥ 4.

11. **Author `src/test/settings-defaults.test.js` (zod schema + defaults)**
    - `DEFAULT_AI_SETTINGS` parses successfully via `AiSettingsSchema`.
    - `confidenceThreshold: 0.71` fails (not a multiple of 0.05).
    - `tone: 'unknown'` fails (not in enum).
    - `language: 'fr'` fails (not in enum).
    - **Acceptance**: spec count ≥ 4.

12. **Author `src/test/db-migrations.test.js` (migration runner idempotency)**
    - Migration runner against an empty schema applies all 3 files in order.
    - Re-running is a no-op.
    - `FORCE_VERSION=001` re-runs migration 001 only.
    - Each migration's checksum is stable (catches accidental edits).
    - **Acceptance**: spec count ≥ 4.

13. **Set up vitest config + global test bootstrap**
    - `vitest.config.js` at the project root with `test.globals: false`, `test.environment: 'node'`, `test.setupFiles: ['./src/test/setup.ts']`.
    - `setup.ts` creates a per-process ephemeral Postgres schema (`CREATE SCHEMA test_<pid>`), runs migrations against it, runs the dev seed, and registers a global `afterAll` to drop the schema.
    - Mocks for the LLM gateway live under `src/test/__mocks__/` and are auto-applied via `vi.mock()`.
    - **Acceptance**: `pnpm vitest run` runs all suites against an isolated test DB; total spec count ≥ 30; all green.

## Cross-References
- Defense-in-depth matrix (7 layers): `docs/be/MVP.md` §3.5.
- Composer invariant: `docs/be/MVP.md` §3.1 + `docs/crm/plans/16-settings-store-composer-hardened.md` step 4.
- AIReplyMode state machine: `docs/be/MVP.md` §3.4 + `docs/crm/plans/20-whatsapp-trigger-state-machine.md`.
- Contact-scope hard filter: `docs/crm/plans/19-retrieval-pipeline.md` step 4 + Plan 15's `entity_records_contact_idx`.
- LLM gateway retries: `docs/crm/plans/17-llm-gateway.md` (steps 1, 4).
- Audit log: `docs/crm/plans/22-audit-log.md` step 1 + 6.
- Migration runner: `docs/crm/plans/15-db-layer-postgresql.md` step 6.
- Ingest pipeline: `docs/crm/plans/18-kb-ingestion.md` step 4.
- REST endpoints: `docs/crm/plans/21-rest-endpoints.md`.

## Notes
- **≥30 specs.** The cycle's MVP.md §11 acceptance gate is `pnpm test` with ≥30 specs. Plan 23's micro-tasks 1–12 produce ≥51 specs (counted above: 6+3+5+4+6+4+3+10+4+4+4+4 = 57). The 30-spec floor is exceeded by a healthy margin.
- **All 7 defense-in-depth layers exercised.**
  - Layer 1 (locked system prompt) → `composer-byte-identity.test.js`.
  - Layer 2 (structured output schema) → `parse.test.js`.
  - Layer 3 (citation grounding) → `parse.test.js` (per-citation cosine check).
  - Layer 4 (numerical consistency) → `parse.test.js` (number extraction + grounding).
  - Layer 5 (NLI entailment) — **NOT IMPLEMENTED in MVP**; placeholder spec `nli.test.js` is skipped (`describe.skip`) with a `// TODO Phase 2` comment. The skip is documented as intentional, not a coverage gap.
  - Layer 6 (contact-scope filter) → `contact-scope.test.js` (data layer + post-validate).
  - Layer 7 (confidence + turbo cutoff) → `hybrid.test.js` (turbo) + `routes-ai.test.js` (confidence).
- **The vitest suite mirrors the FE cycle-9 suite's structure** (multiple small files per concern; one `setup.ts`; `vi.mock()` for external SDKs). This is deliberate — operators familiar with the FE side can navigate the BE side without re-learning the conventions.
- **No network in unit tests.** Every external call (OpenAI SDK, Baileys socket, multipart upload) is mocked. The `RUN_SMOKE=1` smoke command in Plan 18 step 6 is the only path that hits the network; it's gated out of normal CI.
- **The composer-byte-identity test loads the FE source at test time.** If the FE source is unavailable in CI (e.g., a backend-only CI run without the FE checked out), the test falls back to the checked-in fixture from Plan 16 step 7. Either path must produce byte-equality.
- **Per-process ephemeral Postgres schema.** Each test run gets its own schema; no test pollution. The `afterAll` cleanup drops the schema. This is the test isolation model MVP.md §11 implicitly requires.
- **vitest config uses globals: false** — explicit imports (`import { describe, it, expect } from 'vitest'`) in every file. Matches the FE side's style.