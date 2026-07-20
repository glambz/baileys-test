<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md §2.2
  - docs/be/features/*/spec.md
  - docs/tech/crm-data-model.md (FE TS interfaces; this is the BE mirror)
  - docs/tech/ai-settings-data-model.md (AiSettings shape, hardened rules)
  - docs/tech/ai-reply-state-machine.md (state machine canonical)
  - frontend/src/types/aiSettings.ts (locked literal unions)
  - frontend/src/types/crm.ts (locked literal unions)
-->

# BE Data Model — TS interfaces + SQL schema mirror

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../be/MVP.md) §2.2.
> If anything in this document conflicts with MVP.md, MVP.md wins.

The BE's TS interface declarations (JSDoc-typed JS — the BE runtime
is plain Node.js, not TypeScript, but the type comments are the
SSoT) and the SQL schema mirror. The FE has parallel declarations
in [`crm-data-model.md`](crm-data-model.md) and
[`ai-settings-data-model.md`](ai-settings-data-model.md); the BE
mirror is the **authoritative schema** for the runtime — the FE
documents are parity references.

## 1. AI-side TS interfaces

```ts
/**
 * Source of truth: docs/tech/ai-settings-data-model.md §1.
 * Byte-identical literal unions to frontend/src/types/aiSettings.ts.
 */
export type AiTone =
  | 'formal'
  | 'casual'
  | 'friendly'
  | 'concise'
  | 'enthusiastic';

export type AiLanguage = 'id' | 'en' | 'id-mod';

export interface AiIdentity {
  name: string;       // required, <= 80 chars
  role: string;       // required, <= 120 chars
  description: string; // optional, <= 500 chars
}

export interface AiScope {
  topics: string[];        // newline-split at save time
  excludedTopics: string[]; // newline-split at save time
}

export interface AiWhatsappAutoReply {
  enabled: boolean;
  /** In [0.50, 0.95], step 0.05. Default 0.7. */
  confidenceThreshold: number;
}

/**
 * Per-tenant AI Settings row. Persisted to Postgres `ai_settings`.
 */
export interface AiSettings {
  identity: AiIdentity;
  tone: AiTone;
  language: AiLanguage;
  scope: AiScope;
  rules: string[];
  whatsappAutoReply: AiWhatsappAutoReply;
  updatedAt: string; // ISO 8601
}

/**
 * Source of truth: docs/tech/ai-reply-state-machine.md §1.
 * Byte-identical to frontend/src/types/crm.ts:7.
 */
export type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';

export interface ConfidenceScore {
  /** LLM self-reported confidence, 0.0–1.0. */
  llm: number;
  /** Re-ranked retrieval score after re-ranking, 0.0–1.0. */
  retrieval: number;
  /** Effective score passed to the gate: min(llm, retrieval). */
  effective: number;
}

/**
 * Source of truth: docs/be/features/kb-ingestion/spec.md §10.
 * Mirrors frontend/src/types/crm.ts::KnowledgeFile.
 *
 * NOTE: status enum differs in wire shape from the BE column
 * (`knowledge_files.status`). See mapping in kb-ingestion spec §10.
 */
export interface KnowledgeFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'pending' | 'chunked' | 'embedded' | 'failed';
  chunksCount: number;
  ingestedAt: number | null; // Unix seconds
  errorMessage: string | null;
  uploadedAt: number; // Unix seconds
}

export interface KnowledgeChunk {
  id: string;
  fileId: string;
  index: number;
  text: string;
  /** Opaque reference to the deterministic vector in storage. */
  embeddingRef: string;
  metadata: Record<string, unknown>;
}

/**
 * Source of truth: docs/be/features/crm-store/spec.md §1.
 * Mirrors frontend/src/types/crm.ts::EntityDefinition.
 */
export interface EntityDefinition {
  id: string;
  name: string;
  label: string;
  icon: string | null;
  description: string | null;
  schemaJson: EntitySchemaJson;
  version: number;
  createdAt: number; // Unix seconds
  updatedAt: number;
  archivedAt: number | null;
  deletedAt: number | null;
}

export interface EntitySchemaJson {
  fields: EntityField[];
  relations: EntityRelationship[];
}

export type EntityFieldType =
  | 'text' | 'longtext' | 'number' | 'boolean'
  | 'date' | 'enum' | 'relation' | 'file'
  | 'phone' | 'email';

export interface EntityField {
  name: string;
  label: string;
  type: EntityFieldType;
  required: boolean;
  defaultValue?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enumValues?: string[];
  };
  indexable: boolean;
  targetEntity?: string; // for relation
  targetField?: string;  // for relation
  cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface EntityRelationship {
  id: string;
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface EntityRecord {
  id: string;
  entityId: string;
  entityName: string;
  contactId: string | null;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

/**
 * Source of truth: docs/be/features/ai-orchestration/spec.md §3.
 * Mirrors frontend/src/types/crm.ts::CrmAskAiResponse.
 */
export type CrmAskAiResponse = CrmAiAnswer | CrmAiFallback;

export interface CrmAiAnswer {
  kind: 'answered';
  answer: string;
  confidence: number;
  evidence: CrmAiEvidence[];
  generatedAt: number; // Unix seconds
  question: string;
}

export interface CrmAiFallback {
  kind: 'fallback';
  message: string;
}

export interface CrmAiEvidence {
  kind: 'kb' | 'record';
  entryId?: string;
  recordId?: string;
  excerpt: string;
  source: string;
  contactId?: string | null;
  confidence: number;
}

export interface CrmAskAiRequest {
  question: string;
  topK?: number; // default 5, range [1, 10]
}

export interface CrmReplyPreview {
  answer: string;
  confidence: number;
  evidence: CrmAiEvidence[];
  would_send: boolean;
  reason: string | null;
}

/**
 * Audit log row written to ./data/audit/<date>.ndjson.
 */
export interface AiAuditEvent {
  ts: string; // ISO 8601
  event:
    | 'auto_reply_sent'
    | 'auto_reply_low_confidence'
    | 'auto_reply_turbo_cutoff'
    | 'auto_reply_scope_violation'
    | 'auto_reply_parse_failed'
    | 'auto_reply_citation_grounding_failed'
    | 'auto_reply_numerical_inconsistency'
    | 'auto_reply_skipped_disabled'
    | 'auto_reply_skipped_mode'
    | 'auto_reply_send_failed'
    | 'auto_reply_error'
    | 'state_machine_transition'
    | 'state_machine_forbidden'
    | 'ai_ask_parse_retry';
  chatId: string | null;
  tenantId: string;
  contactId: string | null;
  confidence: number | null;
  latencyMs: number | null;
  topChunks: string[];
  errorCode: string | null;
  step: number | null;
}

/**
 * Discriminated error type returned by the LLM gateway.
 */
export interface AiError {
  code:
    | 'HttpError'
    | 'ParseFailed'
    | 'ValidationError'
    | 'Timeout'
    | 'ForbiddenTransition'
    | 'ContactScopeRequired'
    | 'ChatNotFound'
    | 'EntityNotFound'
    | 'RecordNotFound'
    | 'FileNotFound'
    | 'AiUnavailable';
  message: string;
  details?: unknown;
}
```

## 2. SQL schema mirror

The full DDL lives in [`postgresql-schema.md`](postgresql-schema.md).
This section gives the CREATE TABLE statements with rationale
comments, sourced from `docs/be/MVP.md` §2.2.

### 2.1 `ai_settings`

```sql
CREATE TABLE ai_settings (
  id                SERIAL PRIMARY KEY,
  identity          JSONB NOT NULL,
  tone              TEXT NOT NULL,
  language          TEXT NOT NULL,            -- AiLanguage enum
  scope             JSONB NOT NULL,
  rules             TEXT[] NOT NULL DEFAULT '{}',
  whatsapp_auto_reply JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Rationale: a single row per tenant (MVP); `tenant_id` is reserved
for Phase 3 multi-tenant. `whatsapp_auto_reply.confidenceThreshold`
defaults to `0.7` per `frontend/src/lib/config-crm.ts:16`.

### 2.2 `chats` extension

```sql
ALTER TABLE chats
  ADD COLUMN ai_mode         TEXT NOT NULL DEFAULT 'ai'
    CHECK (ai_mode IN ('ai','human','human_pending_flag')),
  ADD COLUMN ai_pending_flag BOOLEAN NOT NULL DEFAULT false;
```

Rationale: `ai_pending_flag` is a redundant boolean mirror of
`ai_mode = 'human_pending_flag'` for backward compatibility with
the legacy FE mock which queries the boolean directly.

### 2.3 `knowledge_files`

```sql
CREATE TABLE knowledge_files (
  id              TEXT PRIMARY KEY,                       -- nanoid
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
```

### 2.4 `knowledge_chunks`

```sql
CREATE TABLE knowledge_chunks (
  id              TEXT PRIMARY KEY,
  file_id         TEXT NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  text            TEXT NOT NULL,
  text_hash       TEXT NOT NULL,             -- sha256 for idempotency
  embedding       VECTOR(1536) NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);
```

### 2.5 `entity_definitions`, `entity_records`, `entity_relationships`

See [`postgresql-schema.md`](postgresql-schema.md) for the DDL. The
ER diagram is in that file's §2.

## 3. Locked values (byte-stable across FE and BE)

These values are byte-stable between the FE codebase and the BE
mirror. Drift in any row is a blocker. The PM tracks these via the
`composer-byte-identity.test.js` vitest spec and the
`state-machine.test.js` vitest spec.

| Value | FE declaration (file:line) | BE mirror (file) | Doc anchor |
|---|---|---|---|
| `AI_CONFIDENCE_THRESHOLD = 0.65` | `frontend/src/lib/config.ts:13` | n/a (FE-only legacy WA module) | `docs/frontend/api/api-spec.md` §2.4 |
| `CRM_AI_CONFIDENCE_THRESHOLD = 0.7` | `frontend/src/lib/config-crm.ts:16` | `src/ai/settings/defaults.js` | `docs/tech/crm-data-model.md` §3 |
| `AiLanguage = 'id' \| 'en' \| 'id-mod'` | `frontend/src/types/aiSettings.ts:32` | `src/ai/settings/schema.js` (zod enum) | `docs/tech/ai-settings-data-model.md` §1 |
| `AIReplyMode = 'ai' \| 'human' \| 'human_pending_flag'` | `frontend/src/types/crm.ts:7` | SQL CHECK + `src/ai/whatsapp/handoff.js` | `docs/tech/ai-reply-state-machine.md` §1 |
| `getHardenedRulesBlock()` 4-rule block | `frontend/src/lib/ai/systemPrompt.ts:257-262` | `src/ai/settings/hardened-rules.js` | `docs/tech/ai-settings-data-model.md` §3.2 |
| `BAILEYS_AI_SYSTEM_PROMPT_ID` / `_EN` | `frontend/src/lib/ai/systemPrompt.ts:43-167` | `src/ai/settings/composer.js` (byte-equivalent output) | `docs/crm/features/ai-chat/systemPrompt.md` §"Indonesian rules" / §"English rules" |
| `DEFAULT_AI_SETTINGS.identity.name = "Baileys Studio AI Assistant"` | `frontend/src/types/aiSettings.ts:74` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 1 |
| `DEFAULT_AI_SETTINGS.identity.role = "Agen CS WhatsApp"` | `frontend/src/types/aiSettings.ts:75` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 2 |
| `DEFAULT_AI_SETTINGS.tone = 'friendly'` | `frontend/src/types/aiSettings.ts:78` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 4 |
| `DEFAULT_AI_SETTINGS.language = 'id'` | `frontend/src/types/aiSettings.ts:79` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 5 |
| `DEFAULT_AI_SETTINGS.whatsappAutoReply.enabled = true` | `frontend/src/types/aiSettings.ts:86` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 8 |
| `DEFAULT_AI_SETTINGS.whatsappAutoReply.confidenceThreshold = 0.7` | `frontend/src/types/aiSettings.ts:87` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 row 9 |
| `τ_retrieval = 0.30` | n/a (BE-only; legacy FE used 0.65) | `src/ai/whatsapp/trigger.js::TAU_RETRIEVAL` | `docs/be/MVP.md` §3.3 |
| Indonesian fallback phrase | `frontend/src/i18n/id.json:74` | embedded in `BAILEYS_AI_SYSTEM_PROMPT_ID` | `docs/crm/features/ai-chat/systemPrompt.md` §"Locked values" row 4 |
| Per-surface default for `whatsappAutoReply.enabled` | FE `= true` (`frontend/src/types/aiSettings.ts:86`); BE `= false` (`src/ai/settings/defaults.js:21`) | FE `= true`; BE `= false` — intentionally divergent | `docs/be/MVP.md` §8; `docs/crm/features/ai-settings/spec.md` §4.4 |

**Per-surface default note (intentional divergence, per `docs/be/MVP.md` §8):**
The FE `DEFAULT_AI_SETTINGS.whatsappAutoReply.enabled = true` is a **UI preference default** — the operator opens `/ai-settings` and the WhatsApp auto-reply toggle is pre-rendered as on, matching the form's §4.6 row "Default = `true`" so the page never shows a misleading "off" state on first paint. The BE `DEFAULT_AI_SETTINGS.whatsappAutoReply.enabled = false` is a **runtime safety default** — when the BE seeds the `ai_settings` row on first boot (or when no operator has yet saved a row), the `messages.upsert` handler must short-circuit on the `enabled === false` early-out (`docs/be/MVP.md` §2.4 step 2: "Skip if `whatsappAutoReply.enabled = false`"), so an unconfigured tenant cannot silently auto-reply to inbound WhatsApp messages. The two surfaces are reconciled at the first operator save: once the operator toggles the switch on the FE and clicks Save, the PATCH flows through to `src/ai/settings/store.js::updateSettings`, the BE row's `enabled` flips to `true`, and the runtime gate opens. This divergence is a deliberate MVP risk mitigation per `docs/be/MVP.md` §8 ("WhatsApp ban if auto-reply is too eager → `enabled: false` default; operators enable manually after testing via `reply-preview`"). It is **not** a byte-stable mirror and is the **only** intentional difference between the FE and BE `DEFAULT_AI_SETTINGS` shapes. See also `docs/crm/features/ai-settings/spec.md` §4.4 (end-of-section note) and `docs/crm/plans/16-settings-store-composer-hardened.md` Notes (last bullet).

## 4. Cross-references

- Goals: [`docs/be/MVP.md`](../../be/MVP.md) §2.2.
- Postgres DDL: [`postgresql-schema.md`](postgresql-schema.md).
- AI orchestration: [`../be/features/ai-orchestration/spec.md`](../be/features/ai-orchestration/spec.md).
- WhatsApp trigger: [`../be/features/ai-whatsapp-trigger/spec.md`](../be/features/ai-whatsapp-trigger/spec.md).
- State machine: [`../be/features/ai-state-machine/spec.md`](../be/features/ai-state-machine/spec.md).
- KB ingestion: [`../be/features/kb-ingestion/spec.md`](../be/features/kb-ingestion/spec.md).
- CRM store: [`../be/features/crm-store/spec.md`](../be/features/crm-store/spec.md).
- FE mirror: [`crm-data-model.md`](crm-data-model.md), [`ai-settings-data-model.md`](ai-settings-data-model.md), [`ai-reply-state-machine.md`](ai-reply-state-machine.md).