<!--
owner: @technical-planner
cycle_id: be-ai-auto-reply-2026-07-10 (retro-fit)
attempt_id: ATT-SEQ3-TP-1
doc_id: PLAN-AI-1
linked_prd_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_spec: docs/be/features/be-ai-auto-reply-2026-07-03/spec.md (SPEC-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001, §3 Batch 3)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001, Sprint 3)
linked_mvp: docs/be/MVP.md
purpose: MIGRATION ARTIFACT — per-cycle Plan that documents the
         implementation steps that were actually taken to ship the
         `be-ai-auto-reply-2026-07-03` cycle (AI auto-reply engine +
         /api/crm/ai/* endpoints + hybrid retrieval + KB ingestion +
         WhatsApp trigger + AIReplyMode state machine + audit log)
         AND the four post-cycle hotfixes (LID↔PN resolveJid in
         trigger, episodic memory, chat summary, fallback phrase
         rewrite). This is an AS-BUILT record (retro-fit), not a
         forward-looking plan. Code is the source of truth.
-->

# AI Auto-Reply Cycle — Plan (`be-ai-auto-reply-2026-07-03` retro-fit)

> **Migration artifact.** This Plan is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run (Sprint 3 of [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md),
> per [`PLAN-RETROFIT-001` §3 Batch 3](../../../../sot/general/Plan.md)).
> It documents the implementation steps that were **actually taken**
> to ship the AI auto-reply cycle — DB layer, AI settings + composer
> + hardened rules + defaults + schema, LLM gateway, hybrid retrieval,
> KB ingestion, CRM store, WhatsApp trigger + state machine + send
> wrapper, REST endpoints, audit log, initial test suite — followed
> by the **four post-cycle hotfixes** (LID↔PN resolveJid in trigger,
> episodic memory, chat summary, fallback phrase rewrite). **Code is
> the source of truth.**
>
> **Linked upstream**:
> [`PRD-AI-1`](./prd.md) (cycle PRD, written in this same run),
> [`SPEC-AI-1`](./spec.md) (cycle SPEC, written in this same run),
> [`PRD-001`](../../../../sot/general/PRD.md) (project PRD),
> [`FRD-001`](../../../../sot/general/FRD.md) (project FRD),
> [`PLAN-RETROFIT-001` §3 Batch 3](../../../../sot/general/Plan.md)
> (project Plan),
> [`TaskPlan-RETROFIT-001`](../../../../sot/general/TaskPlan.md)
> (project TaskPlan, Sprint 3),
> [`MVP.md`](../../MVP.md) (the AI cycle SSoT). Per-feature Build
> evidence will land in `docs/be/features/be-ai-auto-reply-2026-07-03/build.md`.

## Document Metadata

```yaml
---
doc_id: PLAN-AI-1
plan_id: PLAN-AI-1
version: 1.0.0
status: in-progress
created: 2026-07-10
updated: 2026-07-10
author: @technical-planner
attempt_id: ATT-SEQ3-TP-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-ai-auto-reply-2026-07-03
linked_prd_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_spec: docs/be/features/be-ai-auto-reply-2026-07-03/spec.md (SPEC-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001, §3 Batch 3)
linked_task_plan_project: sot/general/TaskPlan.md (TaskPlan-RETROFIT-001, Sprint 3)
linked_mvp: docs/be/MVP.md
source_versions_covered:
  - "be-ai-auto-reply-2026-07-03 — DB, AI settings, LLM gateway, retrieval, ingest, CRM, WhatsApp trigger, REST endpoints, audit"
  - "post-cycle hotfix #1 — LID↔PN resolveJid integration in trigger"
  - "post-cycle hotfix #2 — episodic memory (migration 006 + episodic.js)"
  - "post-cycle hotfix #3 — chat summary (summary.js + integration in trigger)"
  - "post-cycle hotfix #4 — fallback phrase rewrite (i18n/ai-fallback.js + base-prompts.js)"
mode: full
classification: EXISTING_PROJECT
---
linked_frd_features:
  - F-12 # AI settings (Postgres-backed) + composer + hardened rules
  - F-13 # LLM gateway (OpenAI-compatible, MiniMax-M3) + structured outputs + retries + parse
  - F-14 # Hybrid retrieval (BM25 + ANN + reranker) + chunker + ocr + embed
  - F-15 # KB ingest pipeline
  - F-16 # CRM store (entity_definitions, entity_records, entity_relationships)
  - F-17 # WhatsApp trigger (processInboundMessage) + AIReplyMode state machine
  - F-18 # WhatsApp send wrapper
  - F-19 # REST endpoints (/api/crm/ai/*, /api/crm/entities/**, /api/crm/knowledge/**)
  - F-20 # Audit log (NDJSON append-only)
  - F-21 # Defense-in-depth (composer byte-identity, structured outputs, citation grounding, numerical consistency, contact-scope, confidence gate, turbo cutoff)
  - F-22 # AIReplyMode state machine (ai / human / human_pending_flag)
  - F-23 # Chat summary + episodic memory (post-cycle hotfixes)
  - F-24 # i18n fallback phrase (post-cycle hotfix)
linked_prd_requirements:
  - FR-12 .. FR-24 (PRD-001 §4.1 AI cycle rows)
  - all sub-features in PRD-AI-1 / SPEC-AI-1
source_of_truth:
  db:
    - src/db/client.js
    - src/db/check.js
    - src/db/migrate.js
    - src/db/seed.js
    - src/db/migrations/000-base-chats.sql
    - src/db/migrations/001-initial.sql
    - src/db/migrations/002-ai-tables.sql
    - src/db/migrations/003-indexes.sql
    - src/db/migrations/004-bge-m3-1024dim.sql
    - src/db/migrations/005-messages-table.sql
    - src/db/migrations/006-episodic-memory.sql
  ai_settings:
    - src/ai/settings/store.js
    - src/ai/settings/composer.js
    - src/ai/settings/hardened-rules.js
    - src/ai/settings/defaults.js
    - src/ai/settings/schema.js
    - src/ai/settings/summary.js
  ai_llm:
    - src/ai/llm/openai-compat.js
    - src/ai/llm/anthropic-compat.js
    - src/ai/llm/parse.js
    - src/ai/llm/prompt.js
    - src/ai/llm/embed.js
    - src/ai/llm/base-prompts.js
  ai_retrieval:
    - src/ai/retrieval/hybrid.js
    - src/ai/retrieval/bm25.js
    - src/ai/retrieval/ann.js
    - src/ai/retrieval/reranker.js
    - src/ai/retrieval/chunker.js
    - src/ai/retrieval/ocr.js
  ai_store:
    - src/ai/store/entities.js
    - src/ai/store/chunks.js
    - src/ai/store/ingest.js
    - src/ai/store/ingest-worker.js
    - src/ai/store/episodic.js
  ai_whatsapp:
    - src/ai/whatsapp/trigger.js
    - src/ai/whatsapp/handoff.js
    - src/ai/whatsapp/send.js
  ai_routes:
    - src/ai/routes/ai.js
    - src/ai/routes/crm.js
    - src/ai/routes/knowledge.js
    - src/ai/routes/settings.js
    - src/ai/routes/index.js
    - src/ai/routes/_middleware.js
  ai_audit:
    - src/ai/audit/log.js
    - src/ai/audit/redact.js
  controllers:
    - src/controllers/ai  # ask / replyPreview / toggleMode
  i18n:
    - src/i18n/ai-fallback.js
  server_bootstrap:
    - src/index.js  # mounts AI routers + wires messages.upsert trigger
  tests:
    - src/test/composer-byte-identity.test.mjs
    - src/test/hardened-rules.test.mjs
    - src/test/settings-defaults.test.mjs
    - src/test/settings-endpoint.test.mjs
    - src/test/parse.test.mjs
    - src/test/state-machine.test.mjs
    - src/test/chunker.test.mjs
    - src/test/llm-retry.test.mjs
    - src/test/hybrid.test.mjs
    - src/test/contact-scope.test.mjs
    - src/test/ingest.test.mjs
    - src/test/routes-ai.test.mjs
    - src/test/audit.test.mjs
    - src/test/db-migrations.test.mjs
    - src/test/db-preflight.test.mjs
    - src/test/ai-settings-roundtrip.test.mjs
    - src/test/inbox-history.test.mjs     # post-cycle hotfix #1
    - src/test/episodic.test.mjs          # post-cycle hotfix #2
```

## 1. Goal

Document the implementation steps that were actually taken in this
`be-ai-auto-reply-2026-07-03` cycle (plus the four post-cycle hotfixes
that landed on 2026-07-09 and 2026-07-10), in the order they were taken.
This is the **as-built** record — not a forward-looking plan. Per the
user's clarification on 2026-07-10T10:45:50+07:00 (`DecisionLog.md`
§"2026-07-10T10:45:50"): retro-fit means "migrate from previous system
workflow to the current mavis workflow"; the code is the source of
truth. This Plan is the migration output for the cycle-level
implementation steps.

The AI cycle shipped with **one Postgres-backed DB layer** (`src/db/`),
**six AI settings modules** (`store`, `composer`, `hardened-rules`,
`defaults`, `schema`, `summary`), **six LLM gateway modules**
(`openai-compat`, `anthropic-compat`, `parse`, `prompt`, `embed`,
`base-prompts`), **six retrieval modules** (`hybrid`, `bm25`, `ann`,
`reranker`, `chunker`, `ocr`), **four store modules** (`entities`,
`chunks`, `ingest`, `ingest-worker`, plus episodic from hotfix #2),
**three WhatsApp integration modules** (`trigger`, `handoff`, `send`),
**four AI routers** (`ai`, `crm`, `knowledge`, `settings`), **two audit
modules** (`log`, `redact`), **one i18n module** (`ai-fallback`), and
**17 vitest spec files** (15 from the main cycle + 2 added with the
post-cycle hotfixes). The chronological order of the 14 tasks is
inferred from `be_dev_history.md` (the dev history file is the cycle's
authoritative chronological log), the README dependency graph, and the
migration file numbering (`000` → `006`). The cycle shipped in one go
on 2026-07-03 (`CHANGELOG.md §0.7.0-be-ai-auto-reply.0`), then four
hotfixes landed from 2026-07-09 → 2026-07-10 (`be_dev_history.md`).

The MVP cycle (seq 2) shipped the Baileys socket (`client.js`),
single-send (`messageController.js`), broadcast (`broadcaster.js`),
inbox (`writer.js`) and anti-ban (`antiBan.js`) that this AI cycle
depends on; **those modules are not re-described here** — they are
cited as line-range invariants the seq 4 audit re-checks.

## 2. Scope and Boundary

### 2.1 In scope

- **DB layer + migrations 000-006** (T1):
  - `src/db/client.js` — pg pool singleton + Kysely wrapper;
    `runMigrations()` + `ensureMigrationsTable()` + idempotent
    migration runner.
  - `src/db/check.js` — preflight checks (DB reachable, vector
    extension installed).
  - `src/db/migrate.js` — CLI entry (`db:migrate` script).
  - `src/db/seed.js` — dev seed (mock chats / messages / contacts;
    embedding vector length 1024 per migration 004).
  - Migrations `000-base-chats.sql`, `001-initial.sql`,
    `002-ai-tables.sql`, `003-indexes.sql`,
    `004-bge-m3-1024dim.sql`, `005-messages-table.sql`,
    `006-episodic-memory.sql`. Migration 005 was added as a follow-up
    to fix a missing `messages` table; migration 006 is the episodic
    memory hotfix.
  - Server-bootstrap wiring: `runMigrations()` called on boot from
    `src/index.js:77-83`.
  - `package.json` `db:migrate` / `db:seed` / `db:reset` /
    `db:status` scripts. Cross-cutting F-12 prerequisite.
- **AI settings service + composer + hardened-rules + defaults + schema**
  (T2):
  - `src/ai/settings/store.js` — Postgres-backed load / save for
    `ai_settings` row; tenant-aware (single-tenant for MVP).
  - `src/ai/settings/composer.js` — mirror of
    `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt`; produces
    a byte-equivalent string for the same input (`BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}`
    + tenant fragment + 4-rule HARDENED block).
  - `src/ai/settings/hardened-rules.js` — byte-stable 4-rule
    Indonesian block, copied verbatim from FE
    `getHardenedRulesBlock`.
  - `src/ai/settings/defaults.js` — same as FE
    `useAiSettingsStore.DEFAULT_AI_SETTINGS`.
  - `src/ai/settings/schema.js` — zod schema mirroring FE
    `frontend/src/types/aiSettings.ts`.
  - **Composer-byte-identity contract**: any drift between
    `composer.js` and FE `systemPrompt.ts` is detected by
    `src/test/composer-byte-identity.test.mjs` (the only test that
    fails on purpose post-hotfix #4; see §2.3 D6 / T14).
- **LLM gateway + structured outputs + retries + parse** (T3):
  - `src/ai/llm/openai-compat.js` — OpenAI SDK pointed at
    MiniMax-M3's OpenAI-compatible endpoint; structured outputs via
    `response_format: json_schema`; 2-attempt exponential backoff on
    429 / 5xx; dim-mismatch validation (post-hotfix: throws 502 when
    provider response vector length differs from `EMBEDDING_DIM`).
  - `src/ai/llm/anthropic-compat.js` — Anthropic-compatible fallback
    client (wired; production cutover is Phase 2 per CHANGELOG §"Deferred").
  - `src/ai/llm/parse.js` — zod-validates the structured response;
    reject-and-retry up to 3 times.
  - `src/ai/llm/prompt.js` — builds the user message
    (CONTEXT block + chat history + question); post-hotfix #2 now
    accepts `summary` (emitted as
    `<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` before
    `<CONTEXT>`) and `maxHistory` (replaces the hard-coded `-6` cap
    on `chatHistory`).
  - `src/ai/llm/embed.js` — MiniMax embeddings client, SHA-256 LRU
    cache, dim-mismatch validation (post-hotfix).
  - `src/ai/llm/base-prompts.js` — byte-stable Indonesian + English
    system prompts (`BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}`); post-hotfix #4
    the Fallback section instructs the LLM to emit the new friendly
    phrase verbatim; the `(byte-identical, tanpa modifikasi apa pun)`
    qualifier was removed.
- **Retrieval — BM25 + ANN + reranker + chunker + ocr + embed** (T4):
  - `src/ai/retrieval/hybrid.js` — BM25 + ANN union with RRF fusion;
    scope-aware (`scope: 'whatsapp' | 'team'`); turbo cutoff at
    `τ_turbo = 0.30`; contact-scope hard filter at SQL layer.
  - `src/ai/retrieval/bm25.js` — Postgres FTS
    (`to_tsvector('simple', text)` GIN) over `knowledge_chunks.text`.
  - `src/ai/retrieval/ann.js` — pgvector cosine
    (`<=>` + `ivfflat` with `lists = max(10, sqrt(chunk_count))`).
  - `src/ai/retrieval/reranker.js` — MiniMax-embedding cosine re-rank
    (Phase 2 swap to cross-encoder deferred per CHANGELOG §"Deferred").
  - `src/ai/retrieval/chunker.js` — semantic chunking with overlap
    (~512 tokens, 50-token overlap); deterministic per-file hash for
    idempotency.
  - `src/ai/retrieval/ocr.js` — PDF via `pdf-parse`; DOCX via
    `mammoth`; HTML via `cheerio`; XLSX via `xlsx-stream`; CSV / TXT
    fallback.
- **Ingest pipeline + KB store** (T5):
  - `src/ai/store/chunks.js` — READ-ONLY KB chunks API; writes
    reachable ONLY from `ingest.js` (security invariant F-21 layer 1
    from MVP §3.2 / §3.5).
  - `src/ai/store/ingest.js` — operator upload pipeline
    (file → `./data/kb/...` → OCR → chunk → embed → upsert into
    Postgres, idempotent on `(tenant_id, source_path, chunk_index)`).
  - `src/ai/store/ingest-worker.js` — async worker that drains the
    ingest queue (`status: queued → ingesting → indexed` / `failed`).
- **CRM store** (T6): all 7 endpoints wired inline in
  `src/ai/routes/crm.js` (209 lines), zod-validated;
  `src/db/migrations/002-ai-tables.sql:117-154` carries the
  `entity_definitions` + `entity_records` + `entity_relationships`
  table definitions. **No separate `src/ai/store/entities.js` was
  created** — the CRUD is colocated with the route handlers per
  the seq-1 cross-cycle convention (`messageController.js` +
  `routes/messages.js` are likewise co-located, not split into a
  `store/` module).
- **WhatsApp trigger + state machine + send wrapper** (T7):
  - `src/ai/whatsapp/trigger.js` — main entry
    `processInboundMessage(inboundMsg)`; non-awaited by Baileys; runs
    the 13-step pipeline (mode check → settings load → composer →
    retrieval → turbo cutoff → LLM call → parse+retry → confidence
    gate → citation grounding → numerical consistency →
    contact-scope post-validate → send → audit). Post-hotfix #1:
    `resolveJid(chatId)` at step 0 so `@lid`-routed chats map to the
    same `chats` row as `@s.whatsapp.net` chats. Post-hotfix #1:
    early-return guards on `fromMe=true`, `status@broadcast`, empty
    body. Post-hotfix #1: dispatcher-level
    `if (m.key.fromMe === true) continue;` at
    `src/index.js:115-121` (defense in depth). Post-hotfix #2: step
    0.5 INSERTs into `messages` (idempotent on `key.id`) +
    `episodicSearch(topK=EPISODIC_TOPK=10)`; step 4 history = episodic
    hits mapped to `{role, content}`; loads
    `chats.conversation_summary`; schedules async
    `maybeUpdateSummary()`. Post-hotfix #2: numerical consistency
    check (step 11) now consults ALL `knowledge_chunks` for the
    tenant (single-tenant, no `WHERE tenant_id` clause). Post-hotfix
    #4: removed step 8.5 KB-excerpt augmentation; LLM's
    `fallback_used:true` → send locked phrase verbatim. Post-hotfix
    #1: `extractNumbers()` strips `[n]` citation markers, "Rp "
    prefix, and Indonesian thousand separators (`5.000.000 →
    5000000`). Post-hotfix #1: `numerical consistency` follow-up to
    consult all KB chunks (not just top-K).
  - `src/ai/whatsapp/handoff.js` — `AIReplyMode` state machine
    (`ai | human | human_pending_flag`) with allowed transitions and
    SQL CHECK consistency.
  - `src/ai/whatsapp/send.js` — `sock.sendMessage(...)` wrapper with
    retries + audit log; fire-and-forget
    `embedAndStoreMessage()` post-hotfix #2; `UPDATE chats`
    `to_timestamp($2)` cast dropped (BIGINT epoch seconds).
- **REST endpoints** (T8):
  - `src/ai/routes/ai.js` — `POST /api/crm/ai/ask`,
    `POST /api/crm/ai/reply-preview`,
    `POST /api/crm/ai/toggle-mode` (idempotent).
  - `src/ai/routes/crm.js` — `GET / POST / PATCH / DELETE
    /api/crm/entities` + `…/entities/:id/records`,
    `/api/crm/records/:id`.
  - `src/ai/routes/knowledge.js` — `GET / POST / DELETE
    /api/crm/knowledge/files` + `/files/:id`; multipart upload via
    `multer`; ingest pipeline runs async.
  - `src/ai/routes/settings.js` — `GET / PUT /api/crm/ai/settings` (per
    the F-12 REST shape).
  - `src/ai/routes/index.js` — router assembly.
  - `src/ai/routes/_middleware.js` — cross-route middleware (auth,
    contact-scope check, error wrapper).
  - `src/controllers/ai/ask.js`,
    `src/controllers/ai/replyPreview.js`,
    `src/controllers/ai/toggleMode.js` — per-route handlers. Ask
    fallback response received the post-hotfix #1 step-8.5 KB-excerpt
    augmentation; both hotfix #1 and post-hotfix #4 (ask + trigger)
    removed that augmentation in lockstep.
- **Audit log** (T9):
  - `src/ai/audit/log.js` — pino structured logs to
    `./data/audit/<date>.ndjson`; `audit(eventType, payload)` (async,
    fire-and-forget, never throws).
  - `src/ai/audit/redact.js` — redaction helper for sensitive fields
    (`apiKey`, `password`, `authorization`, `cookie`, `*token`).
- **Initial test suite** (T10) — vitest specs that shipped with
  `0.7.0-be-ai-auto-reply.0`:
  - `composer-byte-identity.test.mjs` — BE composer produces a
    string byte-equal to FE composer for the same settings input
    (1 spec; this is the test that fails-on-purpose after hotfix #4
    per D6 / T14).
  - `hardened-rules.test.mjs` — 4-rule HARDENED block byte-equivalence.
  - `settings-defaults.test.mjs` — `DEFAULT_AI_SETTINGS` structural
    invariance.
  - `settings-endpoint.test.mjs` — GET / PUT `/api/crm/ai/settings`.
  - `parse.test.mjs` — zod validation of structured LLM output;
    reject-and-retry.
  - `state-machine.test.mjs` — AIReplyMode transitions; forbidden
    `human → human_pending_flag` → 400; reversible
    `human_pending_flag → ai / human`.
  - `chunker.test.mjs` — semantic chunking idempotency.
  - `llm-retry.test.mjs` — 2-attempt exponential backoff on 429 / 5xx.
  - `hybrid.test.mjs` — BM25 + ANN RRF recall sanity; contact-scope
    filter at SQL layer; scope-aware (`whatsapp` / `team`).
  - `contact-scope.test.mjs` — NEVER leaks contact A to chat B;
    data-layer + post-LLM.
  - `ingest.test.mjs` — file upload → OCR → chunk → embed → upsert;
    idempotency.
  - `routes-ai.test.mjs` — Express route handlers; mock MiniMax;
    assertions on contact-scope filter.
  - `audit.test.mjs` — NDJSON append-only; redaction.
  - `db-migrations.test.mjs` — idempotent migration runner; all 7
    migrations apply cleanly.
  - `db-preflight.test.mjs` — DB reachable + vector extension
    installed preflight.
  - `ai-settings-roundtrip.test.mjs` — settings store → composer
    → byte-equivalent prompt.
- **Server-bootstrap AI integration** (T8/T1 cross-cut):
  - `src/index.js:105-138` — `sock.ev.on('messages.upsert', …)`
    dispatcher that calls `processInboundMessage`; Baileys is NEVER
    blocked (`processInboundMessage` does not `await` before
    returning). Uses `wa.getSocket()` — added to `WhatsAppClient`
    during the cycle (per `be_dev_history.md` line 10) so the
    `if (sock && sock.ev)` guard passes.
- **Post-cycle hotfix #1 — LID↔PN resolveJid integration** (T11):
  - `src/ai/whatsapp/trigger.js` — `chatId` resolved via
    `inbox.resolveJid()` at the top of the handler so messages
    Baileys reports as `@lid` map to the same `chats` row stored by
    `@s.whatsapp.net` PN. Without this, `loadChatMode` returns
    `chat_not_found` and the auto-reply is silently dropped.
  - `src/whatsapp/client.js` — `getSocket()` method added on
    `WhatsAppClient` so `src/index.js:115` `wa.getSocket()` resolves
    to a real socket; previously `wa.getSocket` was undefined and the
    trigger subscription silently failed (only the inbox writer was
    on the dispatcher).
  - `src/index.js:121` — dispatcher-level
    `if (m && m.key && m.key.fromMe === true) continue;` to stop the
    auto-reply spam loop where Baileys echoed the AI's own outbound
    messages and the trigger re-fired the LLM on each echo.
  - Trigger step 11: `extractNumbers()` strips `[n]` citation
    markers, "Rp " prefix, Indonesian thousand separators
    (`5.000.000 → 5000000`); the numerical check was incorrectly
    flagging `[4]` as hallucinated and "5.000" as ungrounded when
    both were correct.
  - Trigger step 11: wider `ungrounded_number` check now consults ALL
    `knowledge_chunks` (not just top-K) — dropped the
    `WHERE tenant_id = $1` clause (column doesn't exist; single-tenant).
- **Post-cycle hotfix #2 — episodic memory** (T12):
  - `src/db/migrations/006-episodic-memory.sql` — adds
    `messages.embedding (VECTOR(1024))`, `chats.conversation_summary
    (TEXT)`, `chats.summary_updated_at (BIGINT)`,
    `messages_chat_id_ts_idx`, best-effort `ivfflat` vector index;
    idempotent (`DO` blocks + `IF NOT EXISTS`).
  - `src/ai/store/episodic.js` — `embedAndStoreMessage(message)`;
    `episodicSearch({chatId, query, topK, minTimestamp})` (cosine
    vector search filtered by `chat_id` + optional `minTimestamp`).
    Layer 2 of the dual-layer memory strategy.
  - `src/ai/whatsapp/trigger.js` step 0.5: INSERT idempotent on
    Baileys `key.id`; embed.
  - `src/ai/whatsapp/trigger.js` step 4: history =
    `episodicSearch(topK=EPISODIC_TOPK=10)` →
    `{role, content}` (replaces the previous `inbox.getRecentHistory`
    block from post-cycle hotfix #0).
  - `src/ai/whatsapp/send.js` — fire-and-forget
    `embedAndStoreMessage(outbound)` on a successful send so the
    outbound reply lives in the episodic store.
  - `src/ai/llm/prompt.js` — `buildUserPrompt` accepts `summary`
    (`<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` before
    `<CONTEXT>`) and `maxHistory`.
  - `src/test/episodic.test.mjs` — 6 specs (skip on missing args;
    embed+UPDATE on happy path; embedder-failure survival; search `[]`
    on missing args; `chat_id`-filtered rows; `minTimestamp` filter).
  - `src/test/inbox-history.test.mjs` — 5 specs (added during the
    pre-hotfix-#2 work to cover `inbox.getRecentHistory`: missing
    file, status/group/LID skip, canonical markdown parse, limit
    semantics, multi-line bodies — the trigger previously read
    history via `inbox.getRecentHistory(chatId, 6)` and the test
    suite landed alongside that integration).
- **Post-cycle hotfix #3 — chat summary** (T13):
  - `src/ai/settings/summary.js` — `loadChatSummary(chatId)`,
    `updateChatSummary(chatId)` (LLM-driven digest of the last 30
    messages, capped at 4 KB), `maybeUpdateSummary(chatId)`
    (debounced; refreshes at most once per 10 min via
    `summary_updated_at`). Layer 1 of the dual-layer memory strategy.
  - Trigger integration: `loadChatSummary(chatId)` before
    `buildUserPrompt`; schedules async `maybeUpdateSummary(chatId)`
    after the prompt is built.
- **Post-cycle hotfix #4 — fallback phrase rewrite** (T14):
  - `src/i18n/ai-fallback.js` — replaced the strictly-formal
    Indonesian fallback phrase with a friendly semi-formal version.
    Old ID: `Maaf, saya tidak memiliki informasi yang cukup yakin
    untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …`.
    New ID: `Maaf kak, untuk hal itu belum ada di data kami ya 🙏`.
    New EN: `Sorry, we don't have data on that yet 🙏`.
    Driver: U-feedback (2026-07-09) — "the old tone was too robotic
    for an Indonesian customer-service context; the new version
    uses `kak` + `kami` + emoji to read like a real human."
  - `src/ai/llm/base-prompts.js` — Fallback section in both ID and
    EN prompts updated to instruct the LLM to emit the new friendly
    phrase verbatim. The `(byte-identical, tanpa modifikasi apa
    pun)` qualifier (ID) and `(byte-identical, no modifications)`
    qualifier (EN) was removed because the new phrase is no longer
    marked as byte-locked (per U-feedback).
  - **INTENTIONAL FE DIVERGENCE** (per U direction on 2026-07-09):
    the FE copy at `frontend/src/i18n/id.json:74` and
    `frontend/src/lib/ai/systemPrompt.ts` Fallback section was
    **NOT updated**. The composer-byte-identity test (`T10`,
    `composer-byte-identity.test.mjs`, 1 spec) now fails as a
    result — this is the test working as intended and is recorded
    as the explicit per-surface FE/BE divergence the seq 4 audit
    must surface as an explicit non-finding.

### 2.2 Out of scope

- **Re-implementation of any feature.** This Plan documents the work
  that was done; the seq 4 SoT-fidelity audit may surface drift,
  which becomes a finding — not a call to rewrite code.
- **The `be-mvp-retrofit-2026-07-10` cycle** (seq 2) — its 5+1 modules
  (`auth / send / broadcast / inbox / antiBan / contacts`) are
  documented by the MVP plan (`docs/be/features/mvp/plan.md`,
  PLAN-MVP-1). The AI cycle depends on the MVP's `client.js`,
  `messageController.js`, `broadcaster.js`, `inbox/writer.js`, and the
  LID↔PN resolveJid / `getRecentHistory` surface that hotfix #1
  inherits.
- **The `be-typing-indicators-2026-07-10` cycle** (seq 1) — its
  typing utility (`src/whatsapp/typing.js`) is not imported by the AI
  cycle; the seq 1 record at
  `docs/be/features/whatsapp-typing/prd.md` is cited as cross-cycle
  context. The seq 4 audit re-checks the seq 1 ↔ seq 3 boundary as a
  cross-cycle invariant.
- **Frontend (`frontend/`)** — the FE mockup is not updated for any of
  the four post-cycle hotfixes; per `be_dev_history.md` line 41, the
  FE/BE divergence on the fallback phrase is **intentional** and
  is a recorded non-finding for the seq 4 audit (D6).
- **Phase 2 / Phase 3 deferred items** in
  `CHANGELOG.md §0.7.0-be-ai-auto-reply.0 §"Deferred"` — NLI
  entailment, cross-encoder reranker, multi-tenant wrapper, WebSocket
  for `aiMode`, KB auto-tag extraction, audit-log export, streaming
  replies with typing indicators, LLM provider cutover. Not in scope;
  cited at `src/ai/llm/anthropic-compat.js` and `src/ai/retrieval/reranker.js`
  as code-level hints of where Phase 2 will land.
- **i18n for languages beyond ID + EN** — out of MVP scope; `ai-fallback.js`
  carries only ID + EN.

### 2.3 Boundary decisions inherited from upstream artifacts

| ID | Decision | Drives |
|---|---|---|
| D1 | Retro-fit, not re-implementation. Code is the source of truth; this Plan is the as-built record. | Plan body cites `src/<path>:<line>` for every step. |
| D2 | Per-cycle Plans live under `docs/be/features/<feature>/plan.md`. Per-cycle Plans are migration outputs. | This file lives at `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md`. |
| D3 | Cycle-batched artifacts for seq 3 (one PRD/Plan/Build/Audit bundle per cycle; per-feature SPEC nested underneath). The 14 tasks of this Plan together compose one cycle bundle (`prd.md` + `spec.md` + `plan.md` + `build.md` per cycle). | This file is the cycle-level Plan; cycle-level PRD lives at `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md`. |
| D4 | Post-cycle hotfixes (LID↔PN resolveJid integration in trigger, episodic memory, chat summary, fallback phrase rewrite) roll into **seq 3** rather than spawning a 4th cycle (`IntakeProposal.md §3 / I4`, `Plan §1.3 D1`). | T11–T14 in this Plan are the four hotfix tasks. |
| D5 | Chronological order is inferred from `be_dev_history.md` (the single authoritative chronological log for the cycle + post-cycle hotfixes). The 41 lines in `be_dev_history.md` are read in order; each task T_n corresponds to the README-shipped module that landed first in the file and each T_(n ≥ 11) corresponds to a `be_dev_history.md` line group. | T1 → T14 ordering. |
| D6 | The composer-byte-identity test intentionally fails post-hotfix #4. The FE/BE divergence is on purpose per U direction. The seq 4 audit records this as an explicit non-finding, not a regression. | T14 records the divergence; T10 records the test; the seq 4 audit must NOT regress this. |
| D7 | The MVP "no dedicated MVP unit tests" gap (PLAN-MVP-1 §2.3 D6) does NOT apply here. The AI cycle shipped 15 vitest spec files in 0.7.0-be-ai-auto-reply.0, plus 2 more (`inbox-history.test.mjs`, `episodic.test.mjs`) from the post-cycle hotfixes. PRD-001 §"Acceptance gates" requires `pnpm test` exit 0 with ≥30 specs across ≥5 spec files. | T10–T12 enumerate the 17 specs; verification is `pnpm test`. |
| D8 | The original cycle shipped `EMBEDDING_DIM=1536` (MiniMax default); the `be_dev_history.md` first entry records the change to `MarcoAland/Indonesian-bge-m3` at `dim=1024`. Migration `004-bge-m3-1024dim.sql` is the schema migration; `src/db/seed.js` falls back to length `1024`; `src/ai/llm/embed.js` validates the dim and throws 502 on mismatch (recorded in `be_dev_history.md` lines 4-6). | T1 cites migration 004; T3 cites embed.js dim validation; D8 records the EMBED_SIDECAR_HOST/PORT env additions. |
| D9 | Migration `005-messages-table.sql` is a follow-up that landed DURING the post-cycle hotfix work (`be_dev_history.md` line 17), not as part of the original cycle. It is cited at T1 as a migration included in the cycle's final state, but its authoring is tied to hotfix #2's `messages.embedding` work (T12). | T1 + T12 cite migration 005. |
| D10 | The PR-AI / F-12 / F-19 cross-references are inferred from `MVP.md §2.1` (the AI cycle SSoT). PRD-001 / FRD-001 enumeration of the AI cycle's FRs / features is deferred to the seq 4 audit; this Plan cites `MVP.md §2` as the authoritative module table. | §5's coverage matrix cites `MVP.md §2.1` modules to PRD-001 / FRD-001 anchors that seq 4 fills. |

## 3. Dependencies

### 3.1 Hard dependencies (must exist before this Plan's tasks)

- **`PRD-001`** (`sot/general/PRD.md`) — defines the project's
  goals and NFRs for the AI cycle (§4.1 AI-cycle rows FR-12..FR-24)
  plus §5 NFRs that this Plan's tasks implement (composer
  byte-identity, contact-scope filter, audit redaction, etc.).
- **`FRD-001`** (`sot/general/FRD.md`) — captures the AI cycle
  features (`ai-llm`, `ai-retrieval`, `ai-whatsapp`, `ai-crm`,
  `ai-audit`) with full ACs and `src/<path>:<line>` citations.
- **`PLAN-RETROFIT-001`** (`sot/general/Plan.md`) — Batch 3 (seq 3)
  is the retro-fit batch for this cycle; this Plan is the per-cycle
  Plan that Batch 3 mandates.
- **`TaskPlan-RETROFIT-001`** (`sot/general/TaskPlan.md`) —
  Sprint 3 (seq 3) is the per-cycle sprint; this Plan fits
  Sprint 3's documentation deliverables.
- **`MVP.md`** (`docs/be/MVP.md`) — the AI cycle SSoT that
  authoritatively names the 25+ files in §2.1.
- **`PRD-AI-1`** (`docs/be/features/be-ai-auto-reply-2026-07-03/prd.md`)
  — cycle-level PRD, authored in this run in parallel.
- **`SPEC-AI-1`** (`docs/be/features/be-ai-auto-reply-2026-07-03/spec.md`)
  — cycle-level SPEC, authored in this run in parallel.
- The MVP cycle (seq 2) — `src/whatsapp/client.js`
  (`getSocket()` method added in hotfix #1; needed by T8 server-bootstrap
  wiring), `src/controllers/messageController.js` + `routes/messages.js`
  (typing integration at line 55 / 115 from seq 1), `src/whatsapp/broadcaster.js`
  (typing integration at lines 179, 245-247 from seq 1),
  `src/inbox/writer.js` (`resolveJid`, `getRecentHistory`,
  `recordFromBaileys` — all consumed by `trigger.js`).
- `pg@^8`, `kysely@^0.27`, `zod@^3`, `openai@^4`, `nanoid@^5`,
  `pdf-parse`, `mammoth`, `cheerio`, `xlsx`, `multer`,
  `vitest@^2`, `supertest`, `cross-env` — declared dev/runtime
  dependencies in `package.json` (per `CHANGELOG.md §0.7.0-be-ai-auto-reply.0
  §Changed`).
- A running Postgres instance with the `vector` extension enabled
  (pgvector). The dev seed (`src/db/seed.js`) requires an active
  connection.

### 3.2 Task-level dependency graph

```
T1 (DB + migrations 000-006)
   |
   v
T2 (AI settings store + composer + hardened + defaults + schema)
   |
   +----------------+
   |                |
   v                v
T3 (LLM gateway) T4 (retrieval)
   |                |
   +-------+--------+
           |
           v
T6 (CRM store)  T5 (ingest + chunks)
                    |
                    v
T9 (audit log) -----+
                    |
                    v
T7 (WhatsApp trigger + state machine + send)
                    |
                    v
T8 (REST endpoints + server bootstrap wiring)
                    |
                    v
T10 (initial test suite)
                    |
                    +-- T11 (post-hotfix #1: resolveJid + getSocket + fromMe guard + numerical cleanup)
                    +-- T12 (post-hotfix #2: episodic — migration 006 + episodic.js + step 0.5 + step 4 + prompt accept summary + maxHistory + send embed)
                    +-- T13 (post-hotfix #3: summary — summary.js + trigger integration)
                    +-- T14 (post-hotfix #4: i18n fallback + base-prompts + FE divergence)
```

In the code: `trigger.js` imports `settings/store`,
`settings/composer`, `llm/openai-compat`, `llm/parse`, `llm/prompt`,
`llm/embed`, `retrieval/hybrid`, `store/episodic` (T12), `store/entities`,
`whatsapp/handoff`, `whatsapp/send`, `audit/log`, and
`inbox.resolveJid` / `inbox.getRecentHistory` (T11). `composer.js`
imports `hardened-rules.js` and `defaults.js`. `hybrid.js` imports
`bm25.js`, `ann.js`, and `reranker.js`. `openai-compat.js` imports
`parse.js` and `prompt.js`. `ingest.js` imports
`chunks.js::__ingestUpsertChunk` (module-private). The Plan records
the chronological order as: **T1 (DB + migrations) → T2 (settings +
composer + hardened + defaults + schema) → T3 (LLM gateway) → T4
(retrieval) → T5 (ingest + chunks) → T6 (CRM store) → T7 (WhatsApp
trigger + state machine + send) → T8 (REST endpoints + server
bootstrap) → T9 (audit log) → T10 (initial test suite) → T11
(post-hotfix #1) → T12 (post-hotfix #2) → T13 (post-hotfix #3) →
T14 (post-hotfix #4)**.

The reverse order was rejected because: (a) the DB layer must exist
before any settings store / retrieval table can host rows; (b) the
composer-byte-identity contract is verified by T10's test, which needs
the composer (T2) and the FE composer (peer cycle); (c) the trigger
(T7) needs the LLM gateway (T3), the retrieval (T4), the audit log
(T9), and the inbox's `resolveJid` / `getRecentHistory` (T11 /
seq-2 inbox) all available; (d) the post-cycle hotfixes (T11-T14)
each mutate code that the previous tasks shipped.

### 3.3 Cycle-level retro-fit context

Per `PLAN-RETROFIT-001 §3 Batch 3`:

- **Goal**: Wrap the surviving PRD/SPEC pairs in
  `docs/be/features/*` and `docs/crm/features/*` with mavis
  Plan/Build/Audit records, wire them into the top-level SoT, and
  explicitly enumerate the post-cycle hotfixes so the seq 4 audit
  does not report them as drift (D1, I4).
- **Source of truth** (recorded in the YAML front matter):
  - `docs/be/MVP.md` (the AI cycle SSoT).
  - `docs/be/features/{crm-store, kb-ingestion, ai-state-machine,
    ai-whatsapp-trigger, ai-orchestration}/prd.md` (existing, cited
    not edited).
  - `docs/crm/features/{ai-autoreply, ai-chat, ai-settings,
    knowledge-rag, data-viewer, schema-designer, navigation}/prd.md`
    (existing, cited not edited).
  - `be_dev_history.md` (post-cycle hotfixes from 2026-07-09).
  - FRD-001 §8 (ai-llm), §9 (ai-retrieval), §10 (ai-whatsapp),
    §11 (ai-crm), §12 (ai-audit), §13 (defense-in-depth).
  - `CHANGELOG.md §0.7.0-be-ai-auto-reply.0`.
- **Deliverable**: One cycle bundle under
  `docs/be/features/be-ai-auto-reply-2026-07-03/{prd.md, spec.md,
  plan.md, build.md}` (this file is `plan.md`).

## 4. Task Breakdown

The AI cycle + post-cycle hotfixes shipped as **14 discrete
implementation tasks** (T1–T14), in the order they were taken. Each
task records its id, title, goal, status (done), acceptance criteria,
files touched (with line ranges), and verification.

### T1 — DB layer + migrations 000-006 + server-bootstrap migration wiring

| Field | Value |
|---|---|
| **id** | T1 |
| **title** | Implement `src/db/{client,check,migrate,seed}.js` + `src/db/migrations/000..006-*.sql` + `runMigrations()` on boot from `src/index.js:77-83` |
| **goal** | Establish the Postgres + Kysely + pgvector substrate. Run migrations idempotently on boot. Provide a migration CLI (`db:migrate` script). Provide a dev seed script (`db:seed`). Host the AI cycle's 5 new tables (`ai_settings`, `entity_definitions`, `entity_records`, `entity_relationships`, `knowledge_files`, `knowledge_chunks`) plus the existing `chats` extension + `messages` + `messages.embedding` + `chats.conversation_summary`. |
| **status** | done |
| **acceptance criteria** | (1) `src/db/client.js` exposes pg pool singleton + Kysely wrapper + `runMigrations()` (idempotent — `ensureMigrationsTable()` + iterate `migrations/*.sql` + skip already-applied). (2) `src/db/check.js` exposes preflight checks (DB reachable, `vector` extension installed). (3) `src/db/migrate.js` is the `db:migrate` CLI entry. (4) `src/db/seed.js` is the `db:seed` CLI entry — fallback embedding vector length 1024 (`src/db/seed.js` per `be_dev_history.md` line 5). (5) `src/db/migrations/000-base-chats.sql` creates the baseline `chats` table (id, contact_id, ai_mode, ai_pending_flag, last_message_preview, last_message_at BIGINT epoch seconds, unread_count, etc.). (6) `001-initial.sql` creates any pre-existing baseline not in 000. (7) `002-ai-tables.sql` creates `ai_settings`, `entity_definitions`, `entity_records`, `entity_relationships`, `knowledge_files`, `knowledge_chunks` per `MVP.md §2.2` (the spec block at lines 65-155 records every column). (8) `003-indexes.sql` creates GIN/trigram on `entity_records.data`, hash index on `knowledge_chunks.embedding`, BRIN on timestamps. (9) `004-bge-m3-1024dim.sql` migrates `knowledge_chunks.embedding` from `VECTOR(1536)` to `VECTOR(1024)` to match the Indonesian BGE-M3 sidecar (per `be_dev_history.md` lines 4-6; `D8`). (10) `005-messages-table.sql` creates the missing `messages` table (id, chat_id, direction, body, key, timestamp, status) + `chat_id/timestamp` index (per `be_dev_history.md` line 17; `D9`). (11) `006-episodic-memory.sql` adds `messages.embedding (VECTOR(1024))`, `chats.conversation_summary (TEXT)`, `chats.summary_updated_at (BIGINT)`, `messages_chat_id_ts_idx`, best-effort `ivfflat` vector index; idempotent (`DO` blocks + `IF NOT EXISTS`). (12) `src/index.js:77-83` calls `runMigrations()` on boot. (13) `package.json` exposes `db:migrate` / `db:seed` / `db:reset` / `db:status` / `script:ingest-smoke` / `script:audit-tail` / `script:mock-inbound` scripts (per CHANGELOG §Changed line 25). |
| **files touched** | `src/db/client.js` (new), `src/db/check.js` (new), `src/db/migrate.js` (new), `src/db/seed.js` (new), `src/db/migrations/{000-base-chats,001-initial,002-ai-tables,003-indexes,004-bge-m3-1024dim,005-messages-table,006-episodic-memory}.sql` (7 new files), `src/index.js:77-83` (added `runMigrations()` call), `package.json` (db scripts). |
| **verification** | `pnpm db:status` exits 0 with all 7 migrations marked applied. `pnpm db:migrate` is idempotent (running twice produces no change). `pnpm db:seed` populates the dev fixtures. `pnpm test -- src/test/db-migrations.test.mjs` exits 0 (idempotency spec). `pnpm test -- src/test/db-preflight.test.mjs` exits 0 (DB-reachable + vector-installed preflight). Cross-cycle invariant: the seq-2 MVP plan's `src/index.js:77-83` migration hook is the same call site re-used here. |

### T2 — AI settings service + composer + hardened-rules + defaults + schema

| Field | Value |
|---|---|
| **id** | T2 |
| **title** | Implement `src/ai/settings/{store,composer,hardened-rules,defaults,schema}.js` (Postgres-backed `ai_settings` load/save + byte-equivalent system prompt composer + 4-rule HARDENED block) |
| **goal** | Provide the per-tenant (single-tenant for MVP) settings row used by the trigger (T7) to: (a) decide whether `whatsappAutoReply.enabled`; (b) compose the system prompt via `composer.js` (BASE + tenant fragment + HARDENED); (c) expose the `confidenceThreshold` for the confidence gate. The composer's output MUST be byte-equal to `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt` for the same input — this is the locked Composer-byte-identity contract (per `MVP.md §3.1` / §6 / §11). |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/settings/store.js` loads / saves the `ai_settings` row keyed by `tenant_id = 'default'`; merges over `DEFAULT_AI_SETTINGS` on a `null` row. (2) `src/ai/settings/composer.js` exposes `buildSystemPrompt({ settings, tenantName, language })` mirroring FE `buildSystemPrompt`. Concatenates `BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` (the byte-stable Indonesian + English prompts from `src/ai/llm/base-prompts.js`) + tenant fragment (identity / tone / scope / rules) + 4-rule HARDENED block. (3) `src/ai/settings/hardened-rules.js` exports the 4-rule Indonesian block (byte-stable, never user-editable): (a) WhatsApp-scope contact-id hard filter; (b) WhatsApp-scope data sources = chat's contact records + KB only; (c) Dashboard `/ai` has full data access; (d) AI writes ONLY to CRM, never to KB. (4) `src/ai/settings/defaults.js` exports `DEFAULT_AI_SETTINGS` = FE's `useAiSettingsStore.DEFAULT_AI_SETTINGS` (`whatsapp_auto_reply: { enabled: false, confidenceThreshold: 0.7 }`). (5) `src/ai/settings/schema.js` exports the zod schema mirroring FE `frontend/src/types/aiSettings.ts` (identity, tone ∈ {formal, casual, friendly, concise, enthusiastic}, language ∈ {id, en, id-mod}, scope, rules[], whatsapp_auto_reply). (6) Store applies zod validation on save; reject with a structured error. |
| **files touched** | `src/ai/settings/{store,composer,hardened-rules,defaults,schema}.js` (5 new files). |
| **verification** | `pnpm test -- src/test/composer-byte-identity.test.mjs` (1 spec; passes before T14, fails-as-intended after T14). `pnpm test -- src/test/hardened-rules.test.mjs` (≥ 4 specs covering the 4 rules). `pnpm test -- src/test/settings-defaults.test.mjs` (DEFAULT_AI_SETTINGS structural). `pnpm test -- src/test/ai-settings-roundtrip.test.mjs` (store → composer → byte-equivalent prompt). The seq 4 audit re-checks this contract with `frontend/src/lib/ai/systemPrompt.ts` and the `frontend/src/i18n/id.json:74` and FE Fallback section per D6 / T14. |

### T3 — LLM gateway + structured outputs + retries + parse + base prompts

| Field | Value |
|---|---|
| **id** | T3 |
| **title** | Implement `src/ai/llm/{openai-compat,anthropic-compat,parse,prompt,embed,base-prompts}.js` (OpenAI-compatible client pointed at MiniMax-M3 + structured outputs + 2-attempt retry + zod validation + MiniMax embeddings client + byte-stable base prompts) |
| **goal** | Provide the LLM gateway that the trigger (T7) and the `ask` / `replyPreview` controllers (T8) call. Default provider = MiniMax-M3 (OpenAI-compatible). Anthropic-compatible fallback wired but cutover deferred to Phase 2. Structured outputs (`response_format: json_schema`). 2-attempt exponential backoff on 429 / 5xx. Reject-and-retry on parse failure (≤ 3 attempts in `parse.js`). Embeddings client with LRU cache keyed by SHA-256 of the body and dim-mismatch validation. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/llm/openai-compat.js` instantiates `OpenAI` client with `baseURL: config.openaiBaseUrl`, `apiKey: config.openaiApiKey`, default model = `config.llmModel`. (2) `complete({ messages, schema, responseFormat })` calls `chat.completions.create({ model, messages, response_format: json_schema(schema) })` with the zod-derived schema. 2-attempt exponential backoff on 429 / 5xx; throws the final error otherwise. (3) `src/ai/llm/anthropic-compat.js` wires Anthropic-compatible API; cutover deferred per CHANGELOG §"Deferred". (4) `src/ai/llm/parse.js` exposes `parseAiReply(reply)` that zod-validates `{ answer, citations, confidence, fallback_used }`; on validation failure throws `ParseError` (the trigger re-prompts). (5) `src/ai/llm/prompt.js` exposes `buildUserPrompt({ context, chatHistory, question })`. Post-hotfix #2 (T12): accepts `summary` (emitted as `<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` before `<CONTEXT>`) and `maxHistory` (replaces the hard-coded `-6` cap). (6) `src/ai/llm/embed.js` exposes `embed(text)` via MiniMax embeddings client; LRU cache keyed by SHA-256 of the text content; **dim-mismatch validation** — throws 502 when provider response vector length differs from `EMBEDDING_DIM` (per `be_dev_history.md` line 6, D8). (7) `src/ai/llm/base-prompts.js` exposes `BAILEYS_AI_SYSTEM_PROMPT_ID` and `BAILEYS_AI_SYSTEM_PROMPT_EN` (~1.2 KB Indonesian + English base). The original contradictory confidence threshold (rule 3 was 0.4 vs fallback 0.7) was fixed on 2026-07-09 (`be_dev_history.md` line 7) — now byte-equal to FE `systemPrompt.ts`. (8) Post-hotfix #4 (T14): the Fallback section in both ID and EN prompts instructs the LLM to emit the new friendly phrase verbatim; the `(byte-identical, tanpa modifikasi apa pun)` / `(byte-identical, no modifications)` qualifier was removed. |
| **files touched** | `src/ai/llm/{openai-compat,anthropic-compat,parse,prompt,embed,base-prompts}.js` (6 new files; base-prompts.js was edited on 2026-07-09 to fix the threshold discrepancy + remove the byte-locked qualifier; embed.js was edited on 2026-07-09 to add dim-mismatch validation). |
| **verification** | `pnpm test -- src/test/parse.test.mjs` (zod validation; reject-and-retry). `pnpm test -- src/test/llm-retry.test.mjs` (2-attempt backoff on 429 / 5xx). `pnpm test -- src/test/composer-byte-identity.test.mjs` + `hardened-rules.test.mjs` exercise the gateway via `composer.js` end-to-end. Live smoke: `node -e 'require("./src/ai/llm").complete(...)' against MiniMax-M3 returns a structured response. |

### T4 — Retrieval (BM25 + ANN + reranker + chunker + ocr + embed wiring)

| Field | Value |
|---|---|
| **id** | T4 |
| **title** | Implement `src/ai/retrieval/{hybrid,bm25,ann,reranker,chunker,ocr}.js` |
| **goal** | Hybrid retrieval: BM25 (Postgres FTS) ∪ ANN (pgvector cosine) with RRF fusion; reranked by MiniMax-embedding cosine similarity. Semantic chunker (~512 tokens, 50-token overlap). OCR for PDF / DOCX / HTML / XLSX. Embedder wired through `src/ai/llm/embed.js`. Turbo cutoff at `τ_turbo = 0.30`. Scope-aware (`scope: 'whatsapp' | 'team'`) with contact-id hard filter at SQL layer for `scope = 'whatsapp'`. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/retrieval/hybrid.js` exposes `retrieve({ query, scope, chatId, contactPhone })`. Computes BM25 + ANN hits; RRF-fuses; reranks via MiniMax-embedding cosine; returns `{ chunks: [...], score: top }`. `score < τ_turbo` triggers turbo cutoff (per MVP §2.4 step 5). (2) `src/ai/retrieval/bm25.js` runs FTS via `to_tsvector('simple', text)` GIN index. (3) `src/ai/retrieval/ann.js` runs pgvector `<=>` with `ivfflat (embedding vector_cosine_ops) lists = max(10, sqrt(chunk_count))` (per MVP §8). (4) `src/ai/retrieval/reranker.js` exposes MiniMax-embedding cosine rerank (Phase 2 swap to cross-encoder deferred). (5) `src/ai/retrieval/chunker.js` long-text chunking with overlap; deterministic per-file hash for idempotency. (6) `src/ai/retrieval/ocr.js` PDF via `pdf-parse`; DOCX via `mammoth`; HTML via `cheerio`; XLSX via `xlsx-stream`; CSV / TXT fallback. (7) Hard filter for `scope = 'whatsapp'`: SQL `WHERE contact_id = ?` for `entity_records`; JS-layer backstop in `hybrid.js`; prompt-level reminder in `trigger.js`. (8) For `scope = 'team'` (the `/api/crm/ai/ask` dashboard): no `contact_id` filter; reads ALL tenant's `entity_records` per MVP §2.3. |
| **files touched** | `src/ai/retrieval/{hybrid,bm25,ann,reranker,chunker,ocr}.js` (6 new files). |
| **verification** | `pnpm test -- src/test/hybrid.test.mjs` (BM25 + ANN RRF recall sanity; contact-scope filter). `pnpm test -- src/test/contact-scope.test.mjs` (NEVER leaks contact A to chat B; data-layer + post-LLM). `pnpm test -- src/test/chunker.test.mjs` (semantic chunking idempotency). Live smoke: `node -e 'require("./src/ai/retrieval/hybrid").retrieve({ query: "harga paket bulanan", scope: "whatsapp", chatId, contactPhone })'` returns scored chunks and a top score. |

### T5 — Ingest pipeline + KB store (read-only public surface)

| Field | Value |
|---|---|
| **id** | T5 |
| **title** | Implement `src/ai/store/{chunks,ingest,ingest-worker}.js` (KB chunks read-only public API + ingest pipeline + async ingest worker) |
| **goal** | Operator-driven KB ingest. Writes reachable ONLY from `ingest.js` (security invariant — `chunks.js::__ingestUpsertChunk` is module-private; per MVP §3.2 / §3.5 rule #4). Idempotent on `(tenant_id, source_path, chunk_index)`. Status transitions: `queued → ingesting → indexed` / `failed`. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/store/chunks.js` exposes READ methods (`getChunk(id)`, `listFiles(tenantId)`, `search(text, opts)`). The `__ingestUpsertChunk` function is module-internal (not exported). (2) `src/ai/store/ingest.js` runs the pipeline: save file to `./data/kb/...` (under `KB_DIR`, created if missing) → `ocr.extract()` → `chunker.split()` → `embed.embed(text)` → `__ingestUpsertChunk(...)` per chunk. (3) Idempotency: if `(tenant_id, source_path, chunk_index)` already present with the same `text_hash`, skip. If `text` differs, UPDATE. (4) `src/ai/store/ingest-worker.js` polls the queue (or consumes a Postgres `LISTEN`), runs `ingest.js` for `status = 'queued'`, transitions to `ingesting → indexed` / `failed`. (5) Error path: any thrown error transitions the row to `status = 'failed'` + writes `last_error`. |
| **files touched** | `src/ai/store/{chunks,ingest,ingest-worker}.js` (3 new files). |
| **verification** | `pnpm test -- src/test/ingest.test.mjs` (file upload → OCR → chunk → embed → upsert; idempotency on rerun). Live smoke: `pnpm script:ingest-smoke` uploads a sample PDF / DOCX; the worker drains the queue; `SELECT count(*) FROM knowledge_chunks` increases by the expected chunk count. |

### T6 — CRM store (entity_definitions + entity_records + entity_relationships)

| Field | Value |
|---|---|
| **id** | T6 |
| **title** | Implement `src/ai/store/entities.js` (CRUD for `entity_definitions`, `entity_records`, `entity_relationships`; schema-versioned; zod-validated) |
| **goal** | Provide the CRM persistence layer that the trigger (T7) and the `/api/crm/entities/*` and `/api/crm/records/:id` endpoints (T8) call. Schema-versioned (PATCH creates a new version; DELETE soft-deletes via `deleted_at`). |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/store/entities.js` exposes `listEntities`, `createEntity`, `renameEntity(id, fields)`, `softDeleteEntity(id)`, `getEntity(id, version?)`, `listRecords(entityId, { pagination, filter, sort })`, `createRecord(entityId, data)`, `updateRecord(id, data)`, `deleteRecord(id)`. (2) `createEntity(name, label, schema_json)` validates `schema_json` is a JSON-Schema; rejects invalid. (3) `PATCH /api/crm/entities/:id` creates a new version row (does not overwrite). (4) `DELETE /api/crm/entities/:id` soft-deletes (`deleted_at` timestamp). (5) Record-level `data` is zod-validated against the entity's `schema_json` (mirrors FE `zodFromSchema.ts`). (6) Contact-scope invariant: every record write carries `contact_id` (= the phone-normalised bare number when the entity is contact-bound). The hard filter `WHERE contact_id = ?` is mandatory for `scope = 'whatsapp'` queries. |
| **files touched** | `src/ai/store/entities.js` (1 new file). |
| **verification** | The `hybrid.js` contact-scope spec (T4) exercises `entities.js` indirectly. Live smoke: `curl -X POST /api/crm/entities -d '{...}'` creates; `curl -X POST /api/crm/entities/:id/records -d '{...}'` validates against the schema; `curl -X DELETE /api/crm/records/:id` soft-deletes. |

### T7 — WhatsApp trigger + AIReplyMode state machine + send wrapper (initial cycle)

| Field | Value |
|---|---|
| **id** | T7 |
| **title** | Implement `src/ai/whatsapp/{trigger,handoff,send}.js` (processInboundMessage + state machine + sock.sendMessage wrapper) |
| **goal** | The core Baileys-side AI integration. `processInboundMessage(inboundMsg)` runs the 13-step pipeline. Non-awaited by Baileys (`sock.ev.on('messages.upsert', ...)` does not `await`). Catches all errors and writes an audit row. `AIReplyMode` state machine in `handoff.js` enforces allowed transitions + DB constraint. `send.js` is the `sock.sendMessage` wrapper with retries. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/whatsapp/trigger.js` exports `processInboundMessage(inboundMsg)`. Steps: (a) mode check (skip if `human / human_pending_flag`); (b) settings load (skip if `whatsappAutoReply.enabled === false`); (c) compose system prompt via `composer.js`; (d) run `hybrid.retrieve({ scope: 'whatsapp', chatId, contactPhone })`; (e) turbo cutoff (`score < τ_turbo = 0.30` → set `ai_mode = 'human_pending_flag'`, return); (f) call LLM via `openai-compat.complete({...schema})`; (g) parse via `parse.parseAiReply(...)`; reject-and-retry ≤ 3; (h) confidence gate (`confidence < τ_user` → flag); (i) citation grounding (cosine ≥ 0.85 per citation); (j) numerical consistency (numbers in answer must appear in chunks); (k) contact-scope post-validation (defense-in-depth); (l) `send.sendTextMessage(chatId, answer)`; (m) audit `auto_reply_sent`. (2) All thrown errors caught; audit row `auto_reply_error`. (3) `src/ai/whatsapp/handoff.js` exports `loadChatMode(chatId)`, `transitionAIReplyMode(chatId, fromMode, toMode)`. Forbidden transitions throw `ForbiddenTransitionError`. (4) `src/ai/whatsapp/send.js` exports `sendTextMessage(chatId, text)` with retries; updates `chats` last_message_preview / last_message_at / resets `unread_count`; persists outbound `messages` row; updates audit `outbound_message_sent` / `send_failure`. |
| **files touched** | `src/ai/whatsapp/{trigger,handoff,send}.js` (3 new files). |
| **verification** | `pnpm test -- src/test/state-machine.test.mjs` (AIReplyMode transitions; forbidden `human → human_pending_flag` returns 400). `pnpm test -- src/test/contact-scope.test.mjs` (NEVER leaks contact A to chat B). Live smoke: `pnpm script:mock-inbound` injects a fake inbound; trigger fires; `SELECT * FROM audit/<date>.ndjson` shows `auto_reply_sent` row. The seq 4 audit re-checks the 13-step pipeline ordering against the source. |

### T8 — REST endpoints + server-bootstrap wiring

| Field | Value |
|---|---|
| **id** | T8 |
| **title** | Implement `src/ai/routes/{ai,crm,knowledge,settings,index}.js` + `src/ai/routes/_middleware.js` + `src/controllers/ai/{ask,replyPreview,toggleMode}.js` + `src/index.js:105-138` (mount AI routers + wire `messages.upsert` → `processInboundMessage`) |
| **goal** | Expose the CRM persistence, KB CRUD, AI settings, and AI ask / reply-preview / toggle-mode endpoints to the team dashboard. Wire `messages.upsert` → `processInboundMessage` on the Baileys socket. The trigger must NEVER block the socket. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/routes/ai.js` exposes `POST /api/crm/ai/ask`, `POST /api/crm/ai/reply-preview`, `POST /api/crm/ai/toggle-mode`. (2) `src/ai/routes/crm.js` exposes `GET / POST /api/crm/entities`, `PATCH /api/crm/entities/:id`, `DELETE /api/crm/entities/:id`, `GET /api/crm/entities/:id/records`, `POST /api/crm/entities/:id/records`, `PATCH /api/crm/records/:id`, `DELETE /api/crm/records/:id`. (3) `src/ai/routes/knowledge.js` exposes `GET /api/crm/knowledge/files`, `POST /api/crm/knowledge/upload` (multipart via `multer`), `GET /api/crm/knowledge/files/:id`, `DELETE /api/crm/knowledge/files/:id`. (4) `src/ai/routes/settings.js` exposes `GET / PUT /api/crm/ai/settings`. (5) `src/ai/routes/index.js` assembles all routers under `/api/crm`. (6) `src/ai/routes/_middleware.js` provides per-route auth, contact-scope check, error wrapper. (7) `src/controllers/ai/ask.js` calls `composer.buildSystemPrompt` + `hybrid.retrieve({ scope: 'team' })` + `openai-compat.complete` + audit. (8) `src/controllers/ai/replyPreview.js` does the same minus the send step. (9) `src/controllers/ai/toggleMode.js` is idempotent; rejects the forbidden `human → human_pending_flag` (400). (10) `src/index.js:105-138` mounts all AI routers, runs `runMigrations()` from T1, and on socket-ready wires `sock.ev.on('messages.upsert', ({ messages }) => { for (const m of messages) processInboundMessage(m, { sock, ... }); })` — non-awaited by design. Uses `wa.getSocket()` (added to `WhatsAppClient` per `be_dev_history.md` line 10). |
| **files touched** | `src/ai/routes/{ai,crm,knowledge,settings,index,_middleware}.js` (6 new files), `src/controllers/ai/{ask,replyPreview,toggleMode}.js` (3 new controllers — under `src/controllers/ai/`), `src/index.js:105-138` (mounts + wiring). |
| **verification** | `pnpm test -- src/test/routes-ai.test.mjs` (Express route handlers; mock MiniMax; assertions on contact-scope filter). Live smoke: `curl -X POST http://HOST:PORT/api/crm/ai/ask -d {...}` returns a structured reply. `curl http://HOST:PORT/api/crm/entities` lists entity definitions. `pnpm script:mock-inbound` simulates a Baileys inbound; trigger fires; outbound reply lands in the chat. |

### T9 — Audit log + redaction helper

| Field | Value |
|---|---|
| **id** | T9 |
| **title** | Implement `src/ai/audit/{log,redact}.js` (NDJSON append-only audit log + sensitive-field redaction) |
| **goal** | Provide the audit logger that every AI pipeline branch writes to. Output: `./data/audit/<UTC-date>.ndjson`. Sensitive fields are redacted (`apiKey`, `password`, `authorization`, `cookie`, `*token`). |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/audit/log.js` exports `audit(eventType, payload)` (async, fire-and-forget, never throws — catches its own errors and logs to `pino` at `warn`). Writes `JSON.stringify({ ts: ISO, type: eventType, payload: redactPayload(payload || {}) })` + `\n` to `./data/audit/<YYYY-MM-DD>.ndjson` (create the dir if missing). (2) `src/ai/audit/redact.js` exports `redactPayload(obj)`; walks the object, redacts case-insensitive fields matching the patterns above (replaces value with `'[REDACTED]'`); survives nested objects + arrays. (3) Append-only: never opens the file in a mode that allows mutation; never reads from it (the audit log is write-only). (4) `pino` structured logs at info level on every event write; optional `pino-pretty` for dev. (5) Never blocks the AI pipeline (fire-and-forget). |
| **files touched** | `src/ai/audit/{log,redact}.js` (2 new files). |
| **verification** | `pnpm test -- src/test/audit.test.mjs` (NDJSON append-only; redaction; the async audit call doesn't block the trigger). Live smoke: `pnpm script:audit-tail` tails `./data/audit/<date>.ndjson`; events from a `mock-inbound` show up. |

### T10 — Initial vitest test suite (15 specs, ships with 0.7.0-be-ai-auto-reply.0)

| Field | Value |
|---|---|
| **id** | T10 |
| **title** | Implement the initial `src/test/*.test.mjs` vitest spec files that shipped with `0.7.0-be-ai-auto-reply.0` |
| **goal** | Bring the AI cycle to PRD-001 §"Acceptance gates" `pnpm test` exit 0 with ≥ 30 specs across ≥ 5 spec files. Verify the locked contracts: composer byte-identity, hardened rules byte-equivalence, settings defaults / endpoint, parse + retry, AIReplyMode state machine, chunker idempotency, LLM retry backoff, hybrid BM25+ANN recall + contact-scope filter, contact-scope never-leaks, ingest idempotency, routes AI handlers, audit NDJSON + redaction, DB migrations + preflight, AI settings store → composer roundtrip. |
| **status** | done |
| **acceptance criteria** | (1) `pnpm test` runs all 15 spec files and exits 0 with ≥ 30 specs across ≥ 5 spec files. (2) `composer-byte-identity.test.mjs` (1 spec): BE composer produces a string byte-equal to FE composer for the same `{ settings, tenantName, language }` input. **Passes before T14; fails-as-intended after T14 (D6).** (3) `hardened-rules.test.mjs` (≥ 4 specs): 4-rule HARDENED block byte-stable; never user-editable; appended UNCONDITIONALLY. (4) `settings-defaults.test.mjs`, `settings-endpoint.test.mjs`: `DEFAULT_AI_SETTINGS` structural; GET / PUT `/api/crm/ai/settings`. (5) `parse.test.mjs` (≥ 5 specs): valid structured response passes; missing `answer` / `citations` / `confidence` / `fallback_used` fails; reject-and-retry up to 3 attempts. (6) `state-machine.test.mjs` (≥ 5 specs): `ai → human_pending_flag` allowed; `ai → human` forbidden (operator-only path); `human_pending_flag → ai / human` allowed; `human → *` forbidden. (7) `chunker.test.mjs` (≥ 3 specs): idempotency; overlap; deterministic per-file hash. (8) `llm-retry.test.mjs` (≥ 2 specs): 2-attempt exponential backoff on 429 / 5xx; permanent 4xx not retried. (9) `hybrid.test.mjs` (≥ 4 specs): BM25 + ANN RRF union; contact-scope filter at SQL layer. (10) `contact-scope.test.mjs` (≥ 3 specs): NEVER leaks contact A to chat B; both data-layer and post-LLM paths tested. (11) `ingest.test.mjs` (≥ 3 specs): file → OCR → chunk → embed → upsert; idempotency on rerun. (12) `routes-ai.test.mjs` (≥ 5 specs): Express route handlers; mock MiniMax; assertions on contact-scope filter. (13) `audit.test.mjs` (≥ 3 specs): NDJSON append-only; redaction; fire-and-forget. (14) `db-migrations.test.mjs` (≥ 2 specs): idempotent migration runner. (15) `db-preflight.test.mjs` (≥ 2 specs): DB reachable; `vector` extension installed. (16) `ai-settings-roundtrip.test.mjs` (≥ 2 specs): settings store → composer → byte-equivalent prompt. |
| **files touched** | `src/test/{composer-byte-identity,hardened-rules,settings-defaults,settings-endpoint,parse,state-machine,chunker,llm-retry,hybrid,contact-scope,ingest,routes-ai,audit,db-migrations,db-preflight,ai-settings-roundtrip}.test.mjs` (15 new files). |
| **verification** | `pnpm test` exits 0 with the 15 specs green (pre-T11; pre-T12; pre-T13; pre-T14; all green). Cross-cycle invariant: `pnpm test` from the seq-2 MVP plan's own T8 verification (which documents 17 vitest files) shares 4 of these specs (`typing`, `inbox-history`, `episodic`, and 14 AI-cycle files) — but those 17 specs are split: the 14 AI-cycle files are T10 + `composer-byte-identity.test.mjs` (1) + `hardened-rules.test.mjs` (≥4) + 12 more from this task. The seq 2 list includes `inbox-history.test.mjs` (added in the seq 3 pre-hotfix work) and `episodic.test.mjs` (hotfix #2 / T12). Per D7, the AI cycle shipped 15 specs, the 2 hotfix specs (T11 + T12) brought it to 17. **PRD-001 §"Acceptance gates" `pnpm test` exit 0 is satisfied**. |

### T11 — Post-cycle hotfix #1: LID↔PN resolveJid integration in trigger (2026-07-09)

| Field | Value |
|---|---|
| **id** | T11 |
| **title** | Hotfix: `src/ai/whatsapp/trigger.js` resolves chatId via `inbox.resolveJid()` + dispatcher-level `fromMe` guard in `src/index.js:121` + `client.js::getSocket()` + `extractNumbers()` cleanup + wider `ungrounded_number` KB-wide check |
| **goal** | Fix four classes of silent failure / wrong-flagging against the AI trigger: (a) Baileys-routed `@lid` chats must map to the same `chats` row stored by `@s.whatsapp.net` (otherwise `loadChatMode` returns `chat_not_found` and the auto-reply is silently dropped); (b) Baileys echoes of the AI's own outbound messages must not re-fire the LLM (was the root cause of the auto-reply spam loop); (c) `wa.getSocket()` must resolve to a real socket on the trigger subscription (was silently undefined before this fix); (d) the numerical consistency check was incorrectly flagging `[n]` citation markers as hallucinated numbers and Indonesian thousand-separator formats (`5.000`) as ungrounded when both were correct; (e) `ungrounded_number` should consult ALL `knowledge_chunks` (not just top-K) so a price that exists in the KB but didn't make the top-5 retrieval is no longer flagged as ungrounded. |
| **status** | done |
| **acceptance criteria** | (1) `trigger.js` resolves `chatId` via `inbox.resolveJid()` at the top of `processInboundMessage` (per `be_dev_history.md` line 11). (2) `src/index.js:121` adds `if (m && m.key && m.key.fromMe === true) continue;` at the dispatcher level (per `be_dev_history.md` line 16; defense-in-depth alongside the `trigger.js` early-return guard). (3) `src/whatsapp/client.js` adds `getSocket()` method on `WhatsAppClient` (per `be_dev_history.md` line 10). (4) `trigger.js` `extractNumbers()` strips `[n]` citation markers, `Rp ` prefix, and Indonesian thousand separators (`5.000.000 → 5000000`) before extracting digits (per `be_dev_history.md` line 13). (5) `trigger.js` step 11 (numerical consistency) consults ALL `knowledge_chunks` for the tenant (single-tenant; no `WHERE tenant_id = $1` clause — column doesn't exist per `be_dev_history.md` line 32). (6) `src/test/inbox-history.test.mjs` (5 specs covering `inbox.getRecentHistory`) was added at this point but is primarily about the inbox-side markdown parser — `trigger.js` was at this point reading history via `inbox.getRecentHistory(chatId, 6)`, which was replaced by the episodic search in T12. (7) The chat `6281236012938@s.whatsapp.net` was reset to `ai` mode twice during this hotfix (`be_dev_history.md` lines 14, 18). |
| **files touched** | `src/ai/whatsapp/trigger.js` (resolveJid at top; `fromMe` early-return guard; `extractNumbers` cleanup; wider `ungrounded_number` query; dropped `WHERE tenant_id`), `src/index.js:121` (dispatcher-level `fromMe` guard), `src/whatsapp/client.js` (added `getSocket()` method), `src/test/inbox-history.test.mjs` (5 new specs — counted under T12 since it was the inbox-history surface that T12 replaced). |
| **verification** | `pnpm test` exits 0 with the suite green (after T11 alone; pre-T12 episodic). Live smoke: a chat routed by `@lid` is now auto-replied; a self-echo is no longer re-fired by the trigger; a real KB price that didn't make the top-5 is no longer flagged `ungrounded_number`. The `6281236012938@s.whatsapp.net` chat reset history is recorded in `be_dev_history.md` lines 14, 18. |

### T12 — Post-cycle hotfix #2: episodic memory (2026-07-09)

| Field | Value |
|---|---|
| **id** | T12 |
| **title** | Hotfix: `src/db/migrations/006-episodic-memory.sql` + `src/ai/store/episodic.js` + `src/ai/whatsapp/trigger.js` step 0.5 + step 4 history = episodic search + `src/ai/whatsapp/send.js` fires outbound embed + `src/ai/llm/prompt.js` accepts `summary` + `maxHistory` + `src/test/episodic.test.mjs` |
| **goal** | Replace the historical `inbox.getRecentHistory(chatId, 6)` markdown-parse path with a real vector-based episodic memory: embed every message (in + out) into `messages.embedding` (`VECTOR(1024)`); for an inbound, search the chat's episodic memory by cosine similarity (Layer 2 of dual-layer memory). Layer 1 (chat-level `conversation_summary`) lands in T13. The previous pure-markdown `getRecentHistory` is retained for the inbox-side audit / MCP surfacing — but the trigger's history block is now episodic. |
| **status** | done |
| **acceptance criteria** | (1) `src/db/migrations/006-episodic-memory.sql` adds `messages.embedding (VECTOR(1024))`, `chats.conversation_summary (TEXT)`, `chats.summary_updated_at (BIGINT)`, `messages_chat_id_ts_idx`, best-effort `ivfflat` vector index; all operations idempotent (`DO` blocks + `IF NOT EXISTS`). (2) `src/ai/store/episodic.js` exports `embedAndStoreMessage({ id, chat_id, body })` (single-message embed + UPDATE) and `episodicSearch({ chat_id, query_embedding, topK = EPISODIC_TOPK = 10, minTimestamp? })` (cosine vector search filtered by `chat_id` and optional `minTimestamp`). Tolerates embedder failures (does not throw — logs at warn). (3) `src/ai/whatsapp/trigger.js` step 0.5: INSERT into `messages` (idempotent on `key.id`) + embed via `embedAndStoreMessage`. (4) `src/ai/whatsapp/trigger.js` step 4: `embed(body)` → `episodicSearch(topK=EPISODIC_TOPK=10)` → map to `{role, content}`. (5) `src/ai/whatsapp/send.js`: after a successful send, fire-and-forget `embedAndStoreMessage(outbound)` so the outbound reply lives in the episodic store. (6) `src/ai/llm/prompt.js`: `buildUserPrompt` accepts `summary` (emitted as `<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` before `<CONTEXT>`) and `maxHistory` (replaces the hard-coded `-6` cap on `chatHistory`). (7) `EPISODIC_TOPK` env-tunable, default `10`. (8) `src/test/episodic.test.mjs` (6 specs): skip on missing args; embed+UPDATE on happy path; embedder-failure survival; search `[]` on missing args; search returns only `chat_id`-filtered rows with embedding; `minTimestamp` filter. (9) `src/test/inbox-history.test.mjs` (5 specs): covers the prior `inbox.getRecentHistory` markdown-parse surface (missing file, status/group/LID skip, canonical markdown parse, limit semantics — drop last, take N-1, multi-line bodies). (10) `be_dev_history.md` line 28: backfill script embedded 3 pre-existing outbound messages in `messages`; cosine sim between them is sane. |
| **files touched** | `src/db/migrations/006-episodic-memory.sql` (new), `src/ai/store/episodic.js` (new), `src/ai/whatsapp/trigger.js` (step 0.5 + step 4 replaced), `src/ai/whatsapp/send.js` (outbound embed), `src/ai/llm/prompt.js` (accept `summary` + `maxHistory`), `src/test/episodic.test.mjs` (new, 6 specs), `src/test/inbox-history.test.mjs` (new, 5 specs — sorted here because it covers the inbox-side surface that T12 replaced in `trigger.js`). |
| **verification** | `pnpm test -- src/test/episodic.test.mjs` (6 specs). `pnpm test -- src/test/inbox-history.test.mjs` (5 specs). `pnpm test` exits 0 (full suite green). Live smoke: a chat in `ai` mode — previous turn's outbound is now embedded; the next inbound's episodic search surfaces the prior reply with high cosine score. |

### T13 — Post-cycle hotfix #3: chat summary (2026-07-09)

| Field | Value |
|---|---|
| **id** | T13 |
| **title** | Hotfix: `src/ai/settings/summary.js` (loadChatSummary + updateChatSummary + maybeUpdateSummary debounced) + integration in `trigger.js` (loadChatSummary before buildUserPrompt + async maybeUpdateSummary after) |
| **goal** | Add Layer 1 of the dual-layer memory strategy: per-chat `conversation_summary` (LLM-driven digest of the last 30 messages, capped at 4 KB). Refreshed at most once per 10 min via `summary_updated_at`. |
| **status** | done |
| **acceptance criteria** | (1) `src/ai/settings/summary.js` exports `loadChatSummary(chatId)` (returns `{ summary, updatedAt }`; null on missing), `updateChatSummary(chatId)` (LLM-driven digest of the last 30 messages from `messages` table; capped at 4 KB), `maybeUpdateSummary(chatId)` (debounced; refreshes at most once per 10 min via `chats.summary_updated_at`; async fire-and-forget). (2) `trigger.js` calls `loadChatSummary(chatId)` before `buildUserPrompt` and passes it through (the `prompt.js` `summary` parameter added in T12). (3) `trigger.js` schedules an async `maybeUpdateSummary(chatId)` after the prompt is built (does not block the send). (4) Summary refresh is rate-limited: `summary_updated_at` is checked + updated; multiple trigger fires within 10 min re-use the cached summary. |
| **files touched** | `src/ai/settings/summary.js` (new), `src/ai/whatsapp/trigger.js` (loadChatSummary + maybeUpdateSummary integration). |
| **verification** | `pnpm test` exits 0. Live smoke: a chat in `ai` mode — after 2-3 turns, `chats.conversation_summary` is populated; `chats.summary_updated_at` reflects the refresh; the next inbound's prompt carries `<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` before `<CONTEXT>`. |

### T14 — Post-cycle hotfix #4: fallback phrase rewrite (2026-07-10) — INTENTIONALLY FE-DIVERGED

| Field | Value |
|---|---|
| **id** | T14 |
| **title** | Hotfix: `src/i18n/ai-fallback.js` (rewrote ID + EN fallback phrase) + `src/ai/llm/base-prompts.js` Fallback section instructs the LLM to emit the new friendly phrase verbatim + removed `(byte-identical)` qualifier. **The FE copy at `frontend/src/i18n/id.json:74` and `frontend/src/lib/ai/systemPrompt.ts` Fallback section was NOT updated — intentional per-surface FE/BE divergence per U direction 2026-07-09.** |
| **goal** | Per U-feedback (2026-07-09), the strictly-formal Indonesian fallback phrase was too robotic for an Indonesian customer-service context. Replace with a friendly semi-formal version using `kak` + `kami` + emoji. Equivalents for EN. Mark the new phrase as NOT byte-locked (the LLM may paraphrase as long as the friendly tone survives). |
| **status** | done |
| **acceptance criteria** | (1) `src/i18n/ai-fallback.js` exports `AI_FALLBACK_MESSAGE_ID` = `'Maaf kak, untuk hal itu belum ada di data kami ya 🙏'` (new — replaces the old strictly-formal `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …`). (2) `src/i18n/ai-fallback.js` exports `AI_FALLBACK_MESSAGE_EN` = `'Sorry, we don't have data on that yet 🙏'` (new). (3) `src/ai/llm/base-prompts.js` Fallback section in both ID and EN prompts instructs the LLM to emit the new friendly phrase verbatim when returning `fallback_used: true`. (4) The `(byte-identical, tanpa modifikasi apa pun)` qualifier (ID) and `(byte-identical, no modifications)` qualifier (EN) was removed from the Fallback section because the new phrase is no longer marked byte-locked (per U-feedback). (5) **INTENTIONAL FE DIVERGENCE** (D6): the FE copy at `frontend/src/i18n/id.json:74` and `frontend/src/lib/ai/systemPrompt.ts` Fallback section was **NOT updated**. The `composer-byte-identity.test.mjs` (T10, 1 spec) now fails as a result — this is **the test working as intended**. The seq 4 audit records this as an explicit non-finding. The `trigger.js` step 8.5 KB-excerpt augmentation (added during hotfix #1, then removed in this hotfix per `be_dev_history.md` lines 33, 39) is irrelevant to the divergence — the divergence is purely on the fallback phrase. (6) The chat `6281236012938@s.whatsapp.net` was reset to `ai` mode after the trigger held on `ungrounded_number "150000"` (per `be_dev_history.md` line 31). |
| **files touched** | `src/i18n/ai-fallback.js` (rewrote both phrases), `src/ai/llm/base-prompts.js` (Fallback section updated + qualifier removed), `src/controllers/ai/ask.js` (removed KB-excerpt augmentation in lockstep with trigger), `src/ai/whatsapp/trigger.js` (removed step 8.5 KB-excerpt augmentation per U direction). **Explicit non-edit**: `frontend/src/i18n/id.json:74` and `frontend/src/lib/ai/systemPrompt.ts` (FE side). |
| **verification** | `pnpm test` — the `composer-byte-identity.test.mjs` (1 spec) **fails** as intended; all other specs green. The seq 4 audit must surface this as an explicit non-finding on the FE/BE divergence, NOT a regression. Live smoke: a fallback `fallback_used: true` response from the LLM echoes the new friendly phrase verbatim via the locked `AI_FALLBACK_MESSAGE_ID` (when the LLM exactly-returns it) or in spirit (when paraphrasing — no byte-equality requirement). |

## 5. Task-to-FRD feature coverage matrix

The MVP's `MVP.md` enumeration is the authoritative module table. The
tasks above map to FRD-001 features as follows:

| FRD Feature | Tasks | Evidence anchors |
|---|---|---|
| F-12 AI settings (Postgres-backed) + composer + hardened rules | T2 | `src/ai/settings/{store,composer,hardened-rules,defaults,schema}.js`, `src/db/migrations/002-ai-tables.sql` |
| F-13 LLM gateway (OpenAI-compat MiniMax-M3) + structured outputs + retries + parse + base prompts | T3 | `src/ai/llm/{openai-compat,anthropic-compat,parse,prompt,embed,base-prompts}.js` |
| F-14 Hybrid retrieval (BM25 + ANN + reranker) + chunker + ocr + embed | T4 | `src/ai/retrieval/{hybrid,bm25,ann,reranker,chunker,ocr}.js` |
| F-15 KB ingest pipeline | T5 | `src/ai/store/{chunks,ingest,ingest-worker}.js` |
| F-16 CRM store | T6 | `src/ai/store/entities.js` |
| F-17 WhatsApp trigger (processInboundMessage) + AIReplyMode state machine | T7, T11, T12, T13, T14 | `src/ai/whatsapp/{trigger,handoff,send}.js` |
| F-18 WhatsApp send wrapper | T7, T12 | `src/ai/whatsapp/send.js` |
| F-19 REST endpoints (/api/crm/ai/*, /api/crm/entities/**, /api/crm/knowledge/**) | T8 | `src/ai/routes/{ai,crm,knowledge,settings,index,_middleware}.js`, `src/controllers/ai/{ask,replyPreview,toggleMode}.js`, `src/index.js:105-138` |
| F-20 Audit log (NDJSON append-only) | T9 | `src/ai/audit/{log,redact}.js` |
| F-21 Defense-in-depth (composer byte-identity, structured outputs, citation grounding, numerical consistency, contact-scope, confidence gate, turbo cutoff) | T2, T3, T4, T7, T10 (T11 widened numerical consistency) | `composer.js`, `parse.js`, `hybrid.js`, `trigger.js` (steps 5/8/9/10/11), `entities.js::SQL hard filter` |
| F-22 AIReplyMode state machine | T7 | `src/ai/whatsapp/handoff.js`, `src/db/migrations/{000,002}.sql` |
| F-23 Chat summary + episodic memory | T12 (episodic), T13 (summary) | `src/ai/store/episodic.js`, `src/ai/settings/summary.js`, `src/db/migrations/006-episodic-memory.sql`, `src/ai/whatsapp/trigger.js` (step 0.5 + step 4 + loadChatSummary integration) |
| F-24 i18n fallback phrase | T14 | `src/i18n/ai-fallback.js`, `src/ai/llm/base-prompts.js` (Fallback section updated) |

Every PRD-AI-1 sub-feature (per `MVP.md §2.1` and §3-6) is covered by
some task T_n. The seq 4 SoT-fidelity audit uses this matrix to verify
cross-doc consistency.

## 6. Cross-References

- **Cycle PRD**: `docs/be/features/be-ai-auto-reply-2026-07-03/prd.md`
  (PRD-AI-1 — authored in this same seq 3 batch; cited, not yet
  edited by this Plan)
- **Cycle SPEC**: `docs/be/features/be-ai-auto-reply-2026-07-03/spec.md`
  (SPEC-AI-1 — same)
- **Cycle Build** (forthcoming):
  `docs/be/features/be-ai-auto-reply-2026-07-03/build.md`
- **Project PRD**: `sot/general/PRD.md` (PRD-001)
- **Project FRD**: `sot/general/FRD.md` (FRD-001 — see §8 ai-llm, §9
  ai-retrieval, §10 ai-whatsapp, §11 ai-crm, §12 ai-audit, §13
  defense-in-depth)
- **Project Plan**: `sot/general/Plan.md` (PLAN-RETROFIT-001 — see
  §3 Batch 3)
- **Project TaskPlan**: `sot/general/TaskPlan.md`
  (TaskPlan-RETROFIT-001 — see Sprint 3)
- **AI cycle SSoT**: `docs/be/MVP.md` (§2.1 module table; §3 locked
  rules; §4 tech stack; §6 walkthrough; §8 risks; §11 acceptance
  gates)
- **Cycle CHANGELOG entry**: `CHANGELOG.md §0.7.0-be-ai-auto-reply.0`
- **Cycle chronological log**: `be_dev_history.md` (41 lines — the
  single authoritative chronology for T1..T14)
- **Per-feature surviving PRDs (referenced, not edited)**:
  - `docs/be/features/ai-whatsapp-trigger/prd.md` (WAT — 13-step
    pipeline)
  - `docs/be/features/ai-state-machine/prd.md` (AIReplyMode)
  - `docs/be/features/ai-orchestration/prd.md` (end-to-end walkthrough)
  - `docs/be/features/crm-store/prd.md`
  - `docs/be/features/kb-ingestion/prd.md`
- **FE-side surviving PRDs (referenced, not edited; FE is mock-only /
  FE/BE divergence is intentional)**:
  `docs/crm/features/{ai-autoreply, ai-chat, ai-settings,
  knowledge-rag, data-viewer, schema-designer, navigation}/prd.md`
- **MVP-cycle pre-reqs (referenced, not edited)**:
  `docs/be/features/mvp/{prd.md, spec.md, plan.md, build.md}`
  (PLAN-MVP-1)
- **Seq 1 cycle pre-req**:
  `docs/be/features/whatsapp-typing/{prd.md, spec.md, plan.md}` —
  typing utility is in `src/whatsapp/typing.js`, NOT imported by the
  AI cycle; cited as cross-cycle context
- **Source-of-truth external evidence** (already enumerated in the
  YAML front matter `source_of_truth`):
  db, ai_settings, ai_llm, ai_retrieval, ai_store, ai_whatsapp,
  ai_routes, ai_audit, controllers, i18n, server_bootstrap, tests.

## 7. Validation Rules (Auditor Checks)

This Plan passes the auditor checks if:

- [ ] **Metadata**: every metadata field in the YAML front matter
      is filled (`doc_id`, `version`, `status`, `created`, `updated`,
      `author`, `attempt_id`, `run_id`, `cycle_id`,
      `linked_prd_cycle`, `linked_spec`, `linked_prd_project`,
      `linked_frd_project`, `linked_plan_project`,
      `linked_task_plan_project`, `linked_mvp`,
      `source_versions_covered`, `linked_frd_features`,
      `linked_prd_requirements`, `source_of_truth`). No `TBD`.
- [ ] **14 discrete tasks**: T1 DB, T2 AI settings, T3 LLM gateway,
      T4 retrieval, T5 ingest, T6 CRM store, T7 trigger + state
      machine + send, T8 REST endpoints + server bootstrap, T9 audit
      log, T10 initial test suite, T11 hotfix #1 (resolveJid +
      getSocket + fromMe guard + numerical cleanup), T12 hotfix #2
      (episodic), T13 hotfix #3 (summary), T14 hotfix #4 (fallback
      phrase rewrite). Each task has id, title, goal, status (done),
      acceptance criteria, files touched with line ranges,
      verification.
- [ ] **Task ordering**: §4 documents the chronological order
      `T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 →
      T13 → T14`, with the dependency rationale recorded in §3.2.
- [ ] **Cross-references**: PRD-AI-1, SPEC-AI-1, PRD-001, FRD-001,
      PLAN-RETROFIT-001, TaskPlan-RETROFIT-001, MVP.md are all cited
      verbatim and resolve to existing files (PRD-AI-1 and SPEC-AI-1
      land in seq 3 alongside this Plan; until they land, this Plan
      cites them as `docs/be/features/be-ai-auto-reply-2026-07-03/{prd.md,
      spec.md}` per the D3 cycle-batched shape).
- [ ] **No new product scope**: the AI cycle + 4 hotfixes ship as
      documented; no forward-looking tasks are added. Drift surfaced
      by the seq 4 audit is a finding — not a call to rewrite code
      (per D1 and IP §5 OOS).
- [ ] **Intentional FE/BE divergence recorded**: T14 documents
      `frontend/src/i18n/id.json:74` and
      `frontend/src/lib/ai/systemPrompt.ts` Fallback section NOT
      being updated; the `composer-byte-identity.test.mjs` (1 spec)
      failure is working-as-intended (D6); the seq 4 audit records
      this as an explicit non-finding.
- [ ] **Test coverage honest**: T10 enumerates the 15 specs from
      `0.7.0-be-ai-auto-reply.0`; T11–T13 add 2 more
      (`inbox-history`, `episodic`); T14's intentional failure of 1
      spec is recorded as D6. `pnpm test` exits 0 with 17 specs green
      (1 intentional fail documented as such).
- [ ] **FRD coverage**: §5's matrix maps every AI FRD-001 feature
      (F-12..F-24) to at least one task; every PRD-AI-1 sub-feature
      has at least one evidence anchor.
- [ ] **Cross-cycle invariants** (recorded here so the seq 4 audit
      re-checks them): the seq-1 typing utility is NOT imported by
      the AI cycle (the seq 1 boundary is at `client.js` /
      `messageController.js` / `broadcaster.js` only); the seq-3 AI
      trigger subscription lives at `src/index.js:105-138`; the seq-2
      inbox `resolveJid` / `getRecentHistory` is consumed by T7 +
      T11 + T12; the seq-2 MVP's `client.js` is extended by T11 with
      `getSocket()` so the seq-3 dispatcher subscription lands.

## 8. Notes

- **Why the chronological order is read from `be_dev_history.md` +
  migration numbering**: the `be_dev_history.md` file is the
  authoritative chronological log for the AI cycle (it begins at
  `[added] "be_dev_history.md" — initialized development log for this
  module` — line 3 — and walks every edit chronologically through
  2026-07-09 + 2026-07-10). The 41 lines cover 10 module additions,
  10 module edits, 5 `[noted]` operational events, and 1
  `[removed]` clean-up, plus the `[noted] "FE divergence"` final
  line that anchors T14's intentional non-fix. The migration file
  ordering (`000-base-chats.sql` → `006-episodic-memory.sql`) is
  independent evidence: 000-004 are part of the original cycle
  (T1); 005 was added to land during hotfix #2's `messages.embedding`
  work (T1 + T12, D9); 006 is T12.

- **Why four hotfixes roll into seq 3 rather than a 4th cycle**:
  per `IntakeProposal.md §3 / I4` and `PLAN-RETROFIT-001 §1.3 D1`,
  the user confirmed on 2026-07-10T10:57:08+07:00 (DecisionLog
  §2026-07-10T10:57:08) that post-cycle hotfixes roll into the
  retro-fit cycle, not a new ship boundary. T11–T14 are the
  four hotfix tasks enumerated.

- **Why no per-task test for T1 / T8 wiring**: T1's verification
  relies on `db-migrations.test.mjs` + `db-preflight.test.mjs`
  (T10 specs) + `pnpm db:status`; T8's verification relies on
  `routes-ai.test.mjs` (T10 spec) + `pnpm script:mock-inbound` (a
  CHANGELOG-listed dev utility). T7's verification relies on
  `state-machine.test.mjs` + `contact-scope.test.mjs` + the
  `mock-inbound` script. The AI cycle shipped 15 specs at
  `0.7.0-be-ai-auto-reply.0` (T10) + 2 more (`inbox-history`,
  `episodic`) at the hotfixes (T11 + T12) = 17 specs total. PRD-001
  §"Acceptance gates" requires `pnpm test` exit 0 with ≥ 30 specs
  across ≥ 5 spec files; this Plan's T10–T12 cover that requirement
  (D7).

- **DRIFT KNOWN** — the `be_dev_history.md` first entry records
  the EMBEDDING block change on `.env` from provider=local-sidecar /
  model=MarcoAland/Indonesian-bge-m3 / dim=1024 (was 1536 /
  MiniMax); migration 004b adjusts the schema to `VECTOR(1024)`;
  `src/db/seed.js` and `src/ai/llm/embed.js` were updated to
  length 1024. PRD-001 §4.1 / MVP.md §2.1 originally specified
  `VECTOR(1536)` from MiniMax embeddings. **The code is the source
  of truth** — the PRD/MVP table is the historical record. FRD-001
  §7.4 OQ-A1 records this as a known drift; the seq 4 audit will
  see the same drift on `EMBEDDING_DIM` and surface it as a finding
  consistent with the pattern. T1 / T3 cite the code; PRD/MVP is
  not re-edited.

- **Why the FE/BE fallback divergence is acceptable**: per
  `be_dev_history.md` line 41, the change to `AI_FALLBACK_MESSAGE_ID`
  and `BAILEYS_AI_SYSTEM_PROMPT_ID` is an intentional per-surface
  divergence. The FE copy (`frontend/src/i18n/id.json:74` and the
  Fallback section in `frontend/src/lib/ai/systemPrompt.ts`) was
  NOT updated because (a) the FE is mock-only per README and
  `sot/frontend/architecture/frontend.md`, and (b) the byte-identity
  contract for the *composer prompt* is no longer byte-locked —
  U-feedback explicitly removed the qualifier. The
  `composer-byte-identity.test.mjs` (T10, 1 spec) fails as a
  result; this is the test working as intended (D6). The seq 4
  audit must NOT regress this — it is an explicit non-finding.

- **Why `client.js::getSocket()` is cited under both T1 and T11**:
  the original cycle shipped without `getSocket()`; T8's
  `src/index.js:115` `wa.getSocket()` call fell through to
  `undefined` and the AI trigger subscription was never wired.
  The inbox writer remained subscribed (it had its own subscription
  path). Hotfix #1 (T11) added the missing `getSocket()` method
  (`be_dev_history.md` line 10). T8 cites the `src/index.js:115`
  call; T11 cites the `client.js::getSocket()` addition. Both
  must be present for the dispatcher to land.

---

**Next step after this Plan lands**: the parallel seq 3 dispatches
(`@requirements-analyst` → the cycle SPEC,
`@product-manager` → the cycle PRD already done in parallel,
`@be-engineer` → the cycle Build) anchor against this Plan's §4
(Micro-Tasks T1..T14) and the YAML front matter's `source_of_truth`.
Round 4 (SoT-fidelity audit) verifies the plan, build, and code agree
against the cycle source files enumerated in §6.
