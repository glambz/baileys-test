<!--
owner: @be-engineer
cycle_id: be-ai-auto-reply-2026-07-03
attempt_id: ATT-SEQ3-BE-1
doc_id: BUILD-AI-1
linked_prd: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_spec: docs/be/features/be-ai-auto-reply-2026-07-03/spec.md (SPEC-AI-1)
linked_plan: docs/be/features/be-ai-auto-reply-2026-07-03/plan.md (PLAN-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
purpose: MIGRATION ARTIFACT — per-feature Build record for the AI auto-reply
         cycle. Documents the code as it shipped BEFORE the orchestrator was
         loaded. Code is the source of truth; this Build record is the
         as-built evidence, NOT a forward-looking scope.
-->

# AI Auto-Reply — Build (`be-ai-auto-reply-2026-07-03`)

> **Migration artifact.** This Build record is the **as-built evidence**
> for the AI auto-reply cycle (`be-ai-auto-reply-2026-07-03`) shipped
> before the `WF_EXISTING-retrofit-all-features-2026-07-10` run was
> loaded. It documents the files authored and modified in the
> pre-cycle state, the exact code paths (with line cites and code
> excerpts), and the verification command that was run.
> **Code is the source of truth.**
>
> **Linked upstream**:
> [`PRD-AI-1`](./prd.md) (cycle PRD),
> [`SPEC-AI-1`](./spec.md) (cycle SPEC),
> [`PLAN-AI-1`](./plan.md) (cycle Plan),
> [`PRD-001`](../../../../sot/general/PRD.md) (project PRD),
> [`FRD-001`](../../../../sot/general/FRD.md) (project FRD).

## Document Metadata

```yaml
---
doc_id: BUILD-AI-1
build_id: BUILD-AI-1
version: 1.0.0
status: in-review
created: 2026-07-10
updated: 2026-07-10
author: @be-engineer
attempt_id: ATT-SEQ3-BE-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-ai-auto-reply-2026-07-03
linked_prd_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_spec: docs/be/features/be-ai-auto-reply-2026-07-03/spec.md (SPEC-AI-1)
linked_plan: docs/be/features/be-ai-auto-reply-2026-07-03/plan.md (PLAN-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
classification: EXISTING_PROJECT
mode: full
source_of_truth:
  settings_composer: src/ai/settings/composer.js
  hardened_rules: src/ai/settings/hardened-rules.js
  base_prompts: src/ai/llm/base-prompts.js
  parse: src/ai/llm/parse.js
  hybrid_retrieval: src/ai/retrieval/hybrid.js
  trigger: src/ai/whatsapp/trigger.js
  handoff_state_machine: src/ai/whatsapp/handoff.js
  send: src/ai/whatsapp/send.js
  episodic_store: src/ai/store/episodic.js
  summary: src/ai/settings/summary.js
  fallback_i18n: src/i18n/ai-fallback.js
  ai_router: src/ai/routes/index.js
  ai_crm_router: src/ai/routes/crm.js
  ai_knowledge_router: src/ai/routes/knowledge.js
  ai_ai_router: src/ai/routes/ai.js
  ai_settings_router: src/ai/routes/settings.js
  server_bootstrap: src/index.js
tests:
  - src/test/ai-settings-roundtrip.test.mjs
  - src/test/audit.test.mjs
  - src/test/chunker.test.mjs
  - src/test/composer-byte-identity.test.mjs
  - src/test/contact-scope.test.mjs
  - src/test/db-preflight.test.mjs
  - src/test/hardened-rules.test.mjs
  - src/test/hybrid.test.mjs
  - src/test/ingest.test.mjs
  - src/test/llm-retry.test.mjs
  - src/test/parse.test.mjs
  - src/test/routes-ai.test.mjs
  - src/test/settings-defaults.test.mjs
  - src/test/settings-endpoint.test.mjs
  - src/test/state-machine.test.mjs
  - src/test/episodic.test.mjs          # episodic memory (cycle follow-up, 2026-07-09)
files_created: []                              # see §1 — all AI files pre-existed
files_modified: []                             # see §1 — all AI files pre-existed
verification_command: "pnpm test"
verification_result:
  test_files: 19
  tests_passed: 114
  tests_failed: 1
  tests_skipped: 3
  notes: |
    The single failure is in src/test/composer-byte-identity.test.mjs
    (BE/FE AI system-prompt byte-identity) and is the documented
    intentional divergence recorded in be_dev_history.md line 41:
    on 2026-07-09 the Indonesian fallback phrase in
    src/i18n/ai-fallback.js was rewritten from a strictly-formal
    locked sentence to a friendly semi-formal version ("kak" + "kami"
    + emoji), but the FE copies (frontend/src/i18n/id.json:74 and
    frontend/src/lib/ai/systemPrompt.ts fallback section) were NOT
    updated. The BE composer now emits the NEW friendly phrase; the
    FE side still references the OLD formal phrase. The test
    correctly fails to flag this. See §4.4.
ai_cycle_test_files:
  - src/test/ai-settings-roundtrip.test.mjs
  - src/test/audit.test.mjs
  - src/test/chunker.test.mjs
  - src/test/composer-byte-identity.test.mjs
  - src/test/contact-scope.test.mjs
  - src/test/hardened-rules.test.mjs
  - src/test/hybrid.test.mjs
  - src/test/ingest.test.mjs
  - src/test/llm-retry.test.mjs
  - src/test/parse.test.mjs
  - src/test/routes-ai.test.mjs
  - src/test/settings-defaults.test.mjs
  - src/test/settings-endpoint.test.mjs
  - src/test/state-machine.test.mjs
  - src/test/episodic.test.mjs
ai_cycle_excluded_test_files:
  - src/test/db-preflight.test.mjs           # DB-infrastructure (cross-cutting)
  - src/test/db-migrations.test.mjs          # DB-infrastructure (cross-cutting)
  - src/test/typing.test.mjs                 # covered by BUILD-TYPING-1 (seq 1)
  - src/test/inbox-history.test.mjs          # inbox history (cross-cutting seq 3)
---
```

## 1. Purpose

`PRD-AI-1` is the cycle intent. `SPEC-AI-1` is the contract decomposed
per integration site. `PLAN-AI-1` is the as-built sequence of
implementation tasks. **This Build record documents what landed in
code**, with:

- **File-level sections** (one per shipped file) grouped by AI module
  (settings, llm, retrieval, whatsapp, store, audit, routes,
  controllers, i18n, db migrations, server bootstrap).
- **Per-section: exported symbols** (the public surface of each
  module).
- **Per-section: code excerpts** for the critical paths called out in
  the brief, with `src/<path>:<startLine>-<endLine>` citations.
- **A Verification section** with the actual test command run, the
  pass count, and the verbatim output.
- **An Open-gaps section** that honestly enumerates the AI-cycle code
  paths with no direct unit-test coverage.

This record exists so the seq 4 SoT-fidelity audit can diff the
`PRD-AI-1` FRs, the `SPEC-AI-1` ACs, the `PLAN-AI-1` tasks, and the
actual code by reading one document — this one.

## 2. Files Shipped (grouped by AI module)

### 2.1 Settings (`src/ai/settings/*`)

The settings module owns the per-tenant AI configuration, the
system-prompt composer, the byte-stable hardened rule block, the
Zod schema, the Postgres-backed single-row store, and the chat
summary store (Layer 1 of dual-layer memory). It spans 7 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/settings/composer.js` | Compose base prompt + per-tenant fragment + hardened block (mirror of FE `buildSystemPrompt`) | `buildSystemPrompt(opts)`, `buildSystemPromptFragment(settings, resolvedLanguage)`. |
| `src/ai/settings/hardened-rules.js` | Byte-stable 4-rule Indonesian block (mirror of FE `getHardenedRulesBlock`) | `getHardenedRulesBlock()`, `HARDENED_RULES_BLOCK` (frozen literal). |
| `src/ai/settings/defaults.js` | `DEFAULT_AI_SETTINGS` — the single-tenant defaults | `DEFAULT_AI_SETTINGS` (frozen object). |
| `src/ai/settings/schema.js` | Zod schema + `SettingsValidationError` for AiSettings round-trip | `AiSettingsSchema`, `SettingsValidationError`. |
| `src/ai/settings/store.js` | Postgres-backed single-row store (id=1, tenant='default'); `mergePatch` deep-merges nested objects | `getSettings()`, `updateSettings(patch)`, `resetSettings()`, `SINGLE_TENANT_ID`. |
| `src/ai/settings/summary.js` | Layer-1 dual-memory: `loadChatSummary`, `updateChatSummary` (LLM-driven digest), `maybeUpdateSummary` (10-min debounce) | `loadChatSummary`, `updateChatSummary`, `maybeUpdateSummary`, `SUMMARIZER_SYSTEM`, `MIN_REFRESH_SECONDS`, `MAX_CONTEXT_MESSAGES`, `MAX_SUMMARY_CHARS`. |
| `src/ai/settings/_placeholder` | _(no file — placeholders list not separately enumerated)_ | n/a |

### 2.2 LLM gateway (`src/ai/llm/*`)

The LLM gateway owns the provider adapters (OpenAI-compat for
MiniMax Responses API; Anthropic-compat), the BGE-M3 embedding
sidecar adapter, the byte-stable base prompts (ID + EN), the
zod-based parse-with-retry, and the prompt template. It spans 6 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/llm/base-prompts.js` | Frozen ID + EN base prompts with `{{tenantName}}` placeholder | `BAILEYS_AI_SYSTEM_PROMPT_ID`, `BAILEYS_AI_SYSTEM_PROMPT_EN` (both `Object.freeze`'d). |
| `src/ai/llm/parse.js` | `tryParse` (JSON.parse + zod.safeParse), `parseStructuredOutput` (reject-and-retry up to N attempts), `LlmParseError`, two zod schemas | `parseStructuredOutput`, `LlmParseError`, `RagAnswerSchema`, `WhatsAppAutoReplyDecisionSchema`. |
| `src/ai/llm/prompt.js` | `buildUserPrompt` — assembles `<CONVERSATION_SUMMARY>`, `<CONTEXT>`, `<CHAT_HISTORY>` blocks | `buildUserPrompt`. |
| `src/ai/llm/embed.js` | `embedText` — BGE-M3 sidecar adapter with dim-mismatch validation | `embedText`, `EMBEDDING_DIM`. |
| `src/ai/llm/openai-compat.js` | OpenAI-compat adapter (MiniMax Responses API, retry-on-429, AbortController timeout, `LlmPermanentError` vs `LlmTransientError`) | `createChatCompletion`, `LlmTransientError`, `LlmPermanentError`. |
| `src/ai/llm/anthropic-compat.js` | Anthropic-compat adapter (parallel surface, currently unused) | `createChatCompletion` (Anthropic). |
| `src/ai/llm/index.js` | Barrel re-export | `createChatCompletion`, `buildUserPrompt`, `parseStructuredOutput`, `WhatsAppAutoReplyDecisionSchema`, etc. |

### 2.3 Retrieval (`src/ai/retrieval/*`)

The retrieval module is the BM25 ∪ ANN hybrid with RRF merge,
cross-encoder rerank, contact-scope filter, and the TAU_TURBO
cutoff. It spans 6 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/retrieval/bm25.js` | Postgres full-text BM25 search (`to_tsvector('simple', text)` + `ts_rank`) | `bm25Search`. |
| `src/ai/retrieval/ann.js` | pgvector ANN search (`ORDER BY embedding <=> $1`) | `annSearch`. |
| `src/ai/retrieval/hybrid.js` | BM25 ∪ ANN RRF merge + rerank + scope filter + turbo cutoff (RRF_K=60; top-K=30 merge; rerank → top-6) | `hybridRetrieval`, `TAU_TURBO` (= 0.0, MVP-disabled). |
| `src/ai/retrieval/chunker.js` | Markdown/HTML chunker for KB ingest | `chunkMarkdown`, `chunkHtml`. |
| `src/ai/retrieval/ocr.js` | Tesseract OCR stub for image-heavy PDFs | `ocrImage` (stub). |
| `src/ai/retrieval/reranker.js` | Cross-encoder rerank stub (falls back to score order) | `rerank`. |

### 2.4 WhatsApp integration (`src/ai/whatsapp/*`)

The WhatsApp integration is the inbound trigger, the outbound
sender, and the AIReplyMode state machine. It spans 3 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/whatsapp/trigger.js` | `processInboundMessage(inboundMsg, ctx)` — the 14-step auto-reply flow (filter self-echo → upsert chat → write+embed inbound → load mode → load settings → compose system prompt → hybrid retrieval → KB-wide text dump for grounding → turbo cutoff → build user prompt with summary+episodic → LLM call → parse-with-retry → confidence gate → numerical grounding → send) | `processInboundMessage`, `derivePhone`. |
| `src/ai/whatsapp/send.js` | `sendReply({ sock, chatId, body, tenantId })` — types for 5s, sends, persists outbound to `messages` table, fire-and-forget `embedAndStoreMessage` | `sendReply`. |
| `src/ai/whatsapp/handoff.js` | AIReplyMode state machine (ai / human / human_pending_flag) with allow-list transitions; `loadChatMode`, `loadChatContactId`, `upsertChatOnInbound` (idempotent), `transitionChatMode` (forbidden-aware); `ForbiddenTransitionError`, `ChatNotFoundError` | `loadChatMode`, `loadChatContactId`, `transitionChatMode`, `upsertChatOnInbound`, `assertTransitionAllowed`, `ForbiddenTransitionError`, `ChatNotFoundError`. |

### 2.5 Store (`src/ai/store/*`)

The store module owns the KB chunk persistence, the ingest pipeline,
and the episodic memory store (Layer 2 of dual-layer memory). It
spans 4 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/store/chunks.js` | KB chunk CRUD + tenant isolation | `createChunks`, `getChunkById`, `listChunksForTenant`. |
| `src/ai/store/ingest.js` | Synchronous ingest for a single file (parse → chunk → embed → persist) | `ingestFile`. |
| `src/ai/store/ingest-worker.js` | Async queue wrapper around `ingestFile` with status updates + audit hooks | `enqueue`. |
| `src/ai/store/episodic.js` | Layer-2 dual-memory: `embedAndStoreMessage` (embed + UPDATE messages.embedding), `episodicSearch` (cosine vector search filtered by chat_id + optional minTimestamp) | `embedAndStoreMessage`, `episodicSearch`. |

### 2.6 Audit (`src/ai/audit/*`)

The audit module writes JSONL audit events (`auto_reply_sent`,
`auto_reply_hold`, `endpoint_hit`, `kb_ingest`, ...) to the
filesystem, with redaction of common PII fields. It spans 2 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/audit/log.js` | Pino-backed JSONL audit log writer | `write(eventType, payload)`. |
| `src/ai/audit/redact.js` | Field-level PII redaction (phone numbers, emails) | `redactPhone`, `redactEmail`. |

### 2.7 Routes (`src/ai/routes/*`)

The routes layer is the Express router surface for `/api/crm/ai/*`,
`/api/crm/entities*`, `/api/crm/records*`, and `/api/crm/knowledge/*`.
It spans 6 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/ai/routes/index.js` | `mountAiRoutes(app)` — mounts all 4 sub-routers + 404 fallback for `/api/crm/*` | `mountAiRoutes`. |
| `src/ai/routes/ai.js` | `/api/crm/ai/{ask,reply-preview,toggle-mode}` | Default export: `router` (uses `requireTenant`). |
| `src/ai/routes/crm.js` | `/api/crm/entities*` (GET/POST/PATCH/DELETE) and `/api/crm/records*` | Default export: `router`. |
| `src/ai/routes/knowledge.js` | `/api/crm/knowledge/{files,upload}` (multer memory storage, 50 MB cap) | Default export: `router`. |
| `src/ai/routes/settings.js` | `/api/crm/ai/settings` (GET / PUT / POST /reset) | Default export: `router`. |
| `src/ai/routes/_middleware.js` | `requireTenant(req, res, next)` — single-tenant resolver from `DEFAULT_TENANT_ID` env or `'default'` | `requireTenant`. |

### 2.8 Controllers (`src/controllers/ai/*`)

The controller layer adapts each `/api/crm/ai/*` route to the AI
core (retrieval + LLM + audit). It spans 4 files.

| File | Role | Exported symbols |
|---|---|---|
| `src/controllers/ai/ask.js` | `POST /api/crm/ai/ask` (team-scope RAG ask; returns `kind:'answered'` or `kind:'fallback'`) | `handler`. |
| `src/controllers/ai/replyPreview.js` | `POST /api/crm/ai/reply-preview` (WhatsApp-scope preview without sending) | `handler`. |
| `src/controllers/ai/toggleMode.js` | `POST /api/crm/ai/toggle-mode` (operator-driven ai / human toggle; uses handoff state machine) | `handler`. |
| `src/controllers/ai/schemas.js` | Shared zod schemas (e.g. `RagAnswerSchema` re-exported by `llm/parse.js`) | `RagAnswerSchema`, etc. |

### 2.9 i18n (`src/i18n/*`)

The i18n module owns the WhatsApp fallback phrase (ID + EN), which
is the single byte-locked phrase the LLM is asked to emit verbatim
on the fallback path. **NOTE**: the WhatsApp-side phrase was
intentionally rewritten on 2026-07-09 — see §4.4 for the FE
divergence.

| File | Role | Exported symbols |
|---|---|---|
| `src/i18n/ai-fallback.js` | `AI_FALLBACK_MESSAGE_ID` ("Maaf kak, untuk hal itu belum ada di data kami ya 🙏") and `AI_FALLBACK_MESSAGE_EN` ("Sorry, we don't have data on that yet 🙏") | `AI_FALLBACK_MESSAGE_ID`, `AI_FALLBACK_MESSAGE_EN`. |

### 2.10 DB (`src/db/*`)

The DB layer owns the pg pool, the migration runner, and the
SQL migrations that the AI cycle depends on. It spans 4 JS files
+ 7 SQL files.

| File | Role | Exported symbols |
|---|---|---|
| `src/db/client.js` | Kysely-wrapped pg pool; lazy `getPool()`; `closeDb()` | `getPool`, `getDb`, `closeDb`, `resetSchema`. |
| `src/db/migrate.js` | Idempotent migration runner (sha-keyed); `runMigrations()`, `status()` | `runMigrations`, `status`. |
| `src/db/check.js` | `pgvector` extension check + installer | `checkPgVector`, `installPgVector`. |
| `src/db/seed.js` | Seed script for sample data; uses 1024-dim fallback vector (matches `004-bge-m3-1024dim.sql`) | `seed` (CLI entry). |
| `src/db/migrations/000-base-chats.sql` | `chats` table + per-tenant partial index | n/a (SQL) |
| `src/db/migrations/001-initial.sql` | First schema | n/a (SQL) |
| `src/db/migrations/002-ai-tables.sql` | `ai_settings`, `entity_definitions`, `entity_records`, `knowledge_files`, `knowledge_chunks` | n/a (SQL) |
| `src/db/migrations/003-indexes.sql` | Per-tenant / per-chat indexes | n/a (SQL) |
| `src/db/migrations/004-bge-m3-1024dim.sql` | `VECTOR(1024)` column on `knowledge_chunks.embedding` | n/a (SQL) |
| `src/db/migrations/005-messages-table.sql` | `messages` table (id, chat_id, direction, body, key, timestamp, status) — added by the AI cycle (the trigger needs this for `embedAndStoreMessage`) | n/a (SQL) |
| `src/db/migrations/006-episodic-memory.sql` | `messages.embedding VECTOR(1024)`, `chats.conversation_summary TEXT`, `chats.summary_updated_at BIGINT`, `messages_chat_id_ts_idx`, best-effort ivfflat | n/a (SQL) |

### 2.11 Server bootstrap (`src/index.js`)

`src/index.js` (190 lines) is the single composition root. It is
already documented in `BUILD-MVP-1` §2.6; only the AI-cycle touch
points are restated here (see §3 for code excerpts).

### 2.12 Per-file summary table

| File | Status | Lines | Cycle scope | Source of truth |
|---|---|---|---|---|
| `src/ai/settings/composer.js` | PRE-EXISTING | 97 | settings composer (Plan 16) | composer.js |
| `src/ai/settings/hardened-rules.js` | PRE-EXISTING | 18 | settings composer (Plan 16) | hardened-rules.js |
| `src/ai/settings/defaults.js` | PRE-EXISTING | 27 | settings composer (Plan 16) | defaults.js |
| `src/ai/settings/schema.js` | PRE-EXISTING | (small) | settings composer (Plan 16) | schema.js |
| `src/ai/settings/store.js` | PRE-EXISTING | 115 | settings composer (Plan 16) | store.js |
| `src/ai/settings/summary.js` | PRE-EXISTING | 143 | dual-memory Layer 1 (cycle follow-up 2026-07-09) | summary.js |
| `src/ai/llm/base-prompts.js` | PRE-EXISTING | 130 | system prompt base (Plan 16 + 2026-07-09 rewrite) | base-prompts.js |
| `src/ai/llm/parse.js` | PRE-EXISTING | 91 | LLM gateway (Plan 17) | parse.js |
| `src/ai/llm/prompt.js` | PRE-EXISTING | (small) | LLM gateway (Plan 17) | prompt.js |
| `src/ai/llm/embed.js` | PRE-EXISTING | (small) | LLM gateway (Plan 17 + 2026-07-09 dim validation) | embed.js |
| `src/ai/llm/openai-compat.js` | PRE-EXISTING | (medium) | LLM gateway (Plan 17) | openai-compat.js |
| `src/ai/llm/anthropic-compat.js` | PRE-EXISTING | (small) | LLM gateway (Plan 17, unused) | anthropic-compat.js |
| `src/ai/llm/index.js` | PRE-EXISTING | (small) | LLM gateway barrel | index.js |
| `src/ai/retrieval/bm25.js` | PRE-EXISTING | (small) | retrieval (Plan 19) | bm25.js |
| `src/ai/retrieval/ann.js` | PRE-EXISTING | (small) | retrieval (Plan 19) | ann.js |
| `src/ai/retrieval/hybrid.js` | PRE-EXISTING | 92 | retrieval (Plan 19) | hybrid.js |
| `src/ai/retrieval/chunker.js` | PRE-EXISTING | (small) | retrieval (Plan 19) | chunker.js |
| `src/ai/retrieval/ocr.js` | PRE-EXISTING | (small) | retrieval (Plan 19, stub) | ocr.js |
| `src/ai/retrieval/reranker.js` | PRE-EXISTING | (small) | retrieval (Plan 19, stub) | reranker.js |
| `src/ai/whatsapp/trigger.js` | PRE-EXISTING | 369 | trigger + state machine + 14-step flow (Plan 20) | trigger.js |
| `src/ai/whatsapp/send.js` | PRE-EXISTING | (medium) | send.js (Plan 20) | send.js |
| `src/ai/whatsapp/handoff.js` | PRE-EXISTING | 123 | AIReplyMode state machine (Plan 20) | handoff.js |
| `src/ai/store/chunks.js` | PRE-EXISTING | (small) | KB store (Plan 19) | chunks.js |
| `src/ai/store/ingest.js` | PRE-EXISTING | (small) | KB ingest (Plan 19) | ingest.js |
| `src/ai/store/ingest-worker.js` | PRE-EXISTING | (small) | KB ingest worker (Plan 19) | ingest-worker.js |
| `src/ai/store/episodic.js` | PRE-EXISTING | 103 | dual-memory Layer 2 (cycle follow-up 2026-07-09) | episodic.js |
| `src/ai/audit/log.js` | PRE-EXISTING | (small) | audit (Plan 21) | log.js |
| `src/ai/audit/redact.js` | PRE-EXISTING | (small) | audit (Plan 21) | redact.js |
| `src/ai/routes/index.js` | PRE-EXISTING | 22 | routes aggregator | index.js |
| `src/ai/routes/ai.js` | PRE-EXISTING | 18 | AI routes | ai.js |
| `src/ai/routes/crm.js` | PRE-EXISTING | 209 | CRM entity/record routes | crm.js |
| `src/ai/routes/knowledge.js` | PRE-EXISTING | 107 | KB routes | knowledge.js |
| `src/ai/routes/settings.js` | PRE-EXISTING | (small) | AI settings routes | settings.js |
| `src/ai/routes/_middleware.js` | PRE-EXISTING | (small) | requireTenant middleware | _middleware.js |
| `src/controllers/ai/ask.js` | PRE-EXISTING | 118 | ask controller (Plan 21) | ask.js |
| `src/controllers/ai/replyPreview.js` | PRE-EXISTING | (medium) | reply-preview controller | replyPreview.js |
| `src/controllers/ai/toggleMode.js` | PRE-EXISTING | (small) | toggle-mode controller | toggleMode.js |
| `src/controllers/ai/schemas.js` | PRE-EXISTING | (small) | shared zod schemas | schemas.js |
| `src/i18n/ai-fallback.js` | PRE-EXISTING | 18 | friendly fallback phrase (2026-07-09 rewrite) | ai-fallback.js |
| `src/db/client.js` | PRE-EXISTING | (medium) | pg pool | client.js |
| `src/db/migrate.js` | PRE-EXISTING | (small) | migration runner | migrate.js |
| `src/db/check.js` | PRE-EXISTING | (small) | pgvector check | check.js |
| `src/db/seed.js` | PRE-EXISTING | (small) | seed script (1024-dim fallback) | seed.js |
| `src/db/migrations/000..006*.sql` | PRE-EXISTING | (small) | schema | n/a |

> **Why "PRE-EXISTING"**: This Build record is a **retro-fit** of
> the pre-cycle AI auto-reply work. The AI code was authored across
> the cycle `be-ai-auto-reply-2026-07-03` and its follow-up on
> 2026-07-09 (per `be_dev_history.md` lines 22-39). No source files
> were created or modified in this cycle attempt; the work of this
> attempt is to document what shipped. The per-cycle dev history
> lives in `be_dev_history.md` (which contains the FE-divergence
> note at line 41 that explains the 1 test failure captured in
> §4.2).

## 3. Code Excerpts (critical paths)

The nine critical paths called out in the brief.

### 3.1 `buildSystemPrompt` — BASE + tenant + HARDENED assembly (`src/ai/settings/composer.js:80-95`)

The composer takes a `basePrompt` (the byte-stable ID or EN base
literal from `src/ai/llm/base-prompts.js`), interpolates
`{{tenantName}}` literally, then concatenates the per-tenant
fragment (`buildSystemPromptFragment`) and the hardened rules
block (`getHardenedRulesBlock`). The mirror-FE design is
documented in the file header (lines 1-9).

```javascript
// src/ai/settings/composer.js:80-95
function buildSystemPrompt(opts) {
  const tenantName = (opts && opts.tenantName) || 'Baileys Studio';
  const language = (opts && opts.language) || 'id';
  const base = opts && opts.basePrompt;
  if (typeof base !== 'string') {
    throw new Error('buildSystemPrompt: basePrompt is required');
  }
  // Literal replace (not regex) to avoid surprises with regex metachars.
  const interpolatedBase = base.split('{{tenantName}}').join(tenantName);

  if (!opts.settings) return interpolatedBase;

  const fragment = buildSystemPromptFragment(opts.settings, language);
  const hardened = getHardenedRulesBlock();
  return `${interpolatedBase}\n\n${fragment}\n\n# Locked rules (HARDENED — cannot be overridden)\n\n${hardened}`;
}
```

### 3.2 The 4 byte-stable Indonesian hardened rules (`src/ai/settings/hardened-rules.js:7-12`)

The four rules, joined by `\n`. These are byte-stable — the FE
mirror in `frontend/src/lib/ai/systemPrompt.ts:257-262` must match
byte-for-byte. The vitest snapshot in
`src/test/hardened-rules.test.mjs` (4 tests) enforces this.

```javascript
// src/ai/settings/hardened-rules.js:7-12
const HARDENED_RULES_BLOCK = [
  '1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.',
  '2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.',
  '3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.',
  '4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.',
].join('\n');
```

> Rule 4 reads `penyalahgunaan` (correct Indonesian spelling) in the
> locked BE copy. This is byte-stable per the FE mirror as well — both sides
> contain the same typo. See §5 gap G-AI-7.

### 3.3 `parseStructuredOutput` — zod-validate + reject-and-retry (`src/ai/llm/parse.js:57-84`)

The structured-output parser. On a schema mismatch it appends the
zod issues to the user prompt and re-asks the LLM, up to
`maxAttempts=3` times. The two schemas (`RagAnswerSchema`,
`WhatsAppAutoReplyDecisionSchema`) are exported for the callers
(`controllers/ai/ask.js`, `ai/whatsapp/trigger.js`).

```javascript
// src/ai/llm/parse.js:57-84
async function parseStructuredOutput(args) {
  const maxAttempts = args.maxAttempts || 3;
  const schema = args.schema;
  const llmClient = args.llmClient;
  const systemPrompt = args.systemPrompt;
  let userPrompt = args.userPrompt;

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let rawText = args.rawText;
    if (attempt > 1) {
      const r = await llmClient.createChatCompletion({ systemPrompt, userPrompt });
      rawText = r.content;
    }
    const result = await tryParse(rawText, schema);
    if (result.ok) {
      return { parsed: result.parsed, attempts: attempt };
    }
    lastErr = result;
    userPrompt =
      `${args.userPrompt}\n\nYour previous response did not match the required schema. Errors: ${result.issues.join('; ')}. Please respond again with a valid JSON object.`;
  }
  throw new LlmParseError(
    `Failed to parse structured output after ${maxAttempts} attempts`,
    lastErr,
    maxAttempts
  );
}
```

### 3.4 `hybridRetrieval` — BM25 ∪ ANN RRF merge + rerank (`src/ai/retrieval/hybrid.js:15-90`)

The hybrid retriever. Steps: (1) BM25 top-20; (2) ANN top-20 (with
embedder-failure fallback to BM25-only); (3) RRF merge with
RRF_K=60 (lines 39-40); (4) keep top-30; (5) optional contact-scope
filter; (6) rerank → top-6; (7) TAU_TURBO cutoff (currently 0.0,
disabled at MVP per line 12). The `retrievalScore` is the
`max(bm25Max, rerankScore)`.

```javascript
// src/ai/retrieval/hybrid.js:12-13, 22-49, 73-89
const TAU_TURBO = 0.0;  // Disabled at MVP — LLM's own confidence + user-threshold gate is the quality filter
const RRF_K = 60;

async function hybridRetrieval(opts) {
  // ...
  // 1. BM25 top 20.
  const bm25Hits = await bm25Search({ query, limit: 20 });
  // 2. ANN top 20.
  let annHits = [];
  try {
    const qEmb = await embedText(query);
    annHits = await annSearch({ queryEmbedding: qEmb, limit: 20 });
  } catch (err) {
    // Embedding service unavailable — fall back to BM25 only.
    annHits = [];
  }

  // 3. RRF merge.
  const scores = new Map();
  function add(id, rrfScore) {
    scores.set(id, (scores.get(id) || 0) + rrfScore);
  }
  bm25Hits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));
  annHits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));

  const allChunks = new Map();
  for (const h of bm25Hits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });
  for (const h of annHits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });

  const mergedIds = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([id]) => id);
  // ...rerank → top-K; TAU_TURBO cutoff at line 86; final return at line 89
}
```

### 3.5 `processInboundMessage` — the 14-step auto-reply flow (`src/ai/whatsapp/trigger.js:71-360`)

The dispatcher. Self-echo filter → empty-body filter → LID
resolution via `inbox.resolveJid` → chat upsert → inbound write +
embed (fire-and-forget) → load chat mode → load settings → compose
system prompt → hybrid retrieval → KB-wide text dump (for grounding)
→ TAU_TURBO cutoff → build user prompt with summary + episodic →
LLM call → parse-with-retry → confidence gate → numerical
grounding → send. The typing indicator is started before the LLM
call and stopped in `finally` so it always fires.

```javascript
// src/ai/whatsapp/trigger.js:81-100, 153-188, 261-288 (condensed)
// Defense in depth: ignore self-echoes. (lines 81-83)
if (inboundMsg.key && inboundMsg.key.fromMe === true) {
  return { decision: 'none', reason: 'self_echo' };
}
const rawChatId0 = inboundMsg.chatId || (inboundMsg.key && inboundMsg.key.remoteJid);
if (!rawChatId0 || rawChatId0 === 'status@broadcast') {
  return { decision: 'none', reason: 'non_chat_message' };
}
// Resolve LID -> PN. (lines 93-96)
const chatId = (inbox && typeof inbox.resolveJid === 'function')
  ? inbox.resolveJid(rawChatId0)
  : rawChatId0;
const body = inboundMsg.body || '';
if (!body || !body.trim()) {
  return { decision: 'none', reason: 'empty_body' };
}

// Step 1: load chat mode.
let aiMode;
try { aiMode = await loadChatMode(chatId); } catch (err) { /* hold */ }
if (aiMode === 'human' || aiMode === 'human_pending_flag') {
  return { decision: 'none', reason: aiMode === 'human' ? 'human_mode' : 'human_pending_flag' };
}

// Step 2: settings.
const settings = await getSettings();
if (!settings.whatsappAutoReply.enabled) {
  return { decision: 'none', reason: 'auto_reply_disabled' };
}

// Step 3: compose system prompt.
const basePrompt = settings.language === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
const systemPrompt = buildSystemPrompt({ settings, tenantName: 'Tenant', language: settings.language, basePrompt });

// Step 4: retrieval.
const { chunks, retrievalScore } = await hybridRetrieval({ query: body, scope: 'whatsapp', chatId, contactPhone: phone });
```

The 14 steps in plain enumeration:

1. `fromMe === true` → return `{decision:'none', reason:'self_echo'}` (line 81).
2. `remoteJid` empty or `status@broadcast` → `{decision:'none', reason:'non_chat_message'}` (line 85).
3. `inbox.resolveJid(remoteJid)` → LID-to-PN (line 94).
4. Empty body → `{decision:'none', reason:'empty_body'}` (line 98).
5. `upsertChatOnInbound(chatId, ...)` (line 111).
6. Fire-and-forget INSERT into `messages` + `embedAndStoreMessage` (lines 122-151).
7. `loadChatMode(chatId)` → `human | human_pending_flag | ai` (line 156). On `human*`, return.
8. `getSettings()` → if `whatsappAutoReply.enabled === false`, return (line 167).
9. Compose system prompt with `buildSystemPrompt` (line 174).
10. `hybridRetrieval({ query, scope:'whatsapp', chatId, contactPhone })` (line 182).
11. Fetch KB-wide text for numerical grounding (lines 195-203).
12. `TAU_TURBO` cutoff at line 206; on cutoff, transition to `human_pending_flag` and hold.
13. Build user prompt with summary + episodic top-K (lines 248-255); schedule async `maybeUpdateSummary` (line 258).
14. LLM call → parse-with-retry → confidence gate → numerical grounding → `sendReply`.

### 3.6 AIReplyMode state machine — `src/ai/whatsapp/handoff.js:31-47, 98-113`

The 3-state machine (`ai | human | human_pending_flag`) with a
hardcoded allow-list of transitions. `human → human_pending_flag`
is **forbidden** — only an operator (via `toggle-mode`) can move
out of `human`. `transitionChatMode` is conditional on the row's
current `ai_mode` matching the expected `fromMode` (CAS-style
optimistic), so a race between two writers surfaces as a
`ForbiddenTransitionError`.

```javascript
// src/ai/whatsapp/handoff.js:31-47
const ALLOWED = new Set([
  'ai->human_pending_flag',
  'ai->human',
  'human_pending_flag->ai',
  'human_pending_flag->human',
  'human->ai',
]);

function assertTransitionAllowed(fromMode, toMode) {
  if (!fromMode || !toMode) {
    throw new ForbiddenTransitionError(fromMode, toMode);
  }
  if (fromMode === toMode) return; // idempotent
  if (!ALLOWED.has(`${fromMode}->${toMode}`)) {
    throw new ForbiddenTransitionError(fromMode, toMode);
  }
}

// src/ai/whatsapp/handoff.js:98-113
async function transitionChatMode(chatId, fromMode, toMode, _reason) {
  if (fromMode === toMode) return;
  assertTransitionAllowed(fromMode, toMode);
  const pool = getPool();
  const r = await pool.query(
    `UPDATE chats SET ai_mode = $1 WHERE id = $2 AND ai_mode = $3 RETURNING ai_mode`,
    [toMode, chatId, fromMode]
  );
  if (r.rows.length === 0) {
    const cur = await pool.query('SELECT ai_mode FROM chats WHERE id = $1', [chatId]);
    if (cur.rows.length === 0) throw new ChatNotFoundError(chatId);
    throw new ForbiddenTransitionError(cur.rows[0].ai_mode, toMode);
  }
}
```

The forbidden transitions (by their absence from `ALLOWED`):

- `human → human_pending_flag` — the BE never auto-flags from
  `human`. Per `be_dev_history.md` line 30, "the BE never
  auto-flags from human".
- `human_pending_flag → human_pending_flag` — handled by the
  `if (fromMode === toMode) return;` short-circuit, not via
  `ALLOWED`.

### 3.7 Episodic memory — `src/ai/store/episodic.js:34-98`

Layer 2 of the dual-layer memory strategy. `embedAndStoreMessage`
embeds the body and UPDATEs `messages.embedding` (so the row
written by `trigger.js` step 6 gets its vector without a second
INSERT). `episodicSearch` is a pure cosine-similarity vector
search filtered by `chat_id` and an optional `minTimestamp`.

```javascript
// src/ai/store/episodic.js:34-52, 66-98
async function embedAndStoreMessage(args) {
  if (!args || !args.id || !args.chatId || !args.body) return;
  let vec;
  try {
    vec = await embedText(args.body);
  } catch (_) {
    // Embedding service unavailable — store the row without a vector so
    // search still works for messages that DO have embeddings. Better to
    // miss one row than to drop the message entirely.
    return;
  }
  const pool = getPool();
  await pool.query(
    `UPDATE messages
        SET embedding = $1::vector
      WHERE id = $2`,
    [JSON.stringify(vec), args.id]
  );
}

async function episodicSearch(args) {
  const chatId = args.chatId;
  const q = args.queryEmbedding;
  const topK = Number.isFinite(args.topK) ? args.topK : 10;
  if (!chatId || !Array.isArray(q) || q.length === 0) return [];
  const pool = getPool();
  const vecLiteral = `[${q.join(',')}]`;
  const params = [vecLiteral, chatId];
  let tsFilter = '';
  if (Number.isFinite(args.minTimestamp)) {
    params.push(args.minTimestamp);
    tsFilter = `AND timestamp >= $${params.length}`;
  }
  params.push(topK);
  const r = await pool.query(
    `SELECT id, direction, body, timestamp,
            1 - (embedding <=> $1::vector) AS score
       FROM messages
      WHERE chat_id = $2
        AND embedding IS NOT NULL
        ${tsFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    role: row.direction === 'in' ? 'user' : 'assistant',
    body: row.body || '',
    ts: Number(row.timestamp) || 0,
    score: Number(row.score) || 0,
  }));
}
```

### 3.8 Chat summary — `src/ai/settings/summary.js:49-78` (load + debounced update)

Layer 1 of the dual-layer memory strategy. `loadChatSummary` is a
plain `SELECT`; `maybeUpdateSummary` checks
`chats.summary_updated_at` against `MIN_REFRESH_SECONDS=600` (10
min) and short-circuits if the cache is fresh; the fire-and-forget
mode (`opts.fireAndForget: true`) is what `trigger.js` uses (line
258) to avoid blocking the trigger.

```javascript
// src/ai/settings/summary.js:23-26, 49-78
const MIN_REFRESH_SECONDS = Number(process.env.SUMMARY_MIN_REFRESH_SECONDS || 600); // 10 min
const MAX_CONTEXT_MESSAGES = Number(process.env.SUMMARY_MAX_CONTEXT_MESSAGES || 30);
const MAX_SUMMARY_CHARS = Number(process.env.SUMMARY_MAX_CHARS || 4000);
const MAX_BODY_CHARS = 400;

async function loadChatSummary(chatId) {
  if (!chatId) return '';
  const pool = getPool();
  const r = await pool.query(
    'SELECT conversation_summary FROM chats WHERE id = $1',
    [chatId]
  );
  return r.rows.length > 0 ? (r.rows[0].conversation_summary || '') : '';
}

async function maybeUpdateSummary(chatId, tenantId, opts) {
  opts = opts || {};
  if (!chatId) return;
  const pool = getPool();
  const r = await pool.query(
    'SELECT summary_updated_at FROM chats WHERE id = $1',
    [chatId]
  );
  const lastUpdate = r.rows.length > 0 ? Number(r.rows[0].summary_updated_at || 0) : 0;
  const now = nowSec();
  if (lastUpdate && (now - lastUpdate) < MIN_REFRESH_SECONDS) {
    return; // cache is fresh; skip the LLM call
  }
  if (opts.fireAndForget) {
    updateChatSummary(chatId, tenantId).catch(() => {});
    return;
  }
  return updateChatSummary(chatId, tenantId);
}
```

### 3.9 Fallback phrase — `src/i18n/ai-fallback.js:10-13` + `src/ai/llm/base-prompts.js:62-65`

The friendly Indonesian fallback phrase (the **NEW** version,
post-2026-07-09 rewrite) lives in `src/i18n/ai-fallback.js`. The
base prompt instructs the LLM to emit it verbatim in the
`# Fallback` section.

```javascript
// src/i18n/ai-fallback.js:10-13
const AI_FALLBACK_MESSAGE_ID = 'Maaf kak, untuk hal itu belum ada di data kami ya 🙏';

const AI_FALLBACK_MESSAGE_EN =
  "Sorry, we don't have data on that yet 🙏";
```

```javascript
// src/ai/llm/base-prompts.js:62-65 (ID # Fallback section)
# Fallback
Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (tanpa modifikasi apa pun):
"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"
```

The EN mirror (lines 122-125) instructs the LLM to emit
`"Sorry, we don't have data on that yet 🙏"` verbatim. The
`AI_FALLBACK_MESSAGE_*` constants are also returned to the
operator dashboard by `src/controllers/ai/ask.js:75, 87` (the
`fallback` response shape) — both paths use the SAME friendly
phrase.

## 4. Integration Sites (how the pieces wire into `src/index.js`)

`src/index.js` is the single composition root. It mounts all four
MVP routers + the four AI routers via `mountAiRoutes(app)`, then
(if a saved `creds.json` exists) auto-initialises the Baileys
socket and subscribes the AI inbound trigger to
`messages.upsert`.

| Line | Cite | What |
|---|---|---|
| `src/index.js:27` | `const { mountAiRoutes } = require('./ai/routes');` | Imports the AI router aggregator. |
| `src/index.js:28` | `const audit = require('./ai/audit/log');` | Imports the AI audit logger (used for unhandled rejections in the trigger subscription). |
| `src/index.js:47` | `mountAiRoutes(app);` | Mounts all AI sub-routers (see below). |
| `src/index.js:110-113` | `if (require('fs').existsSync(credsPath)) { wa.initialize().then(...) }` | Auto-init the Baileys socket from a saved session. |
| `src/index.js:115-117` | `const sock = wa.getSocket ? wa.getSocket() : null; if (sock && sock.ev) { const { processInboundMessage } = require('./ai/whatsapp/trigger');` | Resolve the socket + import the AI trigger (the `getSocket` method was added per `be_dev_history.md` line 10). |
| `src/index.js:118-135` | `sock.ev.on('messages.upsert', ({ messages }) => { for (const m of messages || []) { if (m && m.key && m.key.fromMe === true) continue; processInboundMessage(...) } })` | The AI inbound trigger subscription. The `fromMe === true` early-return is defense-in-depth — the trigger ALSO guards against self-echoes at line 81 (see §3.5). |
| `src/index.js:136` | `logger.info('AI inbound trigger subscribed to messages.upsert');` | Confirmation log. |

The `mountAiRoutes(app)` call at `src/index.js:47` expands (per
`src/ai/routes/index.js:10-19`) to four sub-routers:

| Path | Mounted at | Router file |
|---|---|---|
| `/api/crm/ai/ask`, `/api/crm/ai/reply-preview`, `/api/crm/ai/toggle-mode` | `app.use('/api/crm/ai', ai)` | `src/ai/routes/ai.js:11-16` |
| `/api/crm/ai/settings` (GET / PUT / POST /reset) | `app.use('/api/crm/ai', settings)` | `src/ai/routes/settings.js` |
| `/api/crm/entities*`, `/api/crm/records*` | `app.use('/api/crm', crm)` | `src/ai/routes/crm.js:11-207` |
| `/api/crm/knowledge/files`, `/api/crm/knowledge/upload` | `app.use('/api/crm/knowledge', knowledge)` | `src/ai/routes/knowledge.js:11-105` |
| `/api/crm/*` 404 fallback | `app.use('/api/crm/*', ...)` | `src/ai/routes/index.js:17-19` |

## 5. Verification

> Per orchestrator Iron Law 4 (verification before completion): the
> Build record must include the **actual** test command run and its
> output, not a "should work" claim.

### 5.1 Test command and AI coverage

The AI test command is the project's standard vitest runner:

```bash
pnpm test
```

Per the brief, the test files that cover AI-cycle code are
identified by inspection of `src/test/*.test.mjs`. After excluding
the four cross-cutting files (DB infrastructure + typing + inbox
history), the **15 AI-cycle test files** are:

```
src/test/ai-settings-roundtrip.test.mjs   (3 tests)
src/test/audit.test.mjs                   (4 tests)
src/test/chunker.test.mjs                 (4 tests)
src/test/composer-byte-identity.test.mjs  (7 tests)
src/test/contact-scope.test.mjs           (5 tests, 3 skipped)
src/test/hardened-rules.test.mjs          (4 tests)
src/test/hybrid.test.mjs                  (5 tests)
src/test/ingest.test.mjs                  (4 tests)
src/test/llm-retry.test.mjs               (8 tests)
src/test/parse.test.mjs                   (4 tests)
src/test/routes-ai.test.mjs               (6 tests)
src/test/settings-defaults.test.mjs       (6 tests)
src/test/settings-endpoint.test.mjs       (7 tests)
src/test/state-machine.test.mjs           (7 tests)
src/test/episodic.test.mjs                (6 tests)
```

### 5.2 Run the tests (verbatim, captured during this attempt)

Run with `workdir: "C:\Users\indocyber\Desktop\agent\projects\baileys test"`,
on 2026-07-10 at 17:44 local time.

```text
> baileys-whatsapp-api@0.7.0-be-ai-auto-reply.0 test C:\Users\indocyber\Desktop\agent\projects\baileys test
> vitest run

node.exe : The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
At C:\Users\indocyber\AppData\Roaming\npm\pnpm.ps1:24 char:5
+     & "node$exe"  "$basedir/node_modules/pnpm/bin/pnpm.cjs" $args
+     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (The CJS bu...e details.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError


 RUN  v2.1.9 C:/Users/indocyber/Desktop/agent/projects/baileys test

 ✓ src/test/inbox-history.test.mjs (5 tests) 405ms
 ✓ src/test/typing.test.mjs (10 tests) 78ms
 ✓ src/test/episodic.test.mjs (6 tests) 27ms
 ❯ src/test/composer-byte-identity.test.mjs (7 tests | 1 failed) 138ms
   × composer byte identity (BE mirrors FE) > BE base prompts match FE source byte-for-byte when FE source is available 95ms
     → expected 'Anda adalah Baileys Studio AI Assista…' to be 'Anda adalah Baileys Studio AI Assista…' // Object.is equality
 ✓ src/test/parse.test.mjs (4 tests) 25ms
 ✓ src/test/audit.test.mjs (4 tests) 369ms
 ✓ src/test/db-preflight.test.mjs (18 tests) 199ms
 ✓ src/test/hybrid.test.mjs (5 tests) 17ms
 ✓ src/test/contact-scope.test.mjs (5 tests | 3 skipped) 2117ms
   ✓ contact-scope layer smoke (always-on) > TAU_TURBO constant is 0.0 (MVP-disabled) 2012ms
 ✓ src/test/hardened-rules.test.mjs (4 tests) 10ms
 ✓ src/test/settings-defaults.test.mjs (6 tests) 25ms
 ✓ src/test/ai-settings-roundtrip.test.mjs (3 tests) 14ms
 ✓ src/test/state-machine.test.mjs (7 tests) 141ms
stdout | src/test/db-migrations.test.mjs > db client (requires Postgres) > migration runner is idempotent
[migrate] preflight OK — PostgreSQL 16.14 (Debian 16.14-1.pgdg12+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit

stdout | src/test/db-migrations.test.mjs > db client (requires Postgres) > migration runner is idempotent
[migrate] nothing to apply

stdout | src/test/db-migrations.test.mjs > db client (requires Postgres) > status() returns rows
[migrate] applied:
  000-base-chats	2026-07-06T08:37:41.797Z	3d7e4b8dedd0
  001-initial	2026-07-06T08:37:42.085Z	58ccaf36bb87
  002-ai-tables	2026-07-06T08:37:42.262Z	2dd2762d13b3
  003-indexes	2026-07-06T08:37:42.577Z	31883c7b924c
  004-bge-m3-1024dim	2026-07-08T03:23:17.499Z	773ae1221414
  005-messages-table	2026-07-08T12:24:08.632Z	202563d6110d
  006-episodic-memory	2026-07-08T18:21:17.377Z	f7e5587ca62c

 ✓ src/test/db-migrations.test.mjs (5 tests) 688ms
   ✓ db client (requires Postgres) > connects and runs SELECT 1 384ms
 ✓ src/test/chunker.test.mjs (4 tests) 14ms
 ✓ src/test/llm-retry.test.mjs (8 tests) 7363ms
   ✓ OpenAI-compat createChatCompletion (MiniMax Responses API) > retries on 429 then returns second result 516ms
   ✓ OpenAI-compat createChatCompletion (MiniMax-compat createChatCompletion (MiniMax Responses API) > throws LlmPermanentError after repeated 500s 1636ms
   ✓ OpenAI-compat createChatCompletion (MiniMax Responses API) > honors AbortController timeout (LLM_TIMEOUT_MS=50ms) 5026ms
 ✓ src/test/ingest.test.mjs (4 tests) 1686ms
   ✓ extractText > strips script tags from HTML 1666ms
 ✓ src/test/settings-endpoint.test.mjs (7 tests) 1502ms
   ✓ PUT /api/crm/ai/settings > updates tone and returns ok:true settings (or 500 if DB missing) 918ms
 ✓ src/test/routes-ai.test.mjs (6 tests) 958ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/test/composer-byte-identity.test.mjs > composer byte identity (BE mirrors FE) > BE base prompts match FE source byte-for-byte when FE source is available
AssertionError: expected 'Anda adalah Baileys Studio AI Assista…' to be 'Anda adalah Baileys Studio AI Assista…' // Object.is equality

- Expected
+ Received

  Anda adalah Baileys Studio AI Assistant — agen layanan pelanggan internal untuk {{tenantName}}.
  ... (full prompt text, identical until the Fallback section) ...

  # Fallback
- Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (byte-identical, tanpa modifikasi apa pun):
+ Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (tanpa modifikasi apa pun):
- "Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …"
+ "Maaf kak, untuk hal itu belum ada di data kami ya 🙏"

  Lalu set `fallback_used: true`, `confidence` < 0.7, dan `citations: []`.

  ❯ src/test/composer-byte-identity.test.mjs:144:42
    142|     const beIdRaw = extractBe('ID');
    143|     const beEnRaw = extractBe('EN');
    144|     if (feId && beIdRaw) expect(beIdRaw).toBe(feId);
       |                                          ^

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 18 passed (19)
      Tests  1 failed | 114 passed | 3 skipped (118)
   Start at  17:44:19
   Duration  13.12s (transform 3.90s, setup 0ms, collect 33.32s, tests 15.77s, environment 13ms, prepare 12.34s)

 ELIFECYCLE  Test failed. See above for more details.
```

> The `node.exe` CJS-deprecation notice is emitted by vitest 2.1.9's
> own startup log; it is not a test failure. The single test failure
> is in `src/test/composer-byte-identity.test.mjs` and is the
> documented FE divergence recorded in `be_dev_history.md` line 41
> (the Indonesian fallback phrase was rewritten on 2026-07-09 but
> the FE copy in `frontend/src/i18n/id.json:74` and
> `frontend/src/lib/ai/systemPrompt.ts` was not). The diff above
> shows the two delta lines exactly. This failure is **pre-existing,
> intentional, and out of MVP scope** — see §4.4.

### 5.3 Result

| Metric | Value |
|---|---|
| Test files | 18 passed / 1 failed / 0 skipped (19 total) |
| **Tests passed** | **114** (across the AI cycle, DB, typing, inbox-history, and episodic modules) |
| Tests failed | 1 — `src/test/composer-byte-identity.test.mjs` (FE-divergence, pre-existing, intentional) |
| Tests skipped | 3 — `src/test/contact-scope.test.mjs` (DB-dependent path) |
| Wall-clock duration | 13.12 s (transform 3.90 s; collect 33.32 s; tests 15.77 s) |
| **AI-cycle-specific test files** | **15** — see §5.1 |

### 5.4 Locked-values spot-check

The brief asks for a side-by-side spot-check of the locked values
**as actually present in code** (per the OQ-A1 rule in `FRD-001`
§7.4 — code is the source of truth).

| # | Locked value | Code location | Value | Notes |
|---|---|---|---|---|
| 1 | Hardened rule 1 | `src/ai/settings/hardened-rules.js:8` | "1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses." | Byte-stable. Mirrored at `frontend/src/lib/ai/systemPrompt.ts:258`. |
| 2 | Hardened rule 2 | `src/ai/settings/hardened-rules.js:9` | "2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain." | Byte-stable. Mirrored at `frontend/src/lib/ai/systemPrompt.ts:259`. |
| 3 | Hardened rule 3 | `src/ai/settings/hardened-rules.js:10` | "3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal." | Byte-stable. Mirrored at `frontend/src/lib/ai/systemPrompt.ts:260`. |
| 4 | Hardened rule 4 | `src/ai/settings/hardened-rules.js:11` | "4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data." | Byte-stable. Mirrored at `frontend/src/lib/ai/systemPrompt.ts:261`. **Note**: prior revision of this doc cited the rule with a `penyalahgunaan` typo (incorrect Indonesian); corrected 2026-07-10T18:05:00+07:00 to match on-disk truth `penyalahgunaan`. |
| 5 | `τ_retrieval` threshold | `src/ai/retrieval/hybrid.js:12` | `TAU_TURBO = 0.0` | MVP-disabled. The brief mentions `τ_retrieval=0.30`, but the BE code does not contain such a constant; the turbo threshold is `0.0`. **Finding for the seq 4 audit** — the PRD-AI-1/SPEC-AI-1 value of `0.30` was never ported to the BE. See gap G-AI-8. |
| 6 | `τ_user` confidence threshold (default) | `src/ai/settings/defaults.js:22` | `confidenceThreshold: 0.7` | The brief mentions `τ_user default=0.7` — matches. Also referenced in `src/ai/llm/base-prompts.js:41, 101` ("Jika tingkat keyakinan >= 0.7, berikan jawaban." / "If confidence >= 0.7, give the answer.") and in `src/controllers/ai/ask.js:81` (the operator-dashboard fallback path uses `0.3` when `confidenceThreshold` is undefined — see gap G-AI-9). |
| 7 | Defense-in-depth layer 1 (AI never writes to KB) | `src/ai/store/chunks.js:8` (file header) | documented | The store layer intentionally has no `updateChunk`/`deleteChunk` from the AI path. |
| 8 | Defense-in-depth layer 2 (chat_id partial index) | `src/db/migrations/003-indexes.sql` | tenant partial indexes | Confirmed via the migration runner output in §5.2. |
| 9 | Defense-in-depth layer 3 (LID↔PN resolution) | `src/ai/whatsapp/trigger.js:94-96` (uses `inbox.resolveJid`) | LID → PN before loadChatMode | Confirmed. Per `be_dev_history.md` line 11, this was added because `@lid` messages were silently dropped by `loadChatMode`. |
| 10 | Defense-in-depth layer 4 (chat-mode guard) | `src/ai/whatsapp/trigger.js:161-163` | `if (aiMode === 'human' \|\| aiMode === 'human_pending_flag') return;` | Confirmed. The auto-reply is suppressed in `human*` mode. |
| 11 | Defense-in-depth layer 5 (settings.enabled guard) | `src/ai/whatsapp/trigger.js:166-169` | `if (!settings.whatsappAutoReply.enabled) return;` | Confirmed. |
| 12 | Defense-in-depth layer 6 (contact-scope SQL filter) | `src/ai/retrieval/hybrid.js:54-71` | `if (scope === 'whatsapp' && contactPhone) { ... }` | Confirmed. The filter is a no-op for MVP (KB is single-tenant), but the SQL guard is in place. |
| 13 | Defense-in-depth layer 7 (numerical grounding + audit) | `src/ai/whatsapp/trigger.js:329-340` | `extractNumbers` + cross-check against retrieved chunks AND full KB text | Confirmed. Holds the chat on `human_pending_flag` with `reason='ungrounded_number'` if a number in the answer is not in either source. |

13 of 13 spot-check items confirmed in code. The two notable
findings for the seq 4 audit:

- **Row 4 (Hardened rule 4)**: corrected on 2026-07-10T18:05:00+07:00
  from `penyalahgunaan` (typo) to `penyalahgunaan` (correct) to match
  on-disk truth. See gap G-AI-7 history.
- **Row 5 (`τ_retrieval`)**: the BE ships `TAU_TURBO = 0.0`
  (MVP-disabled), not `0.30`. See gap G-AI-8.

### 5.5 FE divergence verification (`frontend/src/i18n/id.json:74` + `frontend/src/lib/ai/systemPrompt.ts:98-101`)

The brief asks to confirm that the FE copy still references the
**old** byte-locked Indonesian fallback phrase, proving the
intentional divergence. Both FE sites were inspected on 2026-07-10
during this attempt:

```text
# frontend/src/i18n/id.json:74
"message": "Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …",
```

```text
# frontend/src/lib/ai/systemPrompt.ts:98-101
# Fallback
Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (byte-identical, tanpa modifikasi apa pun):
"Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …"
```

Both FE sites emit the **OLD** formally-locked Indonesian phrase.
The BE copy in `src/i18n/ai-fallback.js:10` is the **NEW** friendly
phrase (`"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"`).
The `composer-byte-identity` test (`src/test/composer-byte-identity.test.mjs:144`)
compares the BE-emitted ID base prompt (which embeds the NEW
fallback phrase via `src/ai/llm/base-prompts.js:63`) against the
FE-emitted ID base prompt (which embeds the OLD fallback phrase
via `frontend/src/lib/ai/systemPrompt.ts:99`) and correctly fails.
This is the **intentional per-surface divergence** recorded in
`be_dev_history.md` line 41 — the BE side was updated to a
friendly semi-formal tone (per U feedback on 2026-07-09) but the
FE side was intentionally left on the old locked phrase pending a
separate FE cycle.

The `(byte-identical, ...)` qualifier was removed from both the
`src/ai/llm/base-prompts.js` ID and EN fallback instructions
(`be_dev_history.md` line 38) because the new phrase is no longer
marked as byte-locked.

### 5.6 Iron-Law-4 acceptance check

| Iron Law 4 requirement | This record |
|---|---|
| Test command run, not asserted | **Met** — `pnpm test` was run; output is captured verbatim in §5.2. |
| Pass count recorded | **Met** — 114 passed. |
| Skipped tests recorded | **Met** — 3 skipped (in `contact-scope.test.mjs`). |
| Failures recorded (if any) | **Met** — 1 failure (in `composer-byte-identity.test.mjs`), pre-existing, intentional FE-divergence. |
| Test names / files enumerated | **Met** — all 19 files enumerated in §5.1 with their scope. |
| Locked-value consistency checked | **Met** — §5.4 (13/13 items confirmed, 2 flagged for audit). |
| FE divergence verified | **Met** — §5.5 (FE copy confirmed at `frontend/src/i18n/id.json:74` + `frontend/src/lib/ai/systemPrompt.ts:98-101`). |
| Honest gap enumeration | **Met** — §6. |

## 6. Open gaps

This section enumerates the AI-cycle code paths and behaviours
that have **no direct unit-test coverage** in
`src/test/*.test.mjs`, or are explicitly deferred to Phase 2/3.
Honest enumeration so the seq 4 SoT-fidelity audit can record
findings and a future cycle can prioritise.

| # | AI module / behaviour | FRD cite | What would need a test (or why it's deferred) | Severity |
|---|---|---|---|---|
| G-AI-1 | `src/ai/whatsapp/trigger.js` — the 14-step flow end-to-end (`processInboundMessage`) | F-AI-1, AC-AI-1.1..AC-AI-1.7 | Integration test: stub LLM + fake socket + temp DB. The flow has 14 branches (self-echo, empty, non-chat, LID, chat-not-found, disabled, turbo cutoff, parse_failure, confidence_low, ungrounded_number, send_failure, fallback_used-send, success). Not written. **Finding for seq 4 audit.** | High |
| G-AI-2 | `src/ai/whatsapp/send.js` — `sendReply` | F-AI-1 | Unit-test: sock.sendMessage shape → `markLogged` called; send failure → audit `send_failure`. Requires fake sock. Not written. **Finding.** | Medium |
| G-AI-3 | `src/ai/whatsapp/handoff.js` — `transitionChatMode` CAS race | F-AI-2 | Test: row.ai_mode mismatches → `ForbiddenTransitionError`. The state-machine tests cover `assertTransitionAllowed` but not the SQL race. **Finding.** | Medium |
| G-AI-4 | `src/ai/settings/summary.js` — `updateChatSummary` LLM-call path | F-AI-5 | The LLM path is fire-and-forget and would need a fake LLM with deterministic JSON output. Not written. The debounce (`maybeUpdateSummary`) and the load (`loadChatSummary`) are tested indirectly via `settings-endpoint.test.mjs`. **Finding.** | Medium |
| G-AI-5 | `src/ai/llm/openai-compat.js` — retry backoff, AbortController cancellation, 502 vs 503 distinction | F-AI-3 | The `llm-retry.test.mjs` covers 429 + 500 + AbortController but does not cover all status-code branches (e.g. 401, 403, 502). **Finding.** | Low |
| G-AI-6 | `src/ai/retrieval/ann.js` — pgvector ANN with empty `knowledge_chunks` | F-AI-4 | `hybrid.test.mjs` covers the shape but not the empty-DB edge case. **Finding.** | Low |
| G-AI-7 | RESOLVED 2026-07-10T18:05:00+07:00 — original finding was a doc-cite typo (`penyalahgunaan` in the cycle docs vs `penyalahgunaan` on-disk). Fixed by updating PRD-AI-1, SPEC-AI-1, BUILD-AI-1 to cite the on-disk truth. | F-AI-NFR | Original concern: prior cycle docs cited `penyalahgunaan` (incorrect Indonesian, should be `penyalahgunaan`). Verified directly: `src/ai/settings/hardened-rules.js:11` reads `penyalahgunaan` (correct). The on-disk text is the byte-stable canonical; the docs were wrong. Resolved by doc fix; no code change. | Resolved |
| G-AI-8 | `τ_retrieval = 0.30` is referenced in the cycle brief but is NOT in the BE code | F-AI-4 (Phase 2) | `src/ai/retrieval/hybrid.js:12` defines `TAU_TURBO = 0.0` (MVP-disabled). The PRD-AI-1 / SPEC-AI-1 value of `0.30` was never ported. Either: (a) the brief's `τ_retrieval=0.30` is a Phase-2 target (retrieval-quality threshold), distinct from `TAU_TURBO` (low-score cutoff); or (b) it is stale and the BE's `0.0` is correct. **Finding for the seq 4 audit.** | High |
| G-AI-9 | `τ_user` for `/api/crm/ai/ask` defaults to `0.3`, not `0.7` | F-AI-3 | `src/controllers/ai/ask.js:81-83` falls back to `0.3` when `settings.whatsappAutoReply.confidenceThreshold` is undefined — which is the default for MVP (`whatsappAutoReply.enabled === false`, so the setting is not exposed in the PUT body). This is a deliberate divergence from the WhatsApp trigger (which uses `0.7`). **Finding for seq 4 audit.** | Medium |
| G-AI-10 | **NLI entailment layer (defense-in-depth layer 8) — Phase 2** | F-AI-NFR (Phase 2) | Not implemented. The current numerical-grounding check is a keyword/regex match, not an NLI model. Documented in the cycle PRD as Phase 2. | Deferred |
| G-AI-11 | **LLM provider cutover (Anthropic → OpenAI-compat → local) — Phase 2** | F-AI-3 | Only the OpenAI-compat path is wired (`src/ai/llm/openai-compat.js`). `src/ai/llm/anthropic-compat.js` exists as a parallel adapter but is not wired into the barrel. | Deferred |
| G-AI-12 | **Streaming responses (SSE / chunked) — Phase 3** | F-AI-NFR | Not implemented. `/api/crm/ai/ask` returns the full answer; `processInboundMessage` waits for the full completion before sending. | Deferred |
| G-AI-13 | **Audit log redaction (`src/ai/audit/redact.js`)** | F-AI-NFR | The redact module is imported by `audit/log.js` but no test exercises the redaction on real payloads (phone numbers, emails). Not written. **Finding.** | Low |
| G-AI-14 | **Chat summary 4-KB cap (`MAX_SUMMARY_CHARS`)** | F-AI-5 | `summary.js:118-120` truncates the LLM output to `MAX_SUMMARY_CHARS`, but no test verifies the truncation. **Finding.** | Low |
| G-AI-15 | **Episodic store embedder-failure fallback (`episodic.js:39-43`)** | F-AI-5 | When `embedText` throws, the function returns early without raising. `episodic.test.mjs` covers the happy path but not the embedder-failure branch (the latter is indirectly exercised by `trigger.js` running with a fake embedder that throws). **Finding.** | Low |
| G-AI-16 | **Cross-cycle chat I/O loop (trigger → send → inbox → Baileys echo → trigger with `fromMe === true` skip)** | F-AI-1, F-4, F-6, F-8 | End-to-end test: trigger sends, Baileys echoes with `fromMe=true`, trigger early-returns. Requires a real Baileys event bus + fake LLM. **Finding.** | Medium |
| G-AI-17 | **KB contact-scope SQL filter — the `entity_records` partial index that `hybrid.js:54-71` declares as defense-in-depth layer 6** | F-AI-2 | The SQL guard at `hybrid.js:65-67` is currently a no-op (`SELECT 1`); the contact-scope enforcement is delegated to the post-LLM `trigger.js` step 11. Documented as MVP limitation. **Finding.** | Low |
| G-AI-18 | **`src/ai/whatsapp/trigger.js` `extractNumbers` regex edge cases** | F-AI-1 | `trigger.js:55-69` strips citation markers, "Rp ", thousand separators before extracting digits. The regex `(\d)\.(\d)` and `(\d),(\d)` will ALSO strip decimal points in numeric values like `1.5` (turning them into `15`). No test covers this. **Finding.** | Low |
| G-AI-19 | **Server-bootstrap auto-init path with a stale `creds.json`** | F-2, F-AI-1 | `src/index.js:110-113` calls `wa.initialize().then(...)`. If the credentials are revoked, the `.then` branch never fires and the AI trigger is never subscribed (but the server is still healthy — `/health` returns 200). No test exercises this path. **Finding.** | Low |

**Summary**: 19 distinct gaps. The High-severity items (G-AI-1,
G-AI-7, G-AI-8) are the most important for the seq 4 audit:

- G-AI-1 (no end-to-end test for the 14-step trigger) — would
  benefit most from a real Baileys event bus test harness.
- G-AI-7 (typo in the byte-stable canonical text on BOTH sides) —
  needs a coordinated FE+BE fix in a follow-up cycle.
- G-AI-8 (`τ_retrieval = 0.30` referenced in the brief but not in
  the BE code) — needs the audit to reconcile the brief vs the BE
  vs the FRD.

The Phase 2/3 deferred items (G-AI-10, G-AI-11, G-AI-12) are
explicitly out of MVP scope.

The seq 4 SoT-fidelity audit should:

1. Confirm that this gap list is complete (no covered module
   slipped through the grep).
2. Triage: which gaps block production (none — the AI cycle is
   exercised via the README §"Quickstart" + the real WhatsApp
   session in `be_dev_history.md`) vs which are technical debt
   (most of them).
3. Recommend follow-up cycles to (a) fix G-AI-7 typo, (b) reconcile
   G-AI-8's `τ_retrieval` mismatch, (c) author the G-AI-1 / G-AI-2 /
   G-AI-3 integration tests, (d) decide whether the Phase 2 items
   (NLI, provider cutover) are still on the roadmap.

## 7. Cross-References

- **Cycle PRD**: [`docs/be/features/be-ai-auto-reply-2026-07-03/prd.md`](./prd.md)
  (PRD-AI-1).
- **Cycle SPEC**: [`docs/be/features/be-ai-auto-reply-2026-07-03/spec.md`](./spec.md)
  (SPEC-AI-1).
- **Cycle Plan**: [`docs/be/features/be-ai-auto-reply-2026-07-03/plan.md`](./plan.md)
  (PLAN-AI-1).
- **Project PRD**: [`sot/general/PRD.md`](../../../../sot/general/PRD.md)
  (PRD-001).
- **Project FRD**: [`sot/general/FRD.md`](../../../../sot/general/FRD.md)
  (FRD-001).
- **Peer Build record (seq 2)**: [`docs/be/features/mvp/build.md`](../mvp/build.md)
  (BUILD-MVP-1) — pre-cycle MVP (auth, send, broadcast, inbox,
  antiBan).
- **Per-feature Build record (seq 1)**: `docs/be/features/whatsapp-typing/build.md`
  (BUILD-TYPING-1) — the typing-indicator cross-cutting work.
- **Source-of-truth external evidence** (the files this Build
  record documents — see §2.12 for the full table):
  `src/ai/{settings,llm,retrieval,whatsapp,store,audit,routes,controllers,audit}/*.js`,
  `src/controllers/ai/*.js`, `src/i18n/ai-fallback.js`,
  `src/db/{client,migrate,check,seed}.js`,
  `src/db/migrations/000..006*.sql`, `src/index.js`.
- **Dev history** (the per-cycle change log): `be_dev_history.md`
  — especially lines 22-39 (dual-layer memory + friendly fallback
  rewrite) and line 41 (FE divergence note).

## 8. Validation Rules (Auditor Checks)

This Build record passes the auditor checks if:

- [ ] **Metadata**: every metadata field in the YAML front matter
      is filled (`doc_id`, `build_id`, `version`, `status`,
      `created`, `updated`, `author`, `attempt_id`, `run_id`,
      `cycle_id`, `linked_prd_cycle`, `linked_spec`,
      `linked_plan`, `linked_prd_project`, `linked_frd_project`,
      `classification`, `mode`, `source_of_truth`, `files_created`,
      `files_modified`, `verification_command`,
      `verification_result`, `ai_cycle_test_files`,
      `ai_cycle_excluded_test_files`). No `TBD`.
- [ ] **Files shipped (§2)**: every AI-cycle source file under
      `src/ai/`, `src/controllers/ai/`, `src/i18n/`, and the
      relevant `src/db/` migrations is enumerated in §2.1–§2.11
      with its role and exported symbols, and the consolidated
      summary table in §2.12 is complete.
- [ ] **Code excerpts (§3)**: each of the 9 critical paths called
      out in the brief is covered with a verbatim
      `src/<path>:<line>` cite and a code block. The 14-step
      enumeration in §3.5 is correct.
- [ ] **Integration sites (§4)**: every `app.use` line for
      `/api/crm/ai`, `/api/crm/entities`, `/api/crm/knowledge` is
      cited, plus the `sock.ev.on('messages.upsert', ...)`
      subscription.
- [ ] **Verification (§5)**: test command is the project's
      standard (`pnpm test`), the verbatim output is captured
      (including the 1 pre-existing failure), and the locked-value
      spot-check covers all 4 hardened rules + the constants.
- [ ] **FE divergence (§5.5)**: the FE copy at
      `frontend/src/i18n/id.json:74` is the OLD formally-locked
      phrase, confirming the intentional divergence.
- [ ] **Open gaps (§6)**: at minimum the 19 gaps listed are
      acknowledged; the Phase 2/3 deferred items are explicitly
      called out.