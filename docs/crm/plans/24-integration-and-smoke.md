# Plan 24: Integration & Smoke — Wire It All Up + README + package.json

**Goal**: Final integration plan — wire all 10 prior plans into `src/index.js`, update `package.json` with the new scripts and dependencies, update the project `README.md` (and the BE-side `src/README.md`) with the new endpoints + env vars + run instructions, and run a manual end-to-end smoke test that proves the whole stack works.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- All prior plans (15–23) must be `done`.

## Micro-Tasks

1. **Update `package.json` — add deps + scripts**
   - Add to `dependencies`: `pg@^8`, `kysely@^0.27`, `nanoid@^5`, `zod@^3`, `openai@^4`, `pdf-parse`, `mammoth`, `cheerio`, `xlsx-stream`, `multer@^1`.
   - Add to `devDependencies`: `vitest@^2`, `supertest@^7`.
   - Add scripts:
     - `db:migrate` → `node src/db/migrate.js`
     - `db:seed` → `node src/db/seed.js`
     - `db:reset` → `node -e "require('./src/db/client').resetSchema()" && npm run db:migrate && npm run db:seed`
     - `db:status` → `node -e "require('./src/db/migrate').status()"`
     - `script:ingest-smoke` → `RUN_SMOKE=1 node src/scripts/ingest-smoke.js`
     - `script:audit-tail` → `node src/scripts/audit-tail.js`
     - `test` → `vitest run`
     - `test:watch` → `vitest`
     - `lint` → `eslint src/`
     - `typecheck` → `tsc --noEmit` (or `ts-check` if pure-JS via JSDoc)
   - Bump `version` to `0.7.0-be-ai-auto-reply.0` (pre-release tag per semver).
   - **Acceptance**: `pnpm install --frozen-lockfile` exits 0; `pnpm run` lists all the new scripts.

2. **Wire `src/index.js` — final integration**
   - At startup, in order:
     1. Load env (`dotenv`).
     2. Create `./data/audit/` and `./data/kb/` directories if missing.
     3. Initialize the DB client (Plan 15).
     4. Run pending migrations (idempotent — Plan 15 step 6).
     5. Initialize pino logger (existing).
     6. Mount the AI routers via `mountAiRoutes(app)` (Plan 21 step 4).
     7. Subscribe `sock.ev.on('messages.upsert', ...)` to `processInboundMessage` (Plan 20 step 4).
     8. Start the KB ingest worker (Plan 18 step 4) — drains the queue serially per file.
     9. Start the HTTP server (existing).
   - Add graceful shutdown: on `SIGTERM`/`SIGINT`, drain the ingest worker, close the DB pool, close the HTTP server.
   - **Acceptance**: `pnpm start` boots cleanly; logs show the ordered steps; a manual `Ctrl+C` shuts down without orphaned connections.

3. **Update `README.md` (project root) — BE cycle section**
   - Add a new top-level section `## BE AI Auto-Reply (cycle: be-ai-auto-reply-2026-07-03)` documenting:
     - **What shipped**: MiniMax-M3 LLM gateway + Postgres-backed settings + KB ingest + hybrid retrieval + WhatsApp trigger + 14 REST endpoints + audit log.
     - **How to run locally**: env vars (`DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER`, `EMBEDDING_MODEL`), then `pnpm install && pnpm db:reset && pnpm start`.
     - **Endpoint table**: the 14 endpoints from Plan 21 with method + path + scope + brief description.
     - **Locked values**: τ_turbo = 0.30, τ_user default = 0.7 (range 0.5–0.95 step 0.05), `AIReplyMode` union, contact-scope hard filter, hardened 4-rule block.
     - **Defense-in-depth layers**: the 7-layer matrix from MVP.md §3.5 with one-line descriptions.
     - **Phase 2 / Phase 3 deferred items**: NLI, cross-encoder, multi-tenant, WebSocket, audit-log export, fine-tuning.
   - **Acceptance**: the new section is present, non-empty, and links to the SSoT docs at `docs/be/MVP.md` and `docs/tech/*`.

4. **Author `src/README.md` (BE-specific module overview)**
   - File-tree walkthrough of `src/ai/`, `src/db/`, `src/controllers/`, `src/test/`.
   - Per-module purpose (one sentence each).
   - How to add a new endpoint (template).
   - How to add a new audit event type (extend the locked vocabulary in Plan 22).
   - **Acceptance**: the file exists, is non-empty, and accurately mirrors the file tree produced by Plans 15–22.

5. **Manual smoke test (recorded in `docs/be/MVP.md` §11)**
   - Run `pnpm db:reset && pnpm db:seed`.
   - Start `pnpm start` against a real Postgres + a `OPENAI_API_KEY` for MiniMax-M3.
   - Trigger a mock `messages.upsert` event (using Baileys's test hook or a small Node script under `src/scripts/mock-inbound.js`).
   - Observe the audit log via `pnpm script:audit-tail`:
     - `auto_reply_sent` row with non-zero `confidence`, `citations`, `retrievalScore`.
     - `state_transition` row(s) if any hold branches fired.
     - `llm_call` rows for each LLM attempt (the retry chain).
   - Verify the outbound message in the `messages` table.
   - **Acceptance**: the smoke test passes within 2 seconds end-to-end; the audit log shows the full retry chain; the outbound message row exists.

6. **Add `.env.example` updates**
   - Document every env var consumed by Plans 15–22:
     - `DATABASE_URL` (Plan 15).
     - `DEFAULT_TENANT_ID` (Plan 21).
     - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER`, `LLM_MAX_RETRIES`, `EMBEDDING_MODEL` (Plan 17).
     - `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` (Plan 17 fallback).
     - `RUN_SMOKE` (gates Plan 18 step 6 + Plan 24 step 5).
     - `AUDIT_DIR` (optional override; default `./data/audit/`).
     - `KB_DIR` (optional override; default `./data/kb/`).
   - Each var has a placeholder value + a one-line comment.
   - **Acceptance**: `.env.example` lists all vars; copying it to `.env` and replacing placeholders allows `pnpm start` to boot.

7. **Author `CHANGELOG.md` entry for the cycle**
   - Top-level entry: `## 0.7.0-be-ai-auto-reply.0 (2026-07-03)` with subsections:
     - **Added**: 14 CRM endpoints, KB ingest, hybrid retrieval, WhatsApp trigger, state machine, audit log, vitest suite (≥30 specs).
     - **Changed**: `package.json` deps + scripts; `README.md` BE cycle section; `.env.example`.
     - **Deprecated**: legacy `/api/ai/ask` (kept for backward compat — Phase 2 may remove).
     - **Fixed**: n/a (new code path).
     - **Security**: contact-scope hard filter, hardened rules block, write-restricted chunks table, redact-before-log audit pipeline.
   - **Acceptance**: the entry is present, dated `2026-07-03`, and the Security section explicitly mentions all 7 defense-in-depth layers.

## Cross-References
- Everything from Plans 15–23 is wired here. Specifically:
  - DB + migrations + seed: `docs/crm/plans/15-db-layer-postgresql.md`.
  - Settings + composer: `docs/crm/plans/16-settings-store-composer-hardened.md`.
  - LLM gateway: `docs/crm/plans/17-llm-gateway.md`.
  - KB ingest: `docs/crm/plans/18-kb-ingestion.md`.
  - Retrieval: `docs/crm/plans/19-retrieval-pipeline.md`.
  - Trigger + state machine: `docs/crm/plans/20-whatsapp-trigger-state-machine.md`.
  - REST endpoints: `docs/crm/plans/21-rest-endpoints.md`.
  - Audit log: `docs/crm/plans/22-audit-log.md`.
  - Test suite: `docs/crm/plans/23-defense-in-depth-tests.md`.
- Acceptance gates: `docs/be/MVP.md` §11.
- Source of truth for cycle scope: `docs/be/MVP.md`.

## Notes
- **Wire everything + smoke.** Plan 24 is the integration capstone. No new behavior is introduced; everything is glued together and verified end-to-end.
- **The MVP.md §11 acceptance gates are run in order at the end of this plan:**
  1. `pnpm install --frozen-lockfile` exit 0 → Plan 24 step 1.
  2. `pnpm typecheck` exit 0 → Plan 24 step 1 (JSDoc-typed JS path) or Plan 24 step 1 (TS path).
  3. `pnpm lint` exit 0 → Plan 24 step 1 (eslint config added if missing).
  4. `pnpm test` exit 0 with ≥30 specs → Plan 23 + Plan 24 step 1.
  5. `pnpm build` exit 0 → Plan 24 step 1 (build script added if missing; for the BE, "build" is a no-op or a bundle step).
  6. `composer-byte-identity.test.js` passes → Plan 23.
  7. `contact-scope.test.js` passes → Plan 23.
  8. `state-machine.test.js` passes (incl. `human → human_pending_flag` returns 400) → Plan 23.
  9. Manual smoke: spin up Postgres + run migrations + start BE + send mock inbound + observe auto-reply → Plan 24 step 5.
  10. All 11 prior-cycle FE locked values UNCHANGED in the FE → out of scope for this plan (the FE is untouched in this cycle per MVP.md §10).
- **No FE changes in this cycle.** The FE keeps its mocks per MVP.md §10. Wiring the FE to the new BE endpoints is a separate cycle.
- **Backward compatibility with the legacy WhatsApp module.** All existing endpoints (`/api/chats`, `/api/chats/:id/messages`, the legacy `/api/ai/ask`, `/api/auth/status`) are untouched. The legacy `0.65` threshold and the legacy `Baileys` AI ask path remain in place. The new CRM endpoints are additive.
- **The smoke test script (`src/scripts/mock-inbound.js`) is committed** so future cycles can re-run the manual smoke without re-authoring it. The script requires a running BE; it does not start one.
- **`processInboundMessage` is non-awaited.** A slow LLM call does NOT block the Baileys socket. The smoke test asserts that the audit row appears within 2 seconds of the mock inbound; if the LLM takes longer, the audit row may appear after 2s but the smoke test waits up to 10s.
- **The CHANGELOG entry's Security section is mandatory.** It enumerates all 7 defense-in-depth layers and ties each to the plan that implements it. This is the auditor's primary input for the Phase 5 audit.