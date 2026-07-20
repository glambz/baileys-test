# Plan 15: Database Layer — PostgreSQL + Kysely + Migrations + Seed

**Goal**: Stand up the Postgres persistence layer for the BE AI auto-reply MVP — a `pg` pool singleton with a Kysely type-safe query layer, three migration files (`001-initial.sql`, `002-ai-tables.sql`, `003-indexes.sql`) that materialize every table from `docs/be/MVP.md` §2.2, an idempotent migration runner, and a development seed.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- _(none — this plan is the first executable unit in the BE cycle.)_

## Micro-Tasks

1. **Install Postgres + Node drivers and add npm scripts**
   - Add to `package.json` `dependencies`: `pg@^8`, `kysely@^0.27`, `nanoid@^5`, `zod@^3`. Add to `devDependencies`: `vitest@^2`, `@types/pg` (if TS).
   - Add `npm` scripts: `db:migrate` (runs `src/db/migrate.js`), `db:seed` (runs `src/db/seed.js`), `db:reset` (drops + recreates `data/postgres` schema, then migrate + seed), `db:status` (prints migration table).
   - Document `DATABASE_URL` in `.env.example`. Default local URL: `postgres://baileys:baileys@localhost:5432/baileys`.
   - **Acceptance**: `pnpm install --frozen-lockfile` exits 0; the four scripts appear in `package.json`; `.env.example` includes `DATABASE_URL` with a documented placeholder.

2. **Implement `src/db/client.js` (pg pool + Kysely instance)**
   - Singleton `Pool` from `pg` (max=10, idle_timeout=30s, connection_timeout=5s).
   - `Kysely<DB>` instance wired against the pool. Define `DB` interface in `src/db/types.ts` (or `.js` with JSDoc) with one row type per table from MVP.md §2.2: `Chats`, `AiSettings`, `KnowledgeFiles`, `KnowledgeChunks`, `EntityDefinitions`, `EntityRecords`, `EntityRelationships`, `Messages`.
   - Export `getDb(): Kysely<DB>`, `closeDb(): Promise<void>` (used by graceful shutdown), and `withTransaction(fn)`.
   - All callers MUST go through Kysely — no direct `pool.query()` outside `src/db/client.js` and `src/db/migrate.js`.
   - **Acceptance**: a 10-line smoke script `node -e "require('./src/db/client').getDb()" && console.log('ok')` connects, runs `SELECT 1`, and exits 0 against a real Postgres instance.

3. **Author migration `001-initial.sql` (extends existing `chats`)**
   - Idempotent `ALTER TABLE chats ADD COLUMN IF NOT EXISTS …` for `ai_mode` (TEXT NOT NULL DEFAULT `'ai'` CHECK `IN ('ai','human','human_pending_flag')`) and `ai_pending_flag` (BOOLEAN NOT NULL DEFAULT `false`).
   - The CHECK constraint on `ai_mode` enforces the `AIReplyMode` literal union from `docs/tech/crm-data-model.md` §2 directly at the SQL layer (defense-in-depth layer 6).
   - The file is a no-op on a fresh DB that already has these columns (so `db:reset` is idempotent).
   - **Acceptance**: running `db:migrate` twice in a row produces no errors; querying `information_schema.columns` shows both columns with the expected types and default values.

4. **Author migration `002-ai-tables.sql` (settings, KB, CRM tables)**
   - `ai_settings` (SERIAL PK, `identity JSONB`, `tone TEXT`, `language TEXT`, `scope JSONB`, `rules TEXT[]`, `whatsapp_auto_reply JSONB`, `updated_at TIMESTAMPTZ`) — exact DDL from MVP.md §2.2.
   - `knowledge_files` (TEXT PK nanoid, `tenant_id`, `filename`, `mime_type`, `size_bytes BIGINT`, `storage_path`, `status` with CHECK `('queued','ingesting','indexed','failed')`, `chunks_count`, `last_error`, `ingested_at`, `created_at`).
   - `knowledge_chunks` (TEXT PK, `file_id` FK CASCADE, `chunk_index INT`, `text TEXT`, `text_hash TEXT`, `embedding VECTOR(1536)`, `metadata JSONB`, `created_at`, `UNIQUE (file_id, chunk_index)`).
   - `entity_definitions`, `entity_records`, `entity_relationships` per MVP.md §2.2 (full DDL).
   - All `CREATE TABLE IF NOT EXISTS`; all `CREATE EXTENSION IF NOT EXISTS vector` at the top.
   - **Acceptance**: `db:migrate` against an empty schema creates all six tables; `\d knowledge_chunks` shows the VECTOR(1536) column, the FK to `knowledge_files`, and the `UNIQUE (file_id, chunk_index)` constraint.

5. **Author migration `003-indexes.sql` (GIN / ivfflat / trigram / hash)**
   - `knowledge_chunks_embedding_idx`: `USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` — exact spec from MVP.md §2.2. Wrap in a DO block that recomputes `lists = GREATEST(10, CEIL(SQRT(chunk_count)))` if chunk_count < 10 000 (per MVP.md §8 risk #6).
   - `knowledge_chunks_text_fts_idx`: `USING gin (to_tsvector('simple', text))`.
   - `entity_records_data_gin`: `USING gin (data jsonb_path_ops)`.
   - `entity_records_contact_idx`: partial index `ON entity_records (contact_id) WHERE contact_id IS NOT NULL` — enables the contact-scope hard filter to be index-only.
   - `knowledge_chunks_text_hash_idx`: hash index on `text_hash` for idempotency lookups in Plan 18.
   - BRIN on `messages.created_at` and `chats.last_message_at` (timestamp correlation).
   - **Acceptance**: running migration 003 is idempotent; `\di` lists all five indexes; `EXPLAIN SELECT … FROM entity_records WHERE contact_id = '6285179652486'` reports `Index Scan using entity_records_contact_idx`.

6. **Implement `src/db/migrate.js` (idempotent migration runner)**
   - Reads `src/db/migrations/*.sql` in lexicographic order.
   - Maintains a `schema_migrations` table (`version TEXT PK, applied_at TIMESTAMPTZ`). Skips already-applied versions.
   - Runs each pending migration inside a transaction; on error rolls back and prints the failing file:line.
   - Supports `FORCE_VERSION=<version>` env var to re-run a specific migration (dev only).
   - **Acceptance**: starting from an empty DB, `db:migrate` applies all three files in order and prints `[migrate] applied 001-initial, 002-ai-tables, 003-indexes`; starting from a fully-migrated DB, `db:migrate` prints `[migrate] nothing to apply` and exits 0.

7. **Implement `src/db/seed.js` (dev-only seed mirroring the FE mock fixtures)**
   - Seeds one `ai_settings` row (id=1) with the values from `frontend/src/stores/aiSettingsStore.ts::DEFAULT_AI_SETTINGS`.
   - Seeds two `entity_definitions` rows (`customer`, `invoice`) and a handful of `entity_records` so Plan 19's hybrid retrieval tests have data.
   - Seeds 3 `knowledge_files` rows in `status='indexed'` and 20 `knowledge_chunks` rows with deterministic embeddings (constant vector `Array(1536).fill(0.01)` — the real embedder replaces this in Plan 18).
   - Prints `chunks_count` on each seeded file so Plan 18 can assert idempotency.
   - **Acceptance**: `db:reset && db:seed` produces a DB with 1 settings row, 2 entities, ≥10 records, 3 KB files, ≥20 chunks; re-running `db:seed` is a no-op (uses `ON CONFLICT DO NOTHING`).

## Cross-References
- Source of truth for table DDL: `docs/be/MVP.md` §2.2 (Database tables — new in this run).
- Goals & locked decisions: `docs/be/MVP.md` §1 (Postgres from day one; no SQLite).
- Schema reference: `docs/tech/postgresql-schema.md` (DDL, owned by PM).
- AIReplyMode literal union (encoded in the `chats.ai_mode` CHECK): `docs/tech/crm-data-model.md` §2.
- Feature spec for KB ingest (consumer of `knowledge_files`/`knowledge_chunks`): `docs/be/features/kb-ingestion/spec.md`.
- Feature spec for CRM store (consumer of entity tables): `docs/be/features/crm-store/spec.md`.
- Feature spec for AI settings (consumer of `ai_settings`): `docs/be/features/ai-orchestration/spec.md`.

## Notes
- **Postgres from day one.** No SQLite intermediate. If the user requests SQLite for local dev convenience, raise as a doc-gap with the Orchestrator — do not silently fall back.
- The `chats.ai_mode` CHECK constraint is a **defense-in-depth layer** alongside Plan 20's BE-side state machine. The DB rejects invalid transitions even if the BE code is buggy.
- Kysely row types live in `src/db/types.ts` (or `.js` + JSDoc if the project stays pure-JS). Each row type mirrors one table from MVP.md §2.2 — no shape drift.
- The migration runner is idempotent because all DDL is `IF NOT EXISTS`. `db:reset` drops the schema first, then migrate + seed.
- `nanoid` IDs are TEXT, not UUID. Keep this — the existing WhatsApp module uses the same convention per `docs/tech/chat-data-model.md` §1.
- The contact_id partial index in migration 003 is what makes Plan 19's `WHERE contact_id = ?` lookup index-only at scale. Plan 19's `contact-scope.test.js` asserts `EXPLAIN` shows index usage.
- `vectors` extension must be installed by `CREATE EXTENSION` inside `002-ai-tables.sql`; the migration runner cannot pre-create it (some hosted Postgres providers restrict superuser extension creation).
- Dev seed uses a constant vector for embeddings. This is intentional: Plan 18's embedder is what populates real embeddings for production data. Plan 19's retrieval tests use a separate cosine-equality test fixture, not the seeded data.