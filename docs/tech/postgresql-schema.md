<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md §2.2
DEPENDS_ON:
  - docs/be/MVP.md §2.2
  - docs/be/features/*/spec.md
  - docs/tech/be-data-model.md
-->

# PostgreSQL Schema — DDL Reference

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../be/MVP.md) §2.2.
> If anything in this document conflicts with MVP.md §2.2, MVP.md wins.

Pure reference for the Postgres schema. Behavior lives in the
feature specs under `docs/be/features/**`; this file is only the DDL.

## 0. Required extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector for ANN cosine
-- uuid-ossp is NOT used; the BE uses nanoid for IDs.
```

The `vector` extension is mandatory; the migration runner refuses to
start without it.

## 1. Migration files

### 1.1 `src/db/migrations/001-initial.sql` (extends existing `chats`)

```sql
-- Extends the existing chats table (declared in an earlier cycle).
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS ai_mode         TEXT NOT NULL DEFAULT 'ai'
    CHECK (ai_mode IN ('ai','human','human_pending_flag')),
  ADD COLUMN IF NOT EXISTS ai_pending_flag BOOLEAN NOT NULL DEFAULT false;
```

The migration is **idempotent** (`IF NOT EXISTS`) so re-running is safe.

### 1.2 `src/db/migrations/002-ai-tables.sql`

```sql
-- Per-tenant AI Settings. Single row for MVP (id = 1); tenant_id
-- is reserved for Phase 3 multi-tenant.
CREATE TABLE IF NOT EXISTS ai_settings (
  id                SERIAL PRIMARY KEY,
  identity          JSONB NOT NULL,
  tone              TEXT NOT NULL,
  language          TEXT NOT NULL,
  scope             JSONB NOT NULL,
  rules             TEXT[] NOT NULL DEFAULT '{}',
  whatsapp_auto_reply JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge base: file metadata + chunk text + embeddings.
CREATE TABLE IF NOT EXISTS knowledge_files (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_path    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','ingesting','indexed','failed')),
  chunks_count    INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  ingested_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              TEXT PRIMARY KEY,
  file_id         TEXT NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  text            TEXT NOT NULL,
  text_hash       TEXT NOT NULL,
  embedding       VECTOR(1536) NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);

-- CRM: hybrid EAV + JSONB.
CREATE TABLE IF NOT EXISTS entity_definitions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  schema_json JSONB NOT NULL,
  version     INT NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, version) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE IF NOT EXISTS entity_records (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  entity_id   TEXT NOT NULL REFERENCES entity_definitions(id),
  contact_id  TEXT,
  data        JSONB NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  from_entity TEXT NOT NULL REFERENCES entity_definitions(id),
  from_field  TEXT NOT NULL,
  to_entity   TEXT NOT NULL REFERENCES entity_definitions(id),
  to_field    TEXT NOT NULL DEFAULT 'id',
  cardinality TEXT NOT NULL CHECK (cardinality IN ('one','many'))
);
```

### 1.3 `src/db/migrations/003-indexes.sql`

```sql
-- pgvector ANN cosine index. Adaptive `lists` (see §3 below).
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Postgres FTS over chunk text (BM25 via ts_rank_cd).
CREATE INDEX IF NOT EXISTS knowledge_chunks_text_fts_idx ON knowledge_chunks
  USING gin (to_tsvector('simple', text));

-- GIN on entity_records.data (jsonb_path_ops — better for key=value lookups
-- than the default GIN).
CREATE INDEX IF NOT EXISTS entity_records_data_gin ON entity_records
  USING gin (data jsonb_path_ops);

-- Partial btree on contact_id (only covers rows with contact_id set).
CREATE INDEX IF NOT EXISTS entity_records_contact_idx ON entity_records (contact_id)
  WHERE contact_id IS NOT NULL;
```

## 2. ER diagram (logical)

```
            ┌────────────────────┐
            │  ai_settings (1)   │  (one row per tenant, MVP)
            └────────────────────┘

   ┌──────────────────┐        ┌──────────────────────┐
   │     chats        │        │ entity_definitions   │
   │  +ai_mode        │        │  (tenant_id, name,   │
   │  +ai_pending_flag│        │   version) UNIQUE    │
   └────────┬─────────┘        └─────┬────────────────┘
            │                        │
            │  contact_id FK         │  1 entity → N records
            │ (loose ref)            │
            ▼                        ▼
   ┌──────────────────┐        ┌──────────────────────┐
   │ entity_records   │        │ entity_relationships │
   │  +contact_id     │◀──────▶│  (from_entity,       │
   │  +data (JSONB)   │        │   to_entity)         │
   └──────────────────┘        └──────────────────────┘

   ┌──────────────────┐        ┌──────────────────────┐
   │ knowledge_files  │──1:N──▶│ knowledge_chunks     │
   │  +status         │        │  +text, +embedding   │
   │  +chunks_count   │        │   (VECTOR(1536))     │
   └──────────────────┘        └──────────────────────┘
```

## 3. Adaptive `lists` for `ivfflat`

The `lists = 100` literal in `003-indexes.sql` is a placeholder. The
migration runner computes the actual value at apply time:

```js
// src/db/migrations/runner.js (informational)
const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM knowledge_chunks');
const lists = Math.max(10, Math.round(Math.sqrt(rows[0].n)));
await client.query(
  `CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
     USING ivfflat (embedding vector_cosine_ops) WITH (lists = $1)`,
  [lists]
);
```

This addresses MVP.md §8 risk: pgvector on small datasets
(`< 1k chunks`) suffers quality if `lists` is too high.

## 4. GRANTs (KB write isolation, MVP.md §3.2 rule 4)

The BE runs two Postgres roles:

| Role | Used by | Privileges on `knowledge_chunks` |
|---|---|---|
| `baileys_app` | Express app (HTTP layer, ingest, retrieval, store reads) | `SELECT, INSERT, UPDATE, DELETE` |
| `baileys_ai` | AI gateway service (parse, embed) | `SELECT` only — no writes |

The grant is emitted at the end of `002-ai-tables.sql`:

```sql
-- The AI gateway role has SELECT-only on knowledge_chunks to enforce
-- MVP.md §3.2 rule 4 (AI cannot write to KB).
REVOKE INSERT, UPDATE, DELETE ON knowledge_chunks FROM baileys_ai;
```

If the BE is deployed with a single role, this statement is a no-op
(the role is its own grant source); the runtime test
`kb-write-isolation.test.js` asserts the property either way.

## 5. Idempotency / migration semantics

- All `CREATE` statements use `IF NOT EXISTS`.
- All `ALTER TABLE` statements use `IF NOT EXISTS` on the column.
- The migration runner records applied versions in a
  `schema_migrations` table (created lazily on first run).
- Migrations are applied in lexical filename order
  (`001-initial.sql`, `002-ai-tables.sql`, `003-indexes.sql`).

## 6. Out of scope (this run)

- Row-Level Security (RLS) for multi-tenant isolation — Phase 3.
- `pg_partman` time-series partitioning — not needed this run.
- Read replicas — single Postgres instance for MVP.

## 7. Cross-references

- Goals: [`docs/be/MVP.md`](../../be/MVP.md) §2.2.
- BE data model (TS interfaces): [`be-data-model.md`](be-data-model.md).
- KB ingestion pipeline: [`../be/features/kb-ingestion/spec.md`](../be/features/kb-ingestion/spec.md).
- CRM store: [`../be/features/crm-store/spec.md`](../be/features/crm-store/spec.md).
- AI orchestration: [`../be/features/ai-orchestration/spec.md`](../be/features/ai-orchestration/spec.md).
- Module overview: [`../be/general/MODULE_OVERVIEW.md`](../be/general/MODULE_OVERVIEW.md).