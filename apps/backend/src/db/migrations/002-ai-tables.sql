-- Migration 002 — AI tables (settings, KB, CRM).
-- Source: docs/be/MVP.md §2.2 + docs/crm/plans/15-db-layer-postgresql.md
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS vector;

-- AI settings — single row (id=1) for single-tenant MVP.
CREATE TABLE IF NOT EXISTS ai_settings (
  id                  SERIAL PRIMARY KEY,
  tenant_id           TEXT NOT NULL DEFAULT 'default',
  identity            JSONB NOT NULL,
  tone                TEXT NOT NULL,
  language            TEXT NOT NULL,
  scope               JSONB NOT NULL,
  rules               TEXT[] NOT NULL DEFAULT '{}',
  whatsapp_auto_reply JSONB NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KB: knowledge_files
CREATE TABLE IF NOT EXISTS knowledge_files (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_path    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'ingesting', 'indexed', 'failed')),
  chunks_count    INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  ingested_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KB: knowledge_chunks (pgvector)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          TEXT PRIMARY KEY,
  file_id     TEXT NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text        TEXT NOT NULL,
  text_hash   TEXT NOT NULL,
  embedding   VECTOR(1536) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);

-- CRM: entity_definitions
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
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRM: entity_records
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

-- CRM: entity_relationships
CREATE TABLE IF NOT EXISTS entity_relationships (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  from_entity TEXT NOT NULL REFERENCES entity_definitions(id),
  from_field  TEXT NOT NULL,
  to_entity   TEXT NOT NULL REFERENCES entity_definitions(id),
  to_field    TEXT NOT NULL DEFAULT 'id',
  cardinality TEXT NOT NULL CHECK (cardinality IN ('one', 'many'))
);