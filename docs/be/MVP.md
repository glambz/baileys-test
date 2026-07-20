# BE AI Auto-Reply — MVP Goals

> Single source of truth for what we're building in run
> **`be-ai-auto-reply-2026-07-03`**. Any future drift must update this file
> first, then propagate to the SSoT docs under `docs/be/**` and
> `docs/tech/**`. Do NOT scatter scope across run-state files.
>
> U-approval timestamp: 2026-07-03 00:38 +07:00.

## 0. TL;DR

Wire the **Baileys-side AI auto-reply engine** and a **team `/api/crm/ai/ask` endpoint** into the existing Express backend at `src/`. Use **MiniMax-M3** as the LLM provider (OpenAI-compatible mode by default; Anthropic-compatible available via `LLM_PROVIDER` env var). Use **PostgreSQL** from day one — no SQLite intermediate. Use **MiniMax embeddings** (full embedding pipeline in this run, no half work).

## 1. Locked choices (U-approved)

| # | Decision | Value |
|---|---|---|
| 1 | LLM provider | **`MiniMax-M3`** (MiniMax) — OpenAI-compatible endpoint; Anthropic-compatible available via `LLM_PROVIDER=openai-compatible\|anthropic-compatible` |
| 2 | Database | **PostgreSQL** (no SQLite — Postgres from day one) |
| 3 | Embeddings | **Yes, full pipeline** in this run; provider = MiniMax embeddings endpoint |
| 4 | Scope | **Full MVP** — no half work |
| 5 | Backend language/runtime | Node.js 18+, Express (existing stack) |
| 6 | Frontend coupling | None — the existing `frontend/src/lib/ai/systemPrompt.ts` composer is the canonical source of the LLM system prompt; the BE reuses the SAME string verbatim over the wire (no FE rewrite this run) |

## 2. Scope (in this MVP run)

### 2.1 Backend modules to ship

| Module | Purpose |
|---|---|
| `src/db/` | PostgreSQL client (pg + node-postgres or `postgres` driver), migration runner, schema migrations |
| `src/db/migrations/001-initial.sql` | Existing schema baseline |
| `src/db/migrations/002-ai-tables.sql` | `chats.ai_mode`, `chats.ai_pending_flag`, `ai_settings`, `entity_definitions`, `entity_records`, `entity_relationships`, `knowledge_files`, `knowledge_chunks` |
| `src/db/migrations/003-indexes.sql` | GIN/trigram on `entity_records.data`, hash index on `knowledge_chunks.embedding`, BRIN on timestamps |
| `src/ai/settings/store.js` | load/save per-tenant `ai_settings` row (Postgres-backed, single-tenant for this run) |
| `src/ai/settings/composer.js` | **mirror** of `frontend/src/lib/ai/systemPrompt.ts` — composes BASE rules (byte-stable Indonesian + English) + per-tenant fragment (identity/tone/scope/rules) + HARDENED block (4 locked Indonesian rules). The BE's composer must produce a byte-equivalent string to the FE's `buildSystemPrompt({ settings, tenantName, language })`. |
| `src/ai/settings/hardened-rules.js` | Byte-stable Indonesian 4-rule block, copied verbatim from `frontend/src/lib/ai/systemPrompt.ts::getHardenedRulesBlock`. |
| `src/ai/settings/defaults.js` | Same defaults as `useAiSettingsStore.DEFAULT_AI_SETTINGS` in the FE. |
| `src/ai/settings/schema.js` | zod schema mirroring `frontend/src/types/aiSettings.ts`. |
| `src/ai/llm/openai-compat.js` | OpenAI-compatible client pointed at MiniMax-M3. Structured outputs (`response_format: json_schema`). 2-attempt retry with exponential backoff on 429/5xx. |
| `src/ai/llm/prompt.js` | Builds the user message: CONTEXT block + chat history + the question. |
| `src/ai/llm/parse.js` | zod-validates the structured response; reject-and-retry up to 3 times on parse failure. |
| `src/ai/llm/embed.js` | MiniMax embeddings client (OpenAI-compatible endpoint). Caches embeddings by SHA-256 of the text content. |
| `src/ai/retrieval/hybrid.js` | BM25 + ANN union; takes `{query, scope: 'whatsapp'\|'team', chatId?, contactPhone?}`. Returns scored chunks. |
| `src/ai/retrieval/bm25.js` | Postgres FTS (tsvector) over `knowledge_chunks.text`. |
| `src/ai/retrieval/ann.js` | pgvector `<=>` cosine over `knowledge_chunks.embedding`. |
| `src/ai/retrieval/reranker.js` | MiniMax embeddings-based re-ranking (simple cosine between query and chunk embeddings) — Phase 2 can swap to a cross-encoder. |
| `src/ai/retrieval/chunker.js` | Long-text chunking with overlap (~512 tokens, 50-token overlap); deterministic per-file hash for idempotency. |
| `src/ai/retrieval/ocr.js` | PDF via `pdf-parse`; DOCX via `mammoth`; HTML via `cheerio`; XLSX via `xlsx-stream`. |
| `src/ai/store/entities.js` | CRUD for `entity_definitions`, `entity_records`, `entity_relationships`. Schema-versioned. Zod-validated (mirrors FE's `zodFromSchema.ts`). |
| `src/ai/store/chunks.js` | Read + search for `knowledge_files`, `knowledge_chunks`. **Write is reachable ONLY from ingest.js** — see §3.2 below. |
| `src/ai/store/ingest.js` | File upload → store binary at `./data/kb/...` → OCR → chunk → embed → insert into Postgres. Idempotent on `(tenant_id, source_path, chunk_index)`. |
| `src/ai/whatsapp/trigger.js` | Main entry point: `processInboundMessage(inboundMsg)`. Non-awaited by Baileys. Orchestrates the full flow. |
| `src/ai/whatsapp/handoff.js` | AIReplyMode state machine. Allowed transitions enforced + DB constraint. |
| `src/ai/whatsapp/send.js` | `sock.sendMessage(...)` wrapper with retries + audit log. |
| `src/ai/routes/ai.js` | Express router: `POST /api/crm/ai/ask`, `POST /api/crm/ai/reply-preview`, `POST /api/crm/ai/toggle-mode`. |
| `src/ai/routes/crm.js` | CRM persistence endpoints (entities + records). |
| `src/ai/routes/knowledge.js` | KB endpoints (upload, list, delete). |
| `src/ai/audit/log.js` | Audit logger — pino structured logs to `./data/audit/<date>.ndjson`. |
| `src/controllers/ai/*.js` | Per-route handlers (ask, replyPreview, toggleMode). |
| `src/test/*.test.js` | vitest suite (~30+ specs). |

### 2.2 Database tables (new in this run)

```sql
-- AI settings (single-tenant for now; tenant_id column reserved)
CREATE TABLE ai_settings (
  id                SERIAL PRIMARY KEY,
  identity          JSONB NOT NULL,           -- { name, role, description }
  tone              TEXT NOT NULL,            -- 'formal'|'casual'|'friendly'|'concise'|'enthusiastic'
  language          TEXT NOT NULL,            -- 'id'|'en'|'id-mod'
  scope             JSONB NOT NULL,           -- { topics: text[], excludedTopics: text[] }
  rules             TEXT[] NOT NULL DEFAULT '{}',
  whatsapp_auto_reply JSONB NOT NULL,         -- { enabled: bool, confidenceThreshold: real }
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend existing chats table
ALTER TABLE chats
  ADD COLUMN ai_mode         TEXT NOT NULL DEFAULT 'ai'
    CHECK (ai_mode IN ('ai','human','human_pending_flag')),
  ADD COLUMN ai_pending_flag BOOLEAN NOT NULL DEFAULT false;

-- KB
CREATE TABLE knowledge_files (
  id              TEXT PRIMARY KEY,                       -- nanoid
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  storage_path    TEXT NOT NULL,                           -- ./data/kb/...
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','ingesting','indexed','failed')),
  chunks_count    INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  ingested_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunks (
  id              TEXT PRIMARY KEY,                       -- nanoid
  file_id         TEXT NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  text            TEXT NOT NULL,
  text_hash       TEXT NOT NULL,                           -- sha256 for idempotency
  embedding       VECTOR(1536) NOT NULL,                  -- MiniMax dims (configurable)
  metadata        JSONB NOT NULL DEFAULT '{}',             -- { section, page, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX knowledge_chunks_text_fts_idx ON knowledge_chunks
  USING gin (to_tsvector('simple', text));

-- CRM
CREATE TABLE entity_definitions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  schema_json JSONB NOT NULL,                              -- full JSON-Schema
  version     INT NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, version) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE entity_records (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  entity_id   TEXT NOT NULL REFERENCES entity_definitions(id),
  contact_id  TEXT,                                        -- phone-normalized; nullable for non-contact entities
  data        JSONB NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entity_records_data_gin ON entity_records USING gin (data jsonb_path_ops);
CREATE INDEX entity_records_contact_idx ON entity_records (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE TABLE entity_relationships (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  from_entity TEXT NOT NULL REFERENCES entity_definitions(id),
  from_field  TEXT NOT NULL,
  to_entity   TEXT NOT NULL REFERENCES entity_definitions(id),
  to_field    TEXT NOT NULL DEFAULT 'id',
  cardinality TEXT NOT NULL CHECK (cardinality IN ('one','many'))
);
```

### 2.3 REST endpoints

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/api/crm/ai/ask` | team | Mirrors FE `CrmAskAiResponse` schema. Composes prompt via `composer.js`. Reads KB + ALL `entity_records` (no contact filter). |
| POST | `/api/crm/ai/reply-preview` | team | What would the WA-side reply say for `(chatId, body)`? Does NOT send. Operator previews before flipping the chat to AI mode. |
| POST | `/api/crm/ai/toggle-mode` | team | `{chatId, mode: 'ai'\|'human'}` → persists `chats.ai_mode`. Rejects `'human_pending_flag'` (only the BE sets that). Idempotent. |
| GET  | `/api/crm/entities` | team | List entity definitions |
| POST | `/api/crm/entities` | team | Create entity |
| PATCH | `/api/crm/entities/:id` | team | Rename / add field (creates new version) |
| DELETE | `/api/crm/entities/:id` | team | Soft-delete |
| GET  | `/api/crm/entities/:id/records` | team | List records (paginated, filtered, sorted) |
| POST | `/api/crm/entities/:id/records` | team | Create record (Zod-validated against `entity.schema_json`) |
| PATCH | `/api/crm/records/:id` | team | Update |
| DELETE | `/api/crm/records/:id` | team | Delete |
| GET  | `/api/crm/knowledge/files` | team | List KB files |
| POST | `/api/crm/knowledge/upload` | team | Multipart upload → runs ingest pipeline async |
| GET  | `/api/crm/knowledge/files/:id` | team | Metadata + chunk count + last-reindex timestamp |
| DELETE | `/api/crm/knowledge/files/:id` | team | Remove file + chunks |

### 2.4 WhatsApp-side trigger

Subscribed to `@whiskeysockets/baileys`'s `messages.upsert` event. On inbound:

1. Load chat state. Skip if `aiMode ∈ {human, human_pending_flag}`.
2. Load settings. Skip if `whatsappAutoReply.enabled = false`.
3. Compose system prompt via `composer.js` (BASE + tenant fragment + HARDENED).
4. Run retrieval (`hybrid.js`) scoped to the chat's contact.
5. **Turbo cutoff**: if `retrieval.score < τ_turbo (0.30)`, skip LLM, set `aiMode = 'human_pending_flag'`, return.
6. Call LLM with structured outputs.
7. Parse + reject-and-retry (≤3) on validation failure.
8. Confidence gate: `confidence < settings.whatsappAutoReply.confidenceThreshold` → flag for human.
9. Citation grounding check (cosine ≥ 0.85 per citation).
10. Numerical consistency check (no foreign numbers in answer).
11. Contact-scope post-validation (defense-in-depth).
12. Send via `sock.sendMessage`. Persist outbound `messages` row. Update `chats.last_message_preview`, `last_message_at`, reset `unread_count`.
13. Audit log row.

## 3. Locked rules (carry from FE cycles — MUST be byte-identical)

### 3.1 System prompt composer invariants

The BE's `src/ai/settings/composer.js` must produce a string byte-equivalent to what `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt({ settings, tenantName, language })` produces for the same input. The FE has 17+24+6 = **47 vitest specs** asserting this — the BE will mirror them in its own vitest suite.

### 3.2 Hardened rules (4 rules, byte-stable Indonesian, never user-editable)

The four hardened rules appear in `src/ai/settings/hardened-rules.js` and are appended to the composed system prompt UNCONDITIONALLY (regardless of `settings.rules`). They are:

1. **WhatsApp-scope contact-id hard filter** — `record.contact_id === chat.contact_id`. No cross-contact leak.
2. **WhatsApp-scope data sources = chat's contact records + KB only**. NO access to other contacts' CRM.
3. **Dashboard `/ai` has full data access** (KB + all tenant's CRM records). Team scope.
4. **AI can write ONLY to CRM**, never to the KB. No LLM call path exposes chunk writes — only `ingest.js` (operator-driven upload) writes.

Rule #4 is enforced AT TWO LAYERS:
- The LLM's structured output schema (in `parse.js`) does NOT include any `addKbEntry` or `updateKbEntry` action — only `createRecord` / `updateRecord` (CRM only).
- The SQL schema has `chunks` writes reachable only from `ingest.js`. No router endpoint accepts chunk writes.

### 3.3 Confidence thresholds (user-tunable per tenant)

- `τ_retrieval = 0.30` (turbo cutoff — locked; below this we skip the LLM)
- `τ_user = settings.whatsappAutoReply.confidenceThreshold` (range `[0.5, 0.95]`, step `0.05`, default `0.7`)

### 3.4 AIReplyMode state machine

Persisted on `chats.ai_mode` (TEXT CHECK constraint). Allowed transitions:

| From → To | Trigger | Actor |
|---|---|---|
| `ai → human_pending_flag` | confidence < τ_user / retrieval < τ_turbo / parse invalid / scope violation | BE (system) |
| `ai → human` | operator toggle | Operator |
| `human_pending_flag → ai` | operator toggle | Operator |
| `human_pending_flag → human` | operator toggle | Operator |
| `human → *` | forbidden (only operator can re-enable; never auto-flag) | (terminal until operator toggle) |

FE has a vitest spec asserting `human → human_pending_flag` returns 400. BE mirrors this test.

### 3.5 Defense-in-depth (7 layers)

| # | Layer | Where | Catches |
|---|---|---|---|
| 1 | Locked system prompt (BASE + tenant + HARDENED) | `composer.js` | LLM "forgetting" rules |
| 2 | Structured output schema (zod, json_schema mode) | `parse.js` | Free-form invention |
| 3 | Citation grounding (cosine ≥ 0.85 per cite) | `parse.js` | Fake citations |
| 4 | Numerical consistency (numbers in answer must appear in chunks) | `parse.js` | Invented numbers |
| 5 | NLI entailment check | `parse.js` (Phase 2) | Unsupported sentences |
| 6 | Contact-id hard filter (data layer + prompt) | SQL + prompt | Cross-contact leak |
| 7 | Confidence gate + turbo cutoff | `trigger.js` | Overconfident hallucinations |

## 4. Tech stack

| Dep | Why |
|---|---|
| `pg@^8` (node-postgres) | Postgres driver, async, parameterized queries |
| `kysely@^0.27` | Type-safe SQL builder; mirrors our TS interface feel without an ORM |
| `zod@^3` | API boundary validation; same library as FE |
| `openai@^4` | OpenAI-compatible client SDK (used against MiniMax-M3's OpenAI-compat endpoint) |
| `nanoid@^5` | Stable ids for chunks / settings / records |
| `pdf-parse`, `mammoth`, `cheerio`, `xlsx` | File parsing for KB ingestion |
| `dotenv` (existing) | Env vars for LLM_PROVIDER, DATABASE_URL, OPENAI_API_KEY (MiniMax key) |
| `pino` + `pino-pretty` (existing) | Logging — already in the manifest |
| `vitest@^2` | BE test runner (FE uses vitest already) |

**No LLM framework** (langchain, llamaindex) — direct HTTP calls; fewer moving parts.

**No vector DB external service** — pgvector inside Postgres handles ANN; FTS5-equivalent via `tsvector` for BM25.

**No Redis / no separate cache layer** — per-request recompute is fine at our expected scale.

## 5. File / folder structure (new under `src/`)

```
src/
  index.js                          (existing — minor: register new routes + wire AI trigger)
  ai/
    index.js                        (exports AI_NAMESPACE: settings, retrieval, gateway, send, handoff)
    settings/
      store.js                      (Postgres-backed ai_settings load/save)
      composer.js                   (mirror of FE systemPrompt.ts — BASE + tenant + HARDENED)
      hardened-rules.js             (byte-stable 4-rule block)
      defaults.js                   (DEFAULT_AI_SETTINGS)
      schema.js                     (zod schema for AiSettings)
    retrieval/
      hybrid.js                     (BM25 + ANN union; scope-aware)
      bm25.js                       (Postgres FTS over knowledge_chunks.text)
      ann.js                        (pgvector cosine over knowledge_chunks.embedding)
      reranker.js                   (MiniMax embeddings cosine re-rank — Phase 2 cross-encoder)
      chunker.js                    (semantic chunking with overlap; deterministic per file hash)
      ocr.js                        (PDF / DOCX / HTML / XLSX extraction)
      embed.js                      (MiniMax embeddings client with cache)
    store/
      entities.js                   (CRUD for entity_definitions, entity_records, entity_relationships)
      chunks.js                     (READ-ONLY access for retrieval; writes only via ingest.js)
    llm/
      openai-compat.js              (OpenAI-compatible client pointed at MiniMax-M3)
      anthropic-compat.js           (fallback provider via Anthropic-compatible API)
      prompt.js                     (build user message: CONTEXT + history + question)
      parse.js                      (zod-validate structured output; reject-and-retry)
    whatsapp/
      trigger.js                    (main entry: processInboundMessage)
      handoff.js                    (AIReplyMode state machine)
      send.js                       (sock.sendMessage wrapper with retries)
    routes/
      ai.js                         (POST /api/crm/ai/ask, /reply-preview, /toggle-mode)
      crm.js                        (CRUD entities + records)
      knowledge.js                  (KB upload/list/delete)
    audit/
      log.js                        (pino structured logs to ./data/audit/<date>.ndjson)
    db/
      client.js                     (pg pool singleton, migration runner)
      migrations/
        001-initial.sql
        002-ai-tables.sql
        003-indexes.sql
      seed.js                       (dev seed: mock-equivalent chats/messages/contacts)
  controllers/ai/
    ask.js                          (POST /api/crm/ai/ask handler)
    replyPreview.js                 (POST /api/crm/ai/reply-preview)
    toggleMode.js                   (POST /api/crm/ai/toggle-mode)
  test/
    ai-settings-roundtrip.test.js   (settings store → composer → byte-equivalent prompt)
    contact-scope.test.js           (NEVER leaks contact A to chat B; data-layer + post-LLM)
    hybrid.test.js                  (BM25 + ANN, basic recall sanity)
    state-machine.test.js           (AIReplyMode transitions; forbidden human → human_pending_flag rejected)
    composer-byte-identity.test.js  (BE composer produces a string byte-equal to FE composer for the same settings input)
    parse.test.js                   (zod validation of structured LLM output; reject-and-retry)
    ingest.test.js                  (file upload → chunk → embed → index; idempotency)
    routes-ai.test.js               (Express route handlers; mock MiniMax; assertions on contact-scope filter)
```

## 6. Defense-in-depth — concrete walkthrough

Inbound WhatsApp message → Pak Hendro (phone 6285179652486, chat in `aiMode`) asks "Berapa harga paket Bulanan?"

1. Baileys fires `messages.upsert` (non-awaited).
2. `trigger.js::processInboundMessage` runs.
3. Chat state: `aiMode = 'ai'`. Continue.
4. Settings: `{whatsappAutoReply: {enabled: true, confidenceThreshold: 0.7}}`.
5. **System prompt** = `BAILEYS_AI_SYSTEM_PROMPT_ID` (Indonesian, byte-stable) + tenant fragment + HARDENED block. ~1.2k tokens.
6. **Retrieval** (hybrid.js, scope='whatsapp', chatId, contactPhone='6285179652486'):
   - BM25 on KB chunks: 5 hits, top score 0.81.
   - ANN on KB chunks (pgvector): 4 hits, top score 0.74.
   - Dedupe → 6 chunks. `retrieval.score = 0.81` ≥ τ_turbo=0.30. Continue.
   - **Data layer filter** for entity_records: `WHERE contact_id = '6285179652486'`. Hard guard at SQL level.
7. **OpenAI-compatible call** to MiniMax-M3 (default provider). Structured outputs = `{answer, citations, confidence, fallback_used}`.
8. **Parse** the response with zod schema. confidence = 0.86, citations = `[{marker:'1', file:'pricelist-2026.pdf', section:'Paket Bulanan', page:3}]`. Valid.
9. **Confidence gate**: 0.86 ≥ 0.7. Continue.
10. **Citation grounding** (per cite): cosine sim between cited span and chunk text = 0.91. Pass.
11. **Numerical consistency**: no numbers in answer absent from chunks. Pass.
12. **Contact-scope post-validate**: citation's source entity has `contact_id='6285179652486'`. Pass.
13. **NLI entailment** (Phase 2 — for MVP, skip or stub).
14. Send via `sock.sendMessage(chatId, {text: ask.answer})`. Persist outbound message. Update `chats.last_message_*`, reset `unread_count`.
15. Audit log: `auto_reply_sent` with confidence, chatId, tenantId.

End-to-end latency: ~1.5 seconds.

## 7. Phasing

**MVP (this run, ~13 working days, single contributor)**:
- DB layer (Postgres + migrations + vitest setup)
- LLM gateway (MiniMax-M3, structured outputs, retries)
- Full embedding pipeline + pgvector ANN + tsvector BM25 + re-rank
- WhatsApp `messages.upsert` hook + state machine
- `/api/crm/ai/{ask, reply-preview, toggle-mode}` + `/api/crm/entities/**` + `/api/crm/knowledge/**`
- Contact-scope hard filter (data layer + prompt + post-validation)
- Audit log
- Vitest suite (~30+ specs)
- SSoT docs under `docs/be/**` + plan files under `docs/crm/plans/15..N`

**Phase 2 (later cycle)**:
- NLI cross-check at scale (HTTP NLI endpoint)
- Cross-encoder reranker (replace MiniMax-embed cosine re-rank with a proper cross-encoder)
- LLM provider switch fallback (Anthropic-compatible MiniMax endpoint)
- Streaming replies with typing indicators

**Phase 3 (later)**:
- Multi-tenant wrapper (RLS, per-tenant vector namespacing, JWT claim) — A2 carry-over
- Self-host LLM option (vLLM + Llama-3)
- WebSocket for real-time `aiMode` changes
- KB auto-tag extraction at ingest time
- Audit-log export (compliance)
- Fine-tuned model on tenant data (if volume warrants)

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| MiniMax rate limit at scale | 2-attempt retry with exponential backoff; falls back to fallback phrase + human flag |
| WhatsApp ban if auto-reply is too eager | `enabled: false` default; operators enable manually after testing via `reply-preview`; `confidence ≥ τ_user` prevents rambling |
| Indonesian grammar errors in LLM output | NLI model flagged for Phase 2; operators can override `rules` string with custom phrasings |
| Cross-contact leak via crafted prompt | Data-layer filter `WHERE contact_id = ?` applies BEFORE LLM sees chunks; system prompt reinforces; BE test suite covers WhatsApp-scope leakage |
| Schema drift between FE and BE | `composer-byte-identity.test.js` asserts byte-equivalence between FE composer output and BE composer output for the same settings input |
| pgvector on small datasets (< 1k chunks) | IVFFlat `lists` param too high → query quality drops. Adaptive: `lists = max(10, sqrt(chunk_count))` |
| KB write path backdoor | Only `ingest.js` (operator upload) writes; LLM's structured output schema has NO write action for chunks; SQL grants for the BE user don't include `INSERT` on `knowledge_chunks` from the AI gateway role (separate DB user for the AI service) |

## 9. Effort estimate

| Work | Days |
|---|---|
| DB layer + migrations + vitest setup | 2 |
| LLM gateway (MiniMax-M3 via OpenAI-compat SDK + structured outputs + retries + parse) | 2 |
| KB ingestion (PDF/DOCX/HTML/XLSX OCR + semantic chunker + MiniMax embeddings + pgvector upsert + tsvector FTS) | 4 |
| Retrieval (hybrid BM25+ANN + re-rank + turbo cutoff + confidence gate) | 2 |
| WhatsApp `messages.upsert` hook + state machine + audit log | 1 |
| REST endpoints (3 × /api/crm/ai + CRM CRUD + KB CRUD) | 1 |
| Settings service (Postgres-backed) | 1 |
| Vitest test suite (~30+ specs) | 2 |
| Documentation (SSoT under `docs/be/**` + plan files) | 1 |
| **Total** | **~14 working days**, single contributor |

## 10. What is NOT in scope (deferred)

- **Multi-tenant SaaS wrapper** — A2 carry-over; opens after this run ships.
- **FE wiring** — the FE keeps its mocks; wiring the FE to the new BE endpoints is a separate cycle (mostly trivial fetch swap).
- **Cross-encoder reranker** — Phase 2.
- **NLI entailment check** — Phase 2.
- **Real-time UI updates** — WebSocket; Phase 3.
- **KB auto-tag extraction** — Phase 3.

## 11. Acceptance gates for cycle close

- `pnpm install --frozen-lockfile` exit 0
- `pnpm typecheck` exit 0 (TypeScript or JSDoc-typed JS)
- `pnpm lint` exit 0
- `pnpm test` exit 0 — vitest suite with ≥30 specs
- `pnpm build` exit 0
- Cycle-specific:
  - `composer-byte-identity.test.js` passes — BE composer produces a string byte-equal to FE composer for the same settings input
  - `contact-scope.test.js` passes — never leaks contact A to chat B at any layer
  - `state-machine.test.js` passes — `human → human_pending_flag` returns 400 (forbidden)
  - Manual: spin up Postgres, run migrations, start BE, send an inbound via `messages.upsert` mock, observe auto-reply
  - All 11 prior-cycle FE locked values UNCHANGED in the FE; all SSoT docs at `docs/be/**` and `docs/tech/**` follow the locked-value discipline