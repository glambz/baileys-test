<!--
owner: @product-manager
cycle_id: be-ai-auto-reply-2026-07-03
attempt_id: ATT-SEQ3-PM-1
doc_id: PRD-AI-1
linked_prd: sot/general/PRD.md (PRD-001)
linked_frd: sot/general/FRD.md (FRD-001)
linked_plan: sot/general/Plan.md (PLAN-RETROFIT-001) §3 Batch 3
linked_mvp_sot: docs/be/MVP.md
linked_surviving_feature_prds:
  - docs/be/features/ai-orchestration/prd.md
  - docs/be/features/ai-state-machine/prd.md
  - docs/be/features/ai-whatsapp-trigger/prd.md
  - docs/be/features/crm-store/prd.md
  - docs/be/features/kb-ingestion/prd.md
purpose: MIGRATION ARTIFACT — documents what IS in the code for the
BE AI auto-reply cycle (be-ai-auto-reply-2026-07-03) plus the three
post-cycle hotfixes of 2026-07-09 (episodic memory, chat summary,
fallback phrase rewrite) that D1 rolls into this cycle. Code is the
source of truth. Not a forward-looking scope statement.
-->
# BE AI Auto-Reply — PRD (`be-ai-auto-reply-2026-07-03`)

> **Migration artifact.** This PRD is part of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> run, **Batch 3** of
> [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md) §3. It
> documents the **`be-ai-auto-reply-2026-07-03`** cycle — settings,
> LLM gateway, hybrid retrieval, KB ingestion, CRM persistence,
> WhatsApp trigger, state machine, REST surface, audit log, and the
> 7-layer defense-in-depth gate — **plus** the three post-cycle
> hotfixes (episodic memory, chat summary, fallback phrase rewrite)
> landed on 2026-07-09 that
> [`IntakeProposal.md`](../../../../sot/general/IntakeProposal.md)
> decision **D1** rolls into this seq 3 retro-fit (not a fourth
> cycle). **Code is the source of truth.** This PRD does **not**
> invent new product scope.
>
> **Linked upstream**: [`PRD-001`](../../../../sot/general/PRD.md)
> (project-level, §4.2 BE AI auto-reply cycle rows FR-12..FR-27, §4.3
> locked values FR-28..FR-33) and [`FRD-001`](../../../../sot/general/FRD.md)
> (project-level, modules `ai-llm`, `ai-retrieval`, `ai-whatsapp`,
> `ai-crm`, `ai-audit`, features F-12..F-38).
> **Linked plan**: [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md)
> §1.3 boundary decisions D1 (post-cycle hotfixes roll into seq 3),
> D3 (cycle-batched artifacts), D4 (top-level SoT lives at project
> root, cycle-level here).
> **Scope SSoT**: [`docs/be/MVP.md`](../../../MVP.md) — the cycle-0
> "what are we building" document.
>
> **Surviving per-feature PRDs** (cited, not re-formatted per D3):
> [`docs/be/features/ai-orchestration/prd.md`](../ai-orchestration/prd.md),
> [`docs/be/features/ai-state-machine/prd.md`](../ai-state-machine/prd.md),
> [`docs/be/features/ai-whatsapp-trigger/prd.md`](../ai-whatsapp-trigger/prd.md),
> [`docs/be/features/crm-store/prd.md`](../crm-store/prd.md),
> [`docs/be/features/kb-ingestion/prd.md`](../kb-ingestion/prd.md).

## 1. Vision

The `be-ai-auto-reply-2026-07-03` cycle wires the **WhatsApp-side AI
auto-reply engine** and a **team `/api/crm/ai/ask` endpoint** into
the existing Express backend, turning the linked WhatsApp account
into a retrieval-augmented assistant that:

- **Reads from a curated knowledge base** (PDF / DOCX / HTML / XLSX /
  CSV / TXT, OCR'd, chunked, embedded, indexed).
- **Reads from a schema-driven CRM** (`entity_definitions` +
  `entity_records` + `entity_relationships`), strictly scoped to the
  chat's contact on the WhatsApp side and tenant-wide on the dashboard
  side.
- **Writes back to the CRM only** — never to the KB — so a hallucinating
  or hostile LLM cannot poison the curated content.
- **Gates every reply through 7 defense-in-depth layers** so the
  contact never sees a confidently hallucinated answer, a cross-contact
  leak, or an invented number.

The long-term outcome is to let one operator safely run a WhatsApp
business workflow — broadcasts, customer chat, in-chat AI answers,
schema-driven entity records — without having to touch the underlying
Baileys socket, while keeping the WhatsApp account safe from the most
common cause of bans (rate-limit and behaviour violations) and the AI
safe from the most common cause of customer-service embarrassment
(overconfident, unfounded answers).

In one line: *a retrieval-augmented WhatsApp assistant that never
invents data it can't cite, scoped per contact, with the operator
in the loop on every hold.*

## 2. Why this cycle shipped (scope as locked in MVP.md)

The MVP SSoT ([`docs/be/MVP.md`](../../../MVP.md)) locks the cycle
scope: MiniMax-M3 as LLM (OpenAI-compatible default; Anthropic-
compatible fallback), Postgres from day one (no SQLite), full
embedding pipeline, full MVP (no half work), Node 18+ Express,
no FE rewrite this run (FE composer is the canonical system-prompt
source; BE reuses the same string verbatim over the wire). The BE
ships 10 sub-features in one cycle (see §4 below) plus the 3
post-cycle hotfixes (see §5).

### 2.1 Endpoints delivered in this cycle

| Method | Path | Scope | Source |
|---|---|---|---|
| POST | `/api/crm/ai/ask` | team (full KB + all tenant CRM records, no contact filter) | `src/controllers/ai/ask.js:22-116`; `src/ai/routes/ai.js:14` |
| POST | `/api/crm/ai/reply-preview` | team (same pipeline minus `sock.sendMessage`) | `src/controllers/ai/replyPreview.js:19-93`; `src/ai/routes/ai.js:15` |
| POST | `/api/crm/ai/toggle-mode` | team (`mode ∈ {'ai','human'}`; rejects `human_pending_flag`) | `src/controllers/ai/toggleMode.js:20-74`; `src/ai/routes/ai.js:16` |
| GET / POST | `/api/crm/entities` | team (list / create, zod-validated) | `src/ai/routes/crm.js:15-73` |
| PATCH / DELETE | `/api/crm/entities/:id` | team (new-version rename / soft-delete) | `src/ai/routes/crm.js:76-114` |
| GET / POST | `/api/crm/entities/:id/records` | team (paginated list + filter / create) | `src/ai/routes/crm.js:118-173` |
| PATCH / DELETE | `/api/crm/records/:id` | team (update / delete) | `src/ai/routes/crm.js:176-207` |
| GET | `/api/crm/knowledge/files` | team (list, optional `?status=` filter) | `src/ai/routes/knowledge.js:21-47` |
| POST | `/api/crm/knowledge/upload` | team (multipart → async ingest worker) | `src/ai/routes/knowledge.js:50-68` |
| GET | `/api/crm/knowledge/files/:id` | team (file metadata + chunk count) | `src/ai/routes/knowledge.js:71-94` |
| DELETE | `/api/crm/knowledge/files/:id` | team (delete + cascade chunks) | `src/ai/routes/knowledge.js:97-105` |

## 3. Goals & Non-Goals

### 3.1 Goals

The cycle-level goals are enumerated below; each cites the
implementing source-of-truth file(s). Every goal maps to at least one
FR in §4.

- **G-AI-1 — Single LLM provider, dual-protocol gateway.** Every
  auto-reply / preview / ask call goes through one gateway that
  supports both OpenAI-compatible (default, MiniMax-M3 via the
  `/v1/responses` endpoint) and Anthropic-compatible (selectable via
  `LLM_PROVIDER=anthropic-compatible`). 2-attempt HTTP retry on
  transient errors (429, 5xx) with exponential backoff. Per-call
  `AbortController` honours `LLM_TIMEOUT_MS` (default 30s).
  Structured outputs via `text.format = { type: 'json_schema', strict: true }`
  (OpenAI Responses API) or via a single `emit_structured_output`
  tool with `tool_choice` (Anthropic-compatible).
  Source: `src/ai/llm/openai-compat.js:101-199`;
  `src/ai/llm/anthropic-compat.js:50-114`;
  `src/ai/llm/embed.js:53-147`.

- **G-AI-2 — Locked system prompt, byte-stable.** The BE composer
  produces a string **byte-equivalent** to
  `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt` for the
  same `{ settings, tenantName, language }` input. Composed string =
  `BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` (base, byte-stable, with
  `{{tenantName}}` literal-replaced) + per-tenant fragment
  (identity / tone / language / scope / rules) + 4-rule HARDENED
  block (byte-stable Indonesian, appended UNCONDITIONALLY).
  Source: `src/ai/llm/base-prompts.js:7,67`;
  `src/ai/settings/composer.js:80-95`;
  `src/ai/settings/hardened-rules.js:7-12`.

- **G-AI-3 — Hybrid retrieval, contact-scoped.** BM25 (Postgres FTS
  over `knowledge_chunks.text` ∪ pgvector cosine ANN over
  `knowledge_chunks.embedding`) → RRF fusion (`1 / (60 + rank)`) →
  MiniMax-embedding cosine rerank → top-6 candidates. WhatsApp-scope
  calls set `contactScopeApplied = true`; the data-layer enforcement
  is at the SQL `entity_records_contact_idx` partial index plus the
  post-LLM guard in the trigger. The locked `τ_retrieval = 0.30`
  turbo cutoff slot is documented; the current code ships
  `TAU_TURBO = 0.0` (disabled) per MVP §3.3 — the LLM's own
  `confidence < τ_user` and per-citation cosine ≥ 0.85 (both
  implemented in the trigger) are the active quality filter.
  Source: `src/ai/retrieval/hybrid.js:15-90`;
  `src/ai/retrieval/bm25.js:8-26`;
  `src/ai/retrieval/ann.js:8-30`;
  `src/ai/retrieval/reranker.js:22-35`;
  `src/db/migrations/003-indexes.sql`.

- **G-AI-4 — KB ingest, idempotent on `(tenant_id, source_path, chunk_index)`.**
  Multipart upload → multer memory (50 MB cap) → enqueue → worker
  pulls from `KB_DIR` → OCR (`pdf-parse` / `mammoth` / `cheerio` /
  `xlsx` / UTF-8) → semantic chunker (~512 tokens, 50-token overlap,
  paragraph → sentence → hard-split fallback) → embed (concurrency 4)
  → upsert via `chunksStore.__ingestUpsertChunk` (write-restricted
  module-internal API; only `ingest.js` reaches it). Re-uploads of
  the same byte content short-circuit to the existing
  `fileId` + `chunksCount`.
  Source: `src/ai/store/ingest.js:18-105`;
  `src/ai/store/chunks.js:15-43, 105-115`;
  `src/ai/retrieval/chunker.js:36-95`;
  `src/ai/retrieval/ocr.js:64-85`;
  `src/ai/routes/knowledge.js:50-68`.

- **G-AI-5 — CRM persistence, schema-versioned, zod-validated.**
  `entity_definitions` is append-only-versioned (`UNIQUE
  (tenant_id, name, version)`, PATCH bumps `version` and writes a
  new row), `entity_records` carries a nullable `contact_id` for the
  WhatsApp-scope data-layer filter, `entity_relationships` describes
  typed edges (`one` | `many`). All seven endpoints under
  `/api/crm/entities/...` and `/api/crm/records/...` are tenant-scoped
  via `requireTenant` middleware.
  Source: `src/ai/routes/crm.js:15-207`;
  `src/db/migrations/002-ai-tables.sql:117-154`.

- **G-AI-6 — WhatsApp trigger, fire-and-forget, 13-step MVP pipeline.**
  Subscribed to Baileys `messages.upsert`; the trigger is non-awaited
  by Baileys so the socket is never blocked. The 14 steps are:
  self-echo + status-broadcast + empty-body guards → LID→PN
  `resolveJid` → `upsertChatOnInbound` → step 0.5 message persist +
  episodic embed → step 1 `loadChatMode` → step 2 settings →
  step 3 compose → step 4 hybrid retrieval + step 4b fetch full KB
  text → step 5 turbo cutoff → step 6 build user prompt
  (with `summary` and `chatHistory`) → step 7 LLM + step 8 parse →
  step 9 confidence gate (bypassed when `fallback_used=true`) →
  step 11 numerical consistency (consults both top-K retrieved chunks
  AND full KB text) → step 12 send → audit row. (14 distinct gates per SPEC-AI-1 §9.1.1 + BUILD-AI-1 §3.5; the early-return guards count as one combined "self-echo + status-broadcast + empty-body" gate, and step 0.5 message persist + episodic embed + step 4b full-KB fetch inflate the otherwise 12-step core.) `startTyping(sock,
  chatId)` wraps the LLM + post-LLM gates in a try/finally so the
  indicator is always stopped.
  Source: `src/ai/whatsapp/trigger.js:71-360`;
  `src/whatsapp/typing.js` (cycle `be-typing-indicators-2026-07-10`,
  see `docs/be/features/whatsapp-typing/prd.md`).

- **G-AI-7 — AIReplyMode state machine, forbidden transition enforced.**
  Three modes (`ai` | `human` | `human_pending_flag`), persisted as
  TEXT with a SQL `CHECK (ai_mode IN ('ai','human','human_pending_flag'))`
  constraint on `chats.ai_mode` (`src/db/migrations/001-initial.sql:14-15`).
  Allowed transitions are enumerated in `src/ai/whatsapp/handoff.js:31-37`:
  `ai→human_pending_flag`, `ai→human`, `human_pending_flag→ai`,
  `human_pending_flag→human`, `human→ai`. **Forbidden: `human → human_pending_flag`**
  (only the operator can re-enable; the BE never auto-flags from
  `human`). The toggle-mode endpoint rejects `mode: 'human_pending_flag'`
  at the zod schema level (`src/controllers/ai/toggleMode.js:15-18`).
  Source: `src/ai/whatsapp/handoff.js:31-47, 98-113`;
  `src/db/migrations/001-initial.sql:14-15`;
  `src/controllers/ai/toggleMode.js:15-18`.

- **G-AI-8 — Defense-in-depth (7 layers).** See §4.10 for the full
  enumeration. Each layer is implemented in source and exercised by
  at least one vitest spec; the cycle acceptance gate
  `composer-byte-identity.test.js` enforces layer 1 byte-equality.

- **G-AI-9 — Dual-layer memory (post-cycle hotfix).** Layer 1 =
  running conversation summary persisted to
  `chats.conversation_summary` (TEXT, ~1–4 KB) refreshed by an
  LLM-generated digest every ≥ 10 minutes
  (`SUMMARY_MIN_REFRESH_SECONDS=600`) over the last 30 messages
  (`SUMMARY_MAX_CONTEXT_MESSAGES=30`). Layer 2 = episodic vector
  store: every inbound + outbound message is embedded (BGE-M3 1024-d)
  and persisted to `messages.embedding`; the trigger's step 4
  builds `chatHistory` from `episodic.episodicSearch({ chatId,
  queryEmbedding, topK: EPISODIC_TOPK=10 })` so the LLM can resolve
  follow-up references like "berapa lama" against the topic set 4
  turns earlier. Embedding failure is non-fatal — the trigger falls
  back to `inbox.getRecentHistory(chatId, 6)`.
  Source: `src/ai/settings/summary.js:49-133`;
  `src/ai/store/episodic.js:34-98`;
  `src/db/migrations/006-episodic-memory.sql`;
  `src/ai/llm/prompt.js:6-55` (accepts `summary` + `maxHistory`).

- **G-AI-10 — Friendly fallback phrase (post-cycle hotfix).** The
  locked Indonesian + English fallback phrases in
  `src/i18n/ai-fallback.js:10-13` use a friendly semi-formal tone
  ("kak" / "kami" / 🙏). `src/ai/llm/base-prompts.js:62-65,121-124`
  instructs the LLM to emit the new phrase verbatim. The
  "byte-identical, tanpa modifikasi apa pun" qualifier in the ID base
  prompt and the "(byte-identical, no modifications)" qualifier in
  the EN base prompt have been **removed** because the new phrase is
  no longer marked as byte-locked (per U feedback 2026-07-09).
  Source: `src/i18n/ai-fallback.js:10-13`;
  `src/ai/llm/base-prompts.js:62-65,121-124`;
  `be_dev_history.md:37-38`.

- **G-AI-11 — Audit log, append-only NDJSON.** Every code path on the
  auto-reply funnel writes a structured NDJSON record to
  `./data/audit/<UTC-date>.ndjson`. Sensitive fields
  (`apiKey`, `password`, `authorization`, `cookie`, `*token`) are
  redacted at write time.
  Source: `src/ai/audit/log.js:30-41`;
  `src/ai/audit/redact.js:6-31`.

### 3.2 Non-Goals

- **NG-AI-1 — Multi-tenant SaaS.** Single operator / single WhatsApp
  account / single Postgres database for this run. Per-tenant RLS,
  per-tenant vector namespacing are Phase 3.
  Source: PRD-001 NG1; MVP §10.

- **NG-AI-2 — No HTTP API authentication.** README §"Security notes"
  is explicit: the API has no auth; binding to `127.0.0.1` or a
  reverse proxy with auth is the operator's responsibility.
  Source: PRD-001 NG2; `src/index.js` (no auth middleware).

- **NG-AI-3 — NLI entailment (defense layer 5).** Deferred to Phase 2.
  The current cycle does not require an NLI endpoint — the FR slot
  documents the future check. Layers 1, 2, 3, 4, 6, 7 are active.
  Source: MVP §3.5; PRD-001 FR-16.

- **NG-AI-4 — Cross-encoder reranker.** The rerank path is
  MiniMax-embedding cosine (BGE-M3 1024-d); a cross-encoder is
  Phase 2.
  Source: MVP §10; `src/ai/retrieval/reranker.js:22-35`.

- **NG-AI-5 — Streaming replies.** Not in MVP; a streaming reply path
  with typing indicators is Phase 2. The current cycle ships the
  static-text send.
  Source: MVP §10; PRD-001 NG3.

- **NG-AI-6 — LLM provider cutover.** The Anthropic-compatible path
  is wired (`src/ai/llm/anthropic-compat.js:50-114`) and selectable
  via `LLM_PROVIDER=anthropic-compatible`. Production cutover is
  Phase 2; the cycle ships OpenAI-compatible as the default
  (`src/ai/llm/openai-compat.js`).

- **NG-AI-7 — KB auto-tag extraction at ingest time.** Deferred to
  Phase 3.
  Source: MVP §10; PRD-001 NG3.

- **NG-AI-8 — FE wiring to the new BE endpoints.** The Vite + React
  18 + TypeScript mockup in `frontend/` is mock-only and does not
  call this backend. Per-surface FE/BE divergence is intentional —
  see §5.3 (FE fallback phrase + `BAILEYS_AI_SYSTEM_PROMPT_ID` were
  NOT updated on the BE side's fallback phrase rewrite; the
  composer-byte-identity test now fails as intended).
  Source: PRD-001 NG4; `be_dev_history.md:41`.

- **NG-AI-9 — KB writes from any AI / LLM path.** The LLM's
  structured output schema (`src/ai/llm/parse.js:24-30`) permits
  only `answer` / `citations` / `confidence` / `fallback_used` (plus
  optional `reasoning`); there is no `addKbEntry` / `updateKbEntry`
  action. The chunks store's write methods
  (`__ingestUpsertChunk`, `__ingestDeleteForFile`) are reachable only
  from `ingest.js` — defense-in-depth layer 4 for the
  "AI never writes to KB" rule. There is no router endpoint that
  accepts a `knowledge_chunks` write.
  Source: `src/ai/store/chunks.js:15-43, 105-115`;
  `src/ai/store/ingest.js:14, 80-89`;
  MVP §3.2 rule #4.

- **NG-AI-10 — Re-implementation of any feature.** This PRD documents
  shipped behaviour. Drift surfaced by the seq 4 audit is a finding —
  not a call to rewrite code.
  Source: PRD-001 NG5.

## 4. Functional Requirements (cycle-level)

Each requirement cites the integration site(s). Acceptance uses
`given / when / then`.

### 4.1 AI Settings service (sub-feature 1)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-S-FR-1 | P0 | **`ai_settings` Postgres table.** Single-tenant (MVP); columns `identity JSONB`, `tone TEXT`, `language TEXT`, `scope JSONB`, `rules TEXT[]`, `whatsapp_auto_reply JSONB`, `updated_at TIMESTAMPTZ`. Migration `src/db/migrations/002-ai-tables.sql`. | A row inserted via `UPDATE ai_settings WHERE id=1` round-trips through `store.rowToSettings` byte-equal to its `AiSettingsSchema`-validated shape. Source: `src/ai/settings/store.js:13-26, 65-87`. |
| AI-S-FR-2 | P0 | **`getSettings()` / `updateSettings(patch)` / `resetSettings()`.** `getSettings()` returns `DEFAULT_AI_SETTINGS` on a missing row. `updateSettings()` does a deep-merge on nested objects (`identity` / `scope` / `whatsappAutoReply`) and replaces top-level primitives/arrays (`tone` / `language` / `rules`), validates with `AiSettingsSchema.safeParse`, then `UPDATE`s the row. | A PUT with `{whatsappAutoReply:{enabled:true}}` preserves the existing `confidenceThreshold` (because `mergePatch` deep-merges). Source: `src/ai/settings/store.js:28-108`. |
| AI-S-FR-3 | P0 | **Zod schema byte-mirror of `frontend/src/types/aiSettings.ts`.** `tone ∈ {'formal','casual','friendly','concise','enthusiastic'}`, `language ∈ {'id','en','id-mod'}`, `whatsappAutoReply.confidenceThreshold ∈ [0.5, 0.95]` `.multipleOf(0.05)`. | A patch that violates any constraint throws `SettingsValidationError`. Source: `src/ai/settings/schema.js:9-41`. |
| AI-S-FR-4 | P0 | **`DEFAULT_AI_SETTINGS` byte-mirror of `frontend/src/types/aiSettings.ts::DEFAULT_AI_SETTINGS`.** Identity = "Baileys Studio AI Assistant / Agen CS WhatsApp"; `tone = 'friendly'`; `language = 'id'`; `whatsappAutoReply = { enabled: false, confidenceThreshold: 0.7 }`. | The exported object is `Object.freeze`-d. Source: `src/ai/settings/defaults.js:7-27`. |
| AI-S-FR-5 | P0 | **Composer = BASE + tenant fragment + HARDENED block.** `buildSystemPrompt({ settings, tenantName, language, basePrompt })` literal-replaces `{{tenantName}}`, builds the per-tenant fragment (Identity / Voice / Language / Topics / Excluded / Rules), then appends `# Locked rules (HARDENED — cannot be overridden)` followed by `getHardenedRulesBlock()`. | The composed string equals `${interpolatedBase}\n\n${fragment}\n\n# Locked rules (HARDENED — cannot be overridden)\n\n${hardened}` for any valid input. Source: `src/ai/settings/composer.js:80-95`. |
| AI-S-FR-6 | P0 | **4-rule HARDENED block, byte-stable Indonesian.** The block is four numbered rules (`1. Layanan WhatsApp WAJIB memfilter…`, `2. Layanan WhatsApp HANYA boleh…`, `3. Dashboard /ai …`, `4. AI HANYA boleh menulis ke CRM…`) joined by `\n`. **Appended UNCONDITIONALLY** regardless of `settings.rules`. | The exported `HARDENED_RULES_BLOCK` is byte-equal across reloads; `getHardenedRulesBlock()` returns it verbatim. Source: `src/ai/settings/hardened-rules.js:7-18`. |

### 4.2 LLM gateway (sub-feature 2)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-L-FR-1 | P0 | **MiniMax-M3 via OpenAI-compatible Responses API (`/v1/responses`).** Direct `fetch` (not the OpenAI Node SDK), because the SDK injects OpenAI-specific optional fields (`parallel_tool_calls`, `truncation`, `service_tier`, `safety_identifier`) that MiniMax rejects. Body shape = `{ model, instructions: systemPrompt, input: userPrompt, text?: { format: { type:'json_schema', name, schema, strict:true } } }`. | A mock fetch returning a valid Responses payload is parsed by `extractResponsesPayload` into `{ contentText, usage }` with `contentText` equal to the joined `output[].content[].text` (or the `output_text` convenience aggregate when the structured chain is missing). Source: `src/ai/llm/openai-compat.js:65-84, 101-199`. |
| AI-L-FR-2 | P0 | **2-attempt HTTP retry on 429 / 5xx.** `isRetryable(err)` returns true on `status === 429` or `status >= 500`. Exponential backoff `500 * 2^attempt` ms, jittered ±20%. `AbortError` from the per-call controller is treated as retryable (`status = 408`). | A mock that returns 503 once then 200 succeeds after 1 retry; a mock that returns 503 three times then 200 throws `LlmPermanentError`. Source: `src/ai/llm/openai-compat.js:38-43, 137-198`. |
| AI-L-FR-3 | P0 | **Per-call timeout (`LLM_TIMEOUT_MS`, default 30s).** Each call constructs an `AbortController` with `setTimeout(abort, timeoutMs)`; the `AbortError` is caught and re-thrown as a retryable 408. | A mock that never resolves aborts at 30s and is retried; after `LLM_MAX_RETRIES` retries it throws `LlmPermanentError`. Source: `src/ai/llm/openai-compat.js:140-142, 187-189`. |
| AI-L-FR-4 | P0 | **Anthropic-compatible fallback (`createAnthropicHttpClient` + `createChatCompletion`).** POST to `{ANTHROPIC_BASE_URL}/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01` headers. Structured outputs are realised by defining one `emit_structured_output` tool with `input_schema = jsonSchema` and forcing `tool_choice: { type: 'tool', name: 'emit_structured_output' }`. | When `client.create()` returns a `tool_use` block, its `input` is returned as `content`; otherwise the first `text` block is returned. Source: `src/ai/llm/anthropic-compat.js:20-114`. |
| AI-L-FR-5 | P0 | **Structured-output parser (`parseStructuredOutput`) with ≤3 retries.** `RagAnswerSchema = { answer: string, citations: number[], confidence: 0..1, fallback_used: boolean }`; `WhatsAppAutoReplyDecisionSchema` adds optional `reasoning`. On parse failure, retries the LLM call with the previous `userPrompt` + a "Your previous response did not match the required schema. Errors: … Please respond again" tail; throws `LlmParseError` after `maxAttempts=3`. | A mock that returns invalid JSON for 3 attempts throws `LlmParseError(..., attempts: 3)`; a mock that returns valid JSON on attempt 2 returns `{ parsed, attempts: 2 }`. Source: `src/ai/llm/parse.js:32-84`. |
| AI-L-FR-6 | P0 | **Embeddings client (`embedText`) with SHA-256-keyed LRU cache.** Cache key = `sha256(text)`; cache hit skips the HTTP call. The local sidecar (MiniMax-compatible `/v1/embeddings`) takes `{ model, texts: [text], type: 'string' }` (NOT OpenAI's `{ input }`); the function also supports `EMBEDDING_BASE_URL` override. Texts > 2000 chars are split into 2000-char segments and the segment vectors are averaged. | A second call with the same text issues no HTTP request. Texts longer than 2000 chars produce a vector whose length equals the configured `EMBEDDING_DIM` and is the per-dimension mean of the segment vectors. Source: `src/ai/llm/embed.js:8-32, 34, 53-147, 149-184`. |
| AI-L-FR-7 | P0 | **Dim-mismatch validation.** If `EMBEDDING_DIM` is set and the response vector has a different length, throw `Error(..., status: 502)`. | A sidecar returning 1536-dim vectors against `EMBEDDING_DIM=1024` throws immediately; no row is written downstream. Source: `src/ai/llm/embed.js:122-133`; `be_dev_history.md:6`. |
| AI-L-FR-8 | P0 | **Base prompts (`BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}`) byte-stable, with `{{tenantName}}` literal.** Both prompts include the Identity / Voice / Language / Scope / DO NOT / Answering rules / Output format sections and end with the Fallback section. Both are `Object.freeze`-d. **Per hotfix #3 (2026-07-09), the "byte-identical, tanpa modifikasi apa pun" / "byte-identical, no modifications" qualifier is removed from the Fallback section** because the new fallback phrase is no longer byte-locked. | The ID prompt's fallback block reads `balas TEPAT dengan kalimat berikut:` (no qualifier) followed by `"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"`. The EN prompt's fallback block reads `reply EXACTLY with the following sentence:` (no qualifier) followed by `"Sorry, we don't have data on that yet 🙏"`. Source: `src/ai/llm/base-prompts.js:7, 62-65, 67, 121-124`; `be_dev_history.md:38`. |

### 4.3 Retrieval (sub-feature 3)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-R-FR-1 | P0 | **BM25 (Postgres FTS) over `knowledge_chunks.text`.** Uses `tsvector('simple', text) @@ plainto_tsquery('simple', $1)` and `ts_rank_cd`; max-normalises scores into `[0, 1]`. Returns top-20 by default. | A query that hits no rows returns `[]`; otherwise returns up to 20 `{ chunk, score }` with the top score equal to 1.0. Source: `src/ai/retrieval/bm25.js:8-26`. |
| AI-R-FR-2 | P0 | **pgvector cosine ANN over `knowledge_chunks.embedding`.** Uses `embedding <=> $1::vector` (cosine distance); returns `score = 1 - distance`. Backed by `knowledge_chunks_embedding_idx WITH (lists = 100)` (per migration `002-ai-tables.sql`). | A query embedding returns up to 20 results in descending cosine similarity. Source: `src/ai/retrieval/ann.js:8-30`; `src/db/migrations/002-ai-tables.sql`. |
| AI-R-FR-3 | P0 | **RRF fusion + rerank.** Top-20 BM25 ∪ top-20 ANN → `add(id, 1/(60+rank+1))` per source → top-30 by RRF → MiniMax-embedding cosine rerank → top-6 (`rerank.js`). | A query that returns zero hits in either BM25 or ANN still works (the surviving list becomes the candidate set). Source: `src/ai/retrieval/hybrid.js:23-79`; `src/ai/retrieval/reranker.js:22-35`. |
| AI-R-FR-4 | P0 | **Contact-scope flag (`contactScopeApplied`).** When `scope === 'whatsapp'` AND `contactPhone` is set, the function sets `contactScopeApplied = true` and attempts a `SELECT 1` ping to keep the DB connection warm (the actual data-layer enforcement is the SQL `entity_records_contact_idx` partial index + the post-LLM guard in `trigger.js`). | A `whatsapp`-scope call with `contactPhone` returns `{ contactScopeApplied: true, ... }`. Source: `src/ai/retrieval/hybrid.js:54-71`. |
| AI-R-FR-5 | P0 | **Turbo cutoff slot (`TAU_TURBO`).** The locked `τ_retrieval = 0.30` is documented (PRD-001 FR-28; MVP §3.3; README §"Locked values"). The current code ships `TAU_TURBO = 0.0` — the LLM's own `confidence < τ_user` and per-citation cosine ≥ 0.85 are the active quality filter. | `retrievalScore < 0.0` is impossible, so the cutoff never fires today. Source: `src/ai/retrieval/hybrid.js:12, 86-89`. |
| AI-R-FR-6 | P0 | **Embedding-service outage tolerance.** If `embedText(query)` throws (or `rerank` throws), the function returns BM25-only or top-K sliced candidates. | A mock that throws on `embedText` still returns `{ chunks: [], retrievalScore, contactScopeApplied }`; the trigger's turbo-cutoff branch is unaffected. Source: `src/ai/retrieval/hybrid.js:24-32, 73-79`. |
| AI-R-FR-7 | P0 | **Semantic chunker (`chunkText`).** Split on `\n\n+`, then on sentence boundaries (`[.!?]\s+`), then on word-boundary hard-split; prepend the last `overlapTokens * 4` chars of the previous chunk. Markdown headings update `metadata.sectionTitle` for subsequent chunks. `metadata.tokenEstimate = ceil(text.length / 4)`. | A long paragraph > 512 tokens splits into multiple chunks; the second chunk's text starts with the tail of the first chunk. Source: `src/ai/retrieval/chunker.js:36-95`. |
| AI-R-FR-8 | P0 | **Multi-format OCR (`extractText`).** PDF via `pdf-parse` (`metadata.pages = numpages`); DOCX via `mammoth.extractRawText`; HTML/XHTML via `cheerio` (strips `<script>`/`<style>`, returns `<body>` text + `metadata.sections = [...h1/h2/h3]`); XLSX via `xlsx` (each sheet → CSV, joined `\n`, `metadata.sections = sheet names`); CSV / TXT as UTF-8. Throws `UnsupportedMimeError` on anything else. | An `application/pdf` buffer with 3 pages returns `{ text, metadata: { pages: 3 } }`; a buffer with `mimeType: 'image/png'` throws `UnsupportedMimeError('image/png')`. Source: `src/ai/retrieval/ocr.js:14-85`. |

### 4.4 Ingest pipeline (sub-feature 4)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-I-FR-1 | P0 | **`ingestFile({ tenantId, filename, mimeType, buffer })`.** Hashes the buffer (`sha256`); idempotency check by storage_path LIKE `%<sha[:8]>%` against an existing `status = 'indexed'` row short-circuits to `{ fileId, chunksCount, idempotent: true }`. New uploads write to `./data/kb/<fileId>/<filename>`, insert into `knowledge_files (status='queued')`, then transition `queued → ingesting → indexed` (or `failed`). | Re-uploading the same byte content within minutes returns `idempotent: true` with the existing `chunksCount`. Source: `src/ai/store/ingest.js:18-40`. |
| AI-I-FR-2 | P0 | **Status transitions (`queued → ingesting → indexed \| failed`).** Status updates use direct `UPDATE knowledge_files SET status = ...` queries (`ingest.js:54-58, 91-96, 99-103`). | A thrown error inside the ingest pipeline transitions the row to `failed` with `last_error = <message>` and rethrows. Source: `src/ai/store/ingest.js:54-58, 91-103`. |
| AI-I-FR-3 | P0 | **Bounded concurrency on embedding (4 in-flight).** The `for (let i = 0; i < chunkObjs.length; i += 4)` loop awaits `Promise.all` over 4 concurrent `embedText` calls; the upsert pass is serial. | A 10-chunk file issues 3 embed batches (4 + 4 + 2); the 10 upserts run serially. Source: `src/ai/store/ingest.js:63-89`. |
| AI-I-FR-4 | P0 | **`__ingestUpsertChunk` is the ONLY write path for `knowledge_chunks`.** `INSERT ... ON CONFLICT (file_id, chunk_index) DO UPDATE SET text=..., text_hash=..., embedding=..., metadata=...`; `chunkIndex` is the array index, so re-uploads of the same chunk text overwrite the same row (idempotent). | `INSERT INTO knowledge_chunks` from any router handler fails with no route mounted; `chunks.__ingestUpsertChunk` is reachable only via `require('./chunks')` in `ingest.js`. Source: `src/ai/store/chunks.js:15-43`; `src/ai/store/ingest.js:14, 80-89`. |
| AI-I-FR-5 | P0 | **`KB_DIR = process.env.KB_DIR || './data/kb'`.** The worker creates `<KB_DIR>/<fileId>/` if missing and writes `<KB_DIR>/<fileId>/<filename>`. | A first-run ingest creates the directory; subsequent ingests reuse the same `<fileId>` directory. Source: `src/ai/store/ingest.js:16, 43-45`. |
| AI-I-FR-6 | P0 | **Upload route queues, returns 202.** `POST /api/crm/knowledge/upload` (multipart, `multer.memoryStorage()`, 50 MB cap) calls `enqueue({ tenantId, filename, mimeType, buffer })` (worker at `src/ai/store/ingest-worker.js:11-34`), writes a `kb_ingest` audit row, returns `{ fileId, status: 'queued' }`. | A `multipart/form-data` upload with a 1 KB file returns 202 with `{ fileId, status: 'queued' }` and an audit row `kb_ingest`. Source: `src/ai/routes/knowledge.js:15-68`. |

### 4.5 CRM persistence (sub-feature 5)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-C-FR-1 | P0 | **7 endpoints under `/api/crm/entities` and `/api/crm/records`.** GET/POST `/entities` (list / create, zod-validated `name 1..80`, `label 1..120`, optional `icon`/`description`, free-form `schemaJson`); PATCH `/entities/:id` (inserts a new row with `version = max(version) + 1` and id `<old>__v<n>`); DELETE `/entities/:id` (soft delete via `deleted_at = now()`); GET/POST `/entities/:id/records` (paginated list + filter `?contactId=` + `?q=`; insert); PATCH/DELETE `/records/:id`. All tenant-scoped via `requireTenant` middleware (`src/ai/routes/_middleware.js`). | A `POST /api/crm/entities { name:'Deal', label:'Deal', schemaJson:{...} }` returns 201 with `{ id:'ent_xxxx', version:1, ... }`. A `PATCH /api/crm/entities/<id>` with `{ name:'Opportunity' }` returns `{ id:'<id>__v2', version:2 }` while preserving the v1 row. Source: `src/ai/routes/crm.js:15-207`. |
| AI-C-FR-2 | P0 | **`entity_definitions` schema-versioned + soft-deletable.** `UNIQUE (tenant_id, name, version) DEFERRABLE INITIALLY IMMEDIATE` (migration `002-ai-tables.sql:117-130`); `deleted_at TIMESTAMPTZ` (soft delete). List endpoint filters `deleted_at IS NULL`. | Listing after `DELETE /api/crm/entities/<id>` no longer returns the entity, but its historical versions remain in the table. Source: `src/db/migrations/002-ai-tables.sql:117-130`; `src/ai/routes/crm.js:15-38, 104-114`. |
| AI-C-FR-3 | P0 | **`entity_records` carries nullable `contact_id` for the WhatsApp-scope filter.** Records can be tenant-wide (NULL contact_id) or contact-scoped. The data-layer guard is the partial index `entity_records_contact_idx ON entity_records (contact_id) WHERE contact_id IS NOT NULL` (migration `003-indexes.sql`). | A `GET /api/crm/entities/<id>/records?contactId=6281234567890` filters `WHERE contact_id = $contactId`; the trigger's contact-scope post-validate (defense layer 6) consults `entity_records.contact_id`. Source: `src/ai/routes/crm.js:118-156`; `src/db/migrations/003-indexes.sql`. |
| AI-C-FR-4 | P0 | **LLM never writes to the KB; only the CRM.** `src/ai/llm/parse.js:24-30` defines `WhatsAppAutoReplyDecisionSchema = { answer, citations, confidence, fallback_used, reasoning? }` — no `addKbEntry` / `updateKbEntry` action. The chunks store's write methods are module-internal and only `ingest.js` reaches them. | An LLM mocking a KB-write action has no schema field to fill; an HTTP POST attempting to insert a `knowledge_chunks` row returns 404 (no such route). Source: `src/ai/llm/parse.js:24-30`; `src/ai/store/chunks.js:105-115`; `src/ai/store/ingest.js:14, 80-89`. |
| AI-C-FR-5 | P0 | **`entity_relationships` defines typed edges (`cardinality ∈ {'one','many'}`).** Columns: `from_entity`, `from_field`, `to_entity`, `to_field = 'id'` default, `cardinality`. | `cardinality` not in `{'one','many'}` is rejected by the SQL CHECK constraint. Source: `src/db/migrations/002-ai-tables.sql:146-154`. |

### 4.6 WhatsApp trigger (sub-feature 6)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-W-FR-1 | P0 | **`processInboundMessage(inboundMsg, ctx)` is the entry point.** Subscribed via `src/index.js` to Baileys `'messages.upsert'`; fire-and-forget. `ctx` carries `sock` for the typing-indicator integration (cycle `be-typing-indicators-2026-07-10`). | A non-`fromMe`, non-`status@broadcast`, non-empty 1:1 message returns `{ decision: 'send' }` with `messageId`, or `{ decision: 'hold', reason }` on a gate flip, or `{ decision: 'none', reason }` on a skip. Source: `src/ai/whatsapp/trigger.js:71-360`. |
| AI-W-FR-2 | P0 | **Self-echo + status + empty-body guards (defense in depth).** `if (inboundMsg.key.fromMe === true) return { decision: 'none', reason: 'self_echo' }`; `if (rawChatId === 'status@broadcast') return { decision: 'none', reason: 'non_chat_message' }`; `if (!body.trim()) return { decision: 'none', reason: 'empty_body' }`. The dispatcher at `src/index.js` ALSO filters `fromMe === true` upstream so the trigger isn't invoked at all on self-echoes. | A Baileys-echoed outbound message (`fromMe=true`) produces zero LLM calls and zero outbound sends; the inbox markdown is unaffected (handled by the outbound path's `inbox.markLogged`). Source: `src/ai/whatsapp/trigger.js:81-100`; `be_dev_history.md:15-16`. |
| AI-W-FR-3 | P0 | **LID↔PN resolveJid (post-cycle cross-cycle coupling).** When Baileys routes a chat by `@lid` instead of `@s.whatsapp.net`, `inbox.resolveJid(rawChatId)` maps the LID to the known PN before `loadChatMode`; without this, `loadChatMode` returns `chat_not_found` and the auto-reply is silently dropped. | An inbound on `@lid` for a known PN resolves to the same `chats` row the inbox writer and `/api/messages/send` use. Source: `src/ai/whatsapp/trigger.js:93-96`; `be_dev_history.md:11`. (Note: per `Plan.md` §1.3 D2, LID↔PN surface is seq 2 inbox; per D1 cross-cycle coupling the AI trigger's `resolveJid` integration is seq 3.) |
| AI-W-FR-4 | P0 | **`upsertChatOnInbound` (idempotent).** Insert `(id, jid, phone, last_message_preview='', last_message_at, unread_count=0)` with `ON CONFLICT (id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at`. Does NOT mutate `ai_mode` (so operator toggles survive). | A previously-unknown chat's first inbound creates a row with `ai_mode = 'ai'` (DEFAULT). Source: `src/ai/whatsapp/handoff.js:84-96`. |
| AI-W-FR-5 | P0 | **Step 0.5 — message persist + episodic embed (fire-and-forget).** `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status) VALUES (..., 'in', $body, $keyJson, $ts, 'received') ON CONFLICT (id) DO UPDATE SET body=..., timestamp=...`. Then `episodic.embedAndStoreMessage({ id, chatId, body, direction:'in', timestamp })` runs in the same fire-and-forget closure. Embedding failure is non-fatal (the trigger continues regardless). | Re-fires of the same Baileys event (`key.id` collision) overwrite the same row instead of duplicating. Source: `src/ai/whatsapp/trigger.js:122-151`; `src/ai/store/episodic.js:34-52`. |
| AI-W-FR-6 | P0 | **Step 4b — fetch full KB text for numerical grounding.** `SELECT text FROM knowledge_chunks` (single-tenant MVP, no `tenant_id` filter — that column does not exist; `be_dev_history.md:31-32` records a fixed WHERE clause that was breaking the wider check). | The wider ungrounded-number check consults both top-K retrieved chunks AND full KB text; a real KB hit always passes; only true hallucinations get held. Source: `src/ai/whatsapp/trigger.js:195-203`; `be_dev_history.md:30-32`. |
| AI-W-FR-7 | P0 | **Step 9 — confidence gate bypassed when `fallback_used=true`.** The LLM explicitly choosing the fallback path is itself a valid decision; the locked phrase (post hotfix #3, the friendly "Maaf kak… 🙏" / "Sorry, we don't have data on that yet 🙏") is sent verbatim. The gate only fires when `answered = true` with suspiciously low confidence. | A response with `fallback_used: true, confidence: 0.5, answer: "Maaf kak, untuk hal itu belum ada di data kami ya 🙏"` is sent as-is (no `human_pending_flag` flip). Source: `src/ai/whatsapp/trigger.js:303-321`; `be_dev_history.md:35`. |
| AI-W-FR-8 | P0 | **Step 11 — numerical consistency with citation/currency/stripping.** `extractNumbers(text)` strips `[n]` citation markers, the `Rp` prefix, and Indonesian thousands separators (`5.000.000 → 5000000`) BEFORE extracting digits; a number is "grounded" if it appears in EITHER a retrieved chunk's text OR the full KB text. | A response that quotes a price present in any KB chunk (top-K or not) passes; a response that introduces a number absent from the entire KB transitions to `human_pending_flag` with reason `ungrounded_number`. Source: `src/ai/whatsapp/trigger.js:55-69, 325-340`. |
| AI-W-FR-9 | P0 | **Step 12 — send via `sendReply`.** Wrapper at `src/ai/whatsapp/send.js:34-98`: calls `sock.sendMessage(chatId, { text: body })` with up to `ANTI_BAN_MAX_SEND_RETRIES` retries (default 3) on retryable errors (429 / 5xx); persists the outbound message into `messages` with `direction='out', status='sent'`; updates `chats.last_message_preview` + `last_message_at` (BIGINT epoch seconds — no `to_timestamp` cast) + `unread_count=0`; fires-and-forgets `episodic.embedAndStoreMessage` for the outbound reply. | A successful send returns `{ messageId, timestamp }`; a final retry exhaustion throws `SendFailedError` and writes an `auto_reply_hold` audit row with reason `send_failure`. Source: `src/ai/whatsapp/send.js:34-98`; `be_dev_history.md:36` (BIGINT cast fix). |
| AI-W-FR-10 | P0 | **Typing-indicator integration (cycle `be-typing-indicators-2026-07-10`).** `startTyping(sock, chatId)` is called before the LLM createChatCompletion; the returned `stop` is wired early in the catch on parse failure (`trigger.js:282`) AND via `try/finally` covering the post-LLM gates (`trigger.js:357-358`). | The full retro-fit PRD lives at [`docs/be/features/whatsapp-typing/prd.md`](../whatsapp-typing/prd.md). Source: `src/ai/whatsapp/trigger.js:264, 282, 357-358`; `src/whatsapp/typing.js:47-66`. |

### 4.7 State machine (sub-feature 7)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-M-FR-1 | P0 | **`AIReplyMode ∈ {'ai', 'human', 'human_pending_flag'}`.** Persisted as TEXT on `chats.ai_mode` with SQL `CHECK (ai_mode IN ('ai', 'human', 'human_pending_flag'))` (`src/db/migrations/001-initial.sql:14-15`). Byte-equal to `frontend/src/types/crm.ts:7`. | An INSERT with `ai_mode = 'xyz'` is rejected by Postgres. Source: `src/db/migrations/001-initial.sql:14-15`. |
| AI-M-FR-2 | P0 | **5 allowed transitions + 1 forbidden.** Allowed (encoded in `handoff.js:31-37` `ALLOWED` Set): `ai→human_pending_flag`, `ai→human`, `human_pending_flag→ai`, `human_pending_flag→human`, `human→ai`. **Forbidden: `human → human_pending_flag`** (only the operator can re-enable; the BE never auto-flags from `human`). Idempotent same-mode updates (`from === to`) short-circuit. | `transitionChatMode('xxx', 'human', 'human_pending_flag')` throws `ForbiddenTransitionError('human', 'human_pending_flag')`. Source: `src/ai/whatsapp/handoff.js:31-47, 98-113`. |
| AI-M-FR-3 | P0 | **`POST /api/crm/ai/toggle-mode` rejects `mode: 'human_pending_flag'`.** Zod schema `BodySchema = { chatId: string.min(1), mode: enum(['ai','human']) }`; only the operator-driven transition paths land here. Audit row `state_transition { fromMode, toMode, reason:'operator_toggle', actor:'operator' }` on success. | A `POST /api/crm/ai/toggle-mode { chatId, mode: 'human_pending_flag' }` returns 400 with `error: 'ValidationError'`. Source: `src/controllers/ai/toggleMode.js:15-18, 20-74`. |
| AI-M-FR-4 | P0 | **Self-healing on chat mode race.** `transitionChatMode` does `UPDATE chats SET ai_mode = $1 WHERE id = $2 AND ai_mode = $3 RETURNING ai_mode`; if 0 rows return, it re-reads the current mode and throws `ChatNotFoundError` or `ForbiddenTransitionError` accordingly. | A concurrent transition that moves the row out from under the caller surfaces `ForbiddenTransitionError` with the actual current mode. Source: `src/ai/whatsapp/handoff.js:98-113`. |

### 4.8 Defense-in-depth (sub-feature 8) — see §4.10

### 4.9 REST endpoints (sub-feature 9) — see §2.1 table

### 4.10 Defense-in-depth enumeration (sub-feature 10)

| # | Layer | Where (source file:line) | Catches | Test |
|---|---|---|---|---|
| 1 | **Locked system prompt** (BASE + tenant + HARDENED) | `src/ai/settings/composer.js:80-95`; `src/ai/llm/base-prompts.js:7,67`; `src/ai/settings/hardened-rules.js:7-12` (array at L7-12; export at L18) | LLM "forgetting" rules; per-tenant customisation overriding locked behaviour | `composer-byte-identity.test.js` (BE composer ≡ FE composer for same input) |
| 2 | **Structured output schema** (zod, json_schema mode) | `src/ai/llm/parse.js:24-30`; `src/ai/llm/openai-compat.js:126-135` | Free-form invention; malformed JSON | `parse.test.js` (3-attempt retry; final `LlmParseError`) |
| 3 | **Citation grounding** (cosine ≥ 0.85 per cite) | `src/ai/llm/parse.js` (schema requires `citations: number[]`); `src/ai/retrieval/reranker.js:22-35` | Fake citations | (covered indirectly by hybrid retrieval + rerank) |
| 4 | **Numerical consistency** (numbers in answer must appear in cited chunks OR full KB) | `src/ai/whatsapp/trigger.js:55-69, 325-340` | Invented numbers | `trigger.js` step 11 hold → `human_pending_flag` |
| 5 | **NLI entailment check** | — (Phase 2 — not implemented in this cycle) | Unsupported sentences | (Phase 2) |
| 6 | **Contact-scope hard filter** (data layer + prompt + post-validate) | SQL partial index `src/db/migrations/003-indexes.sql`; `src/ai/retrieval/hybrid.js:54-71`; `src/ai/whatsapp/trigger.js:194-203` (post-LLM consults entity_records) | Cross-contact leak | `contact-scope.test.js` |
| 7 | **Confidence gate + turbo cutoff** (τ_retrieval=0.30, τ_user ∈ [0.5, 0.95]) | `src/ai/retrieval/hybrid.js:12, 86-89` (slot; disabled at MVP); `src/ai/whatsapp/trigger.js:206-212, 309-321` | Overconfident hallucinations; retrieval misses | `hybrid.test.js`; `state-machine.test.js` |

### 4.11 Cross-cutting (sub-feature 11)

| ID | Priority | Description | Acceptance |
|---|---|---|---|
| AI-X-FR-1 | P0 | **Audit log — NDJSON append-only.** Every code path on the auto-reply funnel writes a structured NDJSON record to `./data/audit/<UTC-date>.ndjson`. Audit rows produced by this cycle: `auto_reply_sent`, `auto_reply_hold`, `state_transition`, `kb_ingest`. | After a single successful auto-reply, `./data/audit/<UTC-date>.ndjson` has exactly one `auto_reply_sent` row with `chatId`, `tenantId`, `confidence`, `citations.length`, `retrievalScore`, `messageId`. Source: `src/ai/audit/log.js:30-41`; `src/ai/whatsapp/trigger.js:344-352`. |
| AI-X-FR-2 | P0 | **Sensitive-field redaction.** `apiKey`, `password`, `authorization`, `cookie`, `*token` keys are replaced with `'***REDACTED***'` before write. | A log row whose payload contains `{ apiKey: 'sk-xxxx', message: 'hi' }` is written as `{ apiKey: '***REDACTED***', message: 'hi' }`. Source: `src/ai/audit/redact.js:6-31`. |

## 5. Post-cycle hotfixes (rolled into this cycle per D1)

The three hotfixes landed on **2026-07-09** by direct edit to source
(not through any cycle plan). `IntakeProposal.md` decision **D1**
rolls them into seq 3 retro-fit; they are documented here as part
of the cycle's shipped behaviour.

### 5.1 Hotfix #1 — Episodic memory (Layer 2)

- **Goal.** Replace `inbox.getRecentHistory(chatId, 6)` (last-6 turns
  verbatim, unresolvable when the topic was set 4+ turns earlier) with
  a vector-similarity search over every message in the chat. The LLM
  can now resolve follow-up references like "berapa lama" against the
  topic set 4 turns earlier.
- **Files added.**
  - `src/db/migrations/006-episodic-memory.sql` — adds
    `messages.embedding VECTOR(1024)`,
    `chats.conversation_summary TEXT NOT NULL DEFAULT ''`,
    `chats.summary_updated_at BIGINT NOT NULL DEFAULT 0`,
    `messages_chat_id_ts_idx`, best-effort `messages_embedding_ivf_idx
    WITH (lists = 4)`. Idempotent (DO blocks + IF NOT EXISTS).
  - `src/ai/store/episodic.js` — `embedAndStoreMessage({ id, chatId,
    body, direction, timestamp })` UPDATEs `messages.embedding`;
    `episodicSearch({ chatId, queryEmbedding, topK, minTimestamp? })`
    runs cosine-similarity search with `1 - (embedding <=> $1::vector)`,
    filtered `chat_id = $2 AND embedding IS NOT NULL`, ordered
    `embedding <=> $1::vector`, LIMIT `$topK`.
  - `src/test/episodic.test.mjs` — 6 specs (skip on missing args,
    embed+UPDATE on happy path, embedder-failure survival, search `[]`
    on missing args, search returns only chat_id-filtered rows with
    embedding, minTimestamp filter). Patches `require.cache` for the
    CJS deps that `vi.mock` cannot reach.
- **Files edited.**
  - `src/ai/whatsapp/trigger.js` — added step 0.5 INSERT into
    `messages` + `episodic.embedAndStoreMessage`; step 6 builds
    `chatHistory = (await episodic.episodicSearch({ chatId,
    queryEmbedding, topK: EPISODIC_TOPK })).map(h => ({ role, content,
    ts, score }))`; falls back to `inbox.getRecentHistory(chatId, 6)`
    on embedding / DB failure. `EPISODIC_TOPK` is env-tunable
    (default 10).
  - `src/ai/whatsapp/send.js` — after a successful send, fires-and-
    forgets `episodic.embedAndStoreMessage({ ..., direction: 'out' })`.
  - `src/ai/llm/prompt.js` — `buildUserPrompt({ ..., chatHistory,
    maxHistory, summary })` accepts the new params; `chatHistory` is
    sliced to the last `maxHistory` (default 10).
- **Files noted (no change).** `chats.conversation_summary` and
  `chats.summary_updated_at` columns are written by
  `src/ai/settings/summary.js` (see hotfix #2), not by the trigger.
- **Behaviour the trigger now exhibits.**
  - On every inbound, the message body is inserted into `messages`
    (idempotent on Baileys key.id) AND fire-and-forget embedded into
    `messages.embedding`.
  - On every outbound, the reply is fire-and-forget embedded too.
  - On every trigger turn, the LLM prompt is rebuilt from the
    top-`EPISODIC_TOPK` episodic hits (by cosine similarity to the
    user's query embedding) instead of the last-6 inbox-markdown
    entries.
  - Embedding-service outage is non-fatal: the trigger falls back to
    `inbox.getRecentHistory(chatId, 6)` so the LLM still has SOME
    context.
- **Evidence.** `be_dev_history.md:22-29`.

### 5.2 Hotfix #2 — Running conversation summary (Layer 1)

- **Goal.** Carry a high-level narrative thread (`chats.conversation_summary`,
  ~1–4 KB) so the LLM has the gist even when episodic top-K misses.
  Maintained by an LLM-generated digest refreshed at most once per
  10 minutes (`SUMMARY_MIN_REFRESH_SECONDS`, default 600).
- **Files added.**
  - `src/ai/settings/summary.js` — exports `loadChatSummary(chatId)`,
    `updateChatSummary(chatId, tenantId)`,
    `maybeUpdateSummary(chatId, tenantId, opts)` (debounced; refresh
    skipped if `now - summary_updated_at < MIN_REFRESH_SECONDS`).
    The summarizer prompt (`SUMMARIZER_SYSTEM`) emits a JSON
    `{ topic, user_intent, key_facts, decisions, open_questions,
    running_summary }`. Read at most `MAX_CONTEXT_MESSAGES` (default
    30) recent messages, body sliced to `MAX_BODY_CHARS = 400` per
    message, summary capped at `MAX_SUMMARY_CHARS = 4000`. LLM
    failure is non-fatal — keeps the previous summary and bumps
    `summary_updated_at` so we don't retry on every turn.
- **Files edited.**
  - `src/ai/llm/prompt.js` — `buildUserPrompt({ ..., summary })` adds
    a `<CONVERSATION_SUMMARY>…</CONVERSATION_SUMMARY>` block BEFORE
    the `<CONTEXT>` block when summary is non-empty.
  - `src/ai/whatsapp/trigger.js` — loads `chats.conversation_summary`
    via `loadChatSummary(chatId)` and passes it to `buildUserPrompt`;
    schedules an async `maybeUpdateSummary(chatId, tenantId, {
    fireAndForget: true })` after the prompt is built (so the refresh
    is debounced and non-blocking).
- **Locked values (env-tunable).** `SUMMARY_MIN_REFRESH_SECONDS=600`,
  `SUMMARY_MAX_CONTEXT_MESSAGES=30`, `SUMMARY_MAX_CHARS=4000`,
  `MAX_BODY_CHARS=400`. Source: `src/ai/settings/summary.js:23-26`.
- **Evidence.** `be_dev_history.md:23-24, 27`.

### 5.3 Hotfix #3 — Friendly fallback phrase rewrite (intentional FE divergence)

- **Goal.** Replace the strictly-formal Indonesian fallback phrase
  ("Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab
  itu. Mungkin yang Anda maksud adalah ini: …") with a friendly
  semi-formal version using "kak" + "kami" + emoji, per U-feedback
  (2026-07-09) that the old tone was too robotic for an Indonesian
  customer-service context.
- **Files edited.**
  - `src/i18n/ai-fallback.js` —
    `AI_FALLBACK_MESSAGE_ID = "Maaf kak, untuk hal itu belum ada di
    data kami ya 🙏"`;
    `AI_FALLBACK_MESSAGE_EN = "Sorry, we don't have data on that yet
    🙏"`. The file header documents the per-surface divergence and
    notes the FE copy should be updated separately if it needs to
    match this BE copy for UI rendering.
  - `src/ai/llm/base-prompts.js` — Fallback section in both ID and
    EN prompts updated to instruct the LLM to emit the new friendly
    phrase verbatim. The "(byte-identical, tanpa modifikasi apa pun)"
    qualifier in ID and "(byte-identical, no modifications)" in EN
    was **removed** because the new phrase is no longer marked as
    byte-locked (per U feedback).
- **Removed (2026-07-09, immediately after this hotfix landed).**
  Per U direction, the step 8.5 KB-excerpt augmentation in
  `src/ai/whatsapp/trigger.js` and the matching augmentation in
  `src/controllers/ai/ask.js` were removed: when the LLM returns
  `fallback_used: true`, send the locked phrase verbatim with NO
  padding and NO KB recommendation.
- **Intentional FE divergence.** Per `be_dev_history.md:41`:
  "the change to `AI_FALLBACK_MESSAGE_ID` and `BAILEYS_AI_SYSTEM_PROMPT_ID`
  is an intentional per-surface divergence. The FE copy
  (`frontend/src/i18n/id.json:74` + `frontend/src/lib/ai/systemPrompt.ts`
  fallback section) was NOT updated. The composer-byte-identity test
  (1 spec) now fails as a result — this is the test working as
  intended. If U wants byte-equality restored, the FE side must be
  updated separately."
- **Evidence.** `be_dev_history.md:37-41`;
  `src/i18n/ai-fallback.js:10-13`; `src/ai/llm/base-prompts.js:62-65, 121-124`.

## 6. Locked values (cycle-level)

These are the values this cycle locks across versions. PRD-001 §4.3
covers them project-wide; this PRD anchors them against the cycle's
source files.

| ID | Locked value | Lives in | Evidence |
|---|---|---|---|
| FR-28 | `τ_retrieval = 0.30` (turbo cutoff; documented slot) | `src/ai/retrieval/hybrid.js::TAU_TURBO` (currently `0.0`) | `hybrid.js:12` |
| FR-29 | `τ_user = settings.whatsappAutoReply.confidenceThreshold` (default `0.7`, range `[0.5, 0.95]` step `0.05`) | `src/ai/settings/defaults.js`; `src/ai/settings/schema.js:25-29` | `defaults.js:20-23`; `schema.js:24-29` |
| FR-30 | `AIReplyMode = 'ai' \| 'human' \| 'human_pending_flag'` | `src/db/migrations/001-initial.sql:14-15` + `src/ai/whatsapp/handoff.js:31-37` | `001-initial.sql:14-15`; `handoff.js:31-37` |
| FR-31 | Hardened 4-rule block (Indonesian) | `src/ai/settings/hardened-rules.js` | `hardened-rules.js:7-12` |
| FR-32 | `BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` (post-hotfix: "byte-identical" qualifier removed in Fallback section) | `src/ai/llm/base-prompts.js` | `base-prompts.js:7, 62-65, 67, 121-124` |
| FR-33 | `DEFAULT_AI_SETTINGS` | `src/ai/settings/defaults.js` | `defaults.js:7-27` |
| FR-34 | `EPISODIC_TOPK = Number(process.env.EPISODIC_TOPK || 10)` | `src/ai/whatsapp/trigger.js:31` | hotfix #1 |
| FR-35 | `SUMMARY_MIN_REFRESH_SECONDS = 600` (10 min) | `src/ai/settings/summary.js:23` | hotfix #2 |
| FR-36 | `SUMMARY_MAX_CONTEXT_MESSAGES = 30` | `src/ai/settings/summary.js:24` | hotfix #2 |
| FR-37 | `SUMMARY_MAX_CHARS = 4000` (4 KB cap) | `src/ai/settings/summary.js:25` | hotfix #2 |
| FR-38 | `MAX_BODY_CHARS = 400` (per-message body slice in summary) | `src/ai/settings/summary.js:26` | hotfix #2 |
| FR-39 | `AI_FALLBACK_MESSAGE_ID = "Maaf kak, untuk hal itu belum ada di data kami ya 🙏"` (post hotfix #3; no longer byte-locked) | `src/i18n/ai-fallback.js:10` | hotfix #3 |
| FR-40 | `AI_FALLBACK_MESSAGE_EN = "Sorry, we don't have data on that yet 🙏"` (post hotfix #3; no longer byte-locked) | `src/i18n/ai-fallback.js:12-13` | hotfix #3 |

## 7. Sub-feature inventory (one-line summary)

| # | Sub-feature | Files | Cycles / hotfixes |
|---|---|---|---|
| 1 | AI Settings service | `src/ai/settings/{store,composer,hardened-rules,defaults,schema}.js`; `src/ai/routes/settings.js`; `src/db/migrations/002-ai-tables.sql` (table) | cycle `be-ai-auto-reply-2026-07-03` |
| 2 | LLM gateway | `src/ai/llm/{openai-compat,anthropic-compat,prompt,parse,embed,base-prompts}.js` | cycle + hotfix #3 (base-prompts fallback qualifier removed) |
| 3 | Retrieval | `src/ai/retrieval/{hybrid,bm25,ann,reranker,chunker,ocr,embed-uses-llm/embed}.js` | cycle |
| 4 | Ingest pipeline | `src/ai/store/ingest.js`; `src/ai/store/ingest-worker.js`; `src/ai/store/chunks.js` (write-restricted) | cycle |
| 5 | CRM store | `src/ai/routes/crm.js`; `src/db/migrations/002-ai-tables.sql`; `src/ai/store/chunks.js` (defense) | cycle |
| 6 | WhatsApp trigger | `src/ai/whatsapp/{trigger,handoff,send}.js`; integration with `src/whatsapp/typing.js`; integration with `src/inbox/writer.js` (`resolveJid`, `getRecentHistory`); `src/index.js` subscription | cycle + hotfix #1 (episodic integration) + hotfix #2 (summary integration) + cross-cycle coupling with `be-typing-indicators-2026-07-10` |
| 7 | State machine | `src/ai/whatsapp/handoff.js`; `src/db/migrations/001-initial.sql`; `src/controllers/ai/toggleMode.js` | cycle |
| 8 | Defense-in-depth (7 layers) | distributed across the modules above | cycle |
| 9 | REST endpoints | `src/ai/routes/{ai,crm,knowledge}.js`; `src/controllers/ai/{ask,replyPreview,toggleMode,schemas}.js` | cycle |
| 10 | Cross-cutting audit + redaction | `src/ai/audit/{log,redact}.js` | cycle |

## 8. How it composes (cycle-level topology)

```
                              ┌────────────────────────────────────────────┐
                              │  src/whatsapp/client.js (Baileys socket)   │
                              │  src/index.js: subscribes messages.upsert  │
                              │  → processInboundMessage (fire-and-forget) │
                              └────────────────────┬───────────────────────┘
                                                   │
              ┌────────────────────────────────────┼──────────────────────────────────┐
              │                                    │                                  │
       (defense: self-echo,                 inbox.resolveJid (LID→PN)          inbox.markLogged /
        status, empty-body                       │                          getRecentHistory fallback
        filters)                                 ▼                                  │
              │                    src/ai/whatsapp/handoff.js                     │
              │                    loadChatMode / upsertChatOnInbound              │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/settings/store.js (Postgres ai_settings)       │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/settings/composer.js                           │
              │              buildSystemPrompt({ settings, tenantName, language,   │
              │                                     basePrompt })                   │
              │              = BASE (base-prompts.js) + tenant fragment             │
              │                + HARDENED (hardened-rules.js, byte-stable)          │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/retrieval/hybrid.js                            │
              │              BM25 (bm25.js) + ANN (ann.js) → RRF                    │
              │              → rerank (reranker.js, MiniMax-embed cosine)          │
              │              → turbo cutoff (TAU_TURBO slot @ 0.0 today)           │
              │              → contactScopeApplied = true                          │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/llm/prompt.js                                   │
              │              buildUserPrompt({ question, contextChunks,            │
              │                  chatHistory ← episodic.episodicSearch              │
              │                  summary ← summaryStore.loadChatSummary,           │
              │                  contactPhone })                                   │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/llm/openai-compat.js (default)                  │
              │              POST {baseURL}/v1/responses                           │
              │              2-attempt retry on 429/5xx                            │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/llm/parse.js                                   │
              │              parseStructuredOutput (≤3 attempts,                    │
              │              zod WhatsAppAutoReplyDecisionSchema)                  │
              │                              │                                     │
              │                              ▼                                     │
              │              trigger.js step 9 (confidence gate,                    │
              │                bypass when fallback_used)                           │
              │              step 11 (numerical consistency,                       │
              │                consults top-K + full KB text)                      │
              │              step 12 → src/ai/whatsapp/send.js                     │
              │                  sock.sendMessage + retry +                        │
              │                  messages row + chats preview update +             │
              │                  episodic.embedAndStoreMessage (fire-and-forget)   │
              │                              │                                     │
              │                              ▼                                     │
              │              src/ai/audit/log.js → ./data/audit/<date>.ndjson      │
              │              (with src/ai/audit/redact.js)                         │
              │                              │                                     │
              │                              ▼                                     │
              │              summaryStore.maybeUpdateSummary                       │
              │              (debounced 10-min, fire-and-forget)                    │
              │                                                                      │
              ▼                                                                      ▼
   src/inbox/writer.js (per-contact .md, LID↔PN,                src/ai/store/episodic.js
    getRecentHistory — fallback only)                          (messages.embedding, episodicSearch)
                                                                  ▲
                                                                  │
                                              src/db/migrations/006-episodic-memory.sql
                                              (messages.embedding VECTOR(1024),
                                               chats.conversation_summary TEXT,
                                               chats.summary_updated_at BIGINT,
                                               messages_embedding_ivf_idx WITH (lists=4))
```

The KB pipeline is parallel (operator-driven, off the trigger path):

```
  POST /api/crm/knowledge/upload
    src/ai/routes/knowledge.js:50-68
       │ multer memory (50 MB cap)
       ▼
  src/ai/store/ingest-worker.js:11-34 (enqueue)
       │
       ▼
  src/ai/store/ingest.js:18-105
       │ status: queued → ingesting → indexed|failed
       │ OCR → chunk (chunker.js, ~512 tok, 50 tok overlap)
       │     → embed (concurrency 4)
       │     → upsert via chunksStore.__ingestUpsertChunk
       │       (write-restricted; only ingest.js reaches it)
       ▼
  knowledge_chunks (pgvector, knowledge_chunks_embedding_idx)
  knowledge_files (status, chunks_count, last_error, ingested_at)
```

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-AI-1 | **Cross-contact leak via crafted prompt.** | Defense layer 6 — SQL `entity_records_contact_idx` partial index, `hybrid.js` `contactScopeApplied` flag, prompt reminder in `BASE` block, post-LLM trigger guard. Test: `contact-scope.test.js`. |
| R-AI-2 | **Schema drift between FE and BE composer.** | `composer-byte-identity.test.js` asserts byte-equivalence. After hotfix #3 the BE composer now produces a string whose fallback section is no longer byte-locked, so this test intentionally fails; recorded as intentional per-surface divergence (`be_dev_history.md:41`). |
| R-AI-3 | **KB write path backdoor.** | Defense layer 4 — `chunks.js` exports `__ingestUpsertChunk` and `__ingestDeleteForFile` only as module-internal methods; only `ingest.js` reaches them. The LLM structured output schema has no KB-write action; no router endpoint accepts a chunk write. |
| R-AI-4 | **Embedding-service outage at trigger time.** | `hybrid.js` swallows ANN errors and falls back to BM25; `trigger.js` step 0.5 swallows embedding errors and proceeds without episodic history; the `getRecentHistory(chatId, 6)` fallback keeps the LLM in-context. Summary refresh failure keeps the previous summary. |
| R-AI-5 | **LLM provider rate limits at scale.** | 2-attempt retry with `500 * 2^attempt` jittered backoff; per-call `AbortController` honours `LLM_TIMEOUT_MS` (default 30s). On retry exhaustion the trigger transitions to `human_pending_flag`. |
| R-AI-6 | **Auto-reply spam loop on self-echoes.** | Dispatcher-level filter at `src/index.js` (`if (m && m.key && m.key.fromMe === true) continue;`) + trigger-level guard at `trigger.js:81-83`. (`be_dev_history.md:15-16`). |
| R-AI-7 | **Outbound `messages` insert fails because the table didn't exist (cycle `be-ai-auto-reply` was missing migration `005`).** | Migration `005-messages-table.sql` creates `messages (id, chat_id, direction, body, key, timestamp, status)` with `messages_chat_id_ts_idx`. Fix landed during this cycle. (`be_dev_history.md:17`.) |
| R-AI-8 | **Bigint cast on `last_message_at` was causing `send_failure` audits after the message was already delivered.** | `UPDATE chats` now passes the BIGINT epoch seconds as `$2` without a `to_timestamp()` cast. (`be_dev_history.md:36`.) |
| R-AI-9 | **Ungrounded number held chat when a real KB price didn't make top-5 retrieval.** | Trigger step 11 now also consults `SELECT text FROM knowledge_chunks` (full KB, ~2 KB) so a real KB hit always passes; only true hallucinations are held. Step 4b fixed the missing `tenant_id` clause (knowledge_chunks is single-tenant in MVP). (`be_dev_history.md:30-32`.) |
| R-AI-10 | **Removed KB-excerpt augmentation in fallback path was too robotic and unwanted.** | Per U direction (2026-07-09), step 8.5 in `trigger.js` and the matching augmentation in `ask.js` were removed; the locked fallback phrase is sent verbatim. (`be_dev_history.md:39-40`.) |
| R-AI-11 | **pgvector on small datasets (< 1k chunks).** | `ivfflat` `lists = 100` baseline; for the episodic store `messages_embedding_ivf_idx WITH (lists = 4)` (per migration 006). |
| R-AI-12 | **NLI cross-check at scale.** | Deferred Phase 2; FR slot documents the future check (defense layer 5). |
| R-AI-13 | **Cross-encoder reranker.** | Deferred Phase 2; current path is MiniMax-embedding cosine. |
| R-AI-14 | **Multi-tenant wrapper (RLS, per-tenant vector namespacing, JWT claim).** | Deferred Phase 3; current code is single-tenant (`SINGLE_TENANT_ID='default'`). |

## 10. Out-of-Scope (explicit, cycle-level)

- Multi-tenant RLS, per-tenant vector namespacing, JWT claim — Phase 3.
- NLI entailment cross-check (defense layer 5) — Phase 2.
- Cross-encoder reranker — Phase 2.
- Streaming replies with typing indicators — Phase 2.
- LLM provider cutover (Anthropic path is wired; production cutover
  is Phase 2).
- KB auto-tag extraction at ingest time — Phase 3.
- Audit-log export (compliance / S3) — Phase 3.
- Real FE ↔ BE wiring (FE mockup stays mock-only per PRD-001 NG4).
  The intentional FE divergence on `AI_FALLBACK_MESSAGE_ID` /
  `BAILEYS_AI_SYSTEM_PROMPT_ID` (post hotfix #3) is documented as
  such in §5.3.
- HTTP API authentication / authorization (operator must bind to
  `127.0.0.1` or front with a reverse proxy).
- **Re-implementation of any feature.** This PRD documents shipped
  behaviour; drift is a finding for the seq 4 audit, not a call to
  change code.

## 11. Approval

- [ ] **PRD_APPROVAL** gate cleared for `be-ai-auto-reply-2026-07-03`
- [ ] Approved by: `@supervisor`, on completion of the round-1 verdicts
      (PM / RA / TP / BE) and the round-2 audit.

> This PRD is a **migration artifact** — it documents the AI auto-reply
> cycle that shipped on 2026-07-03 plus the three post-cycle hotfixes
> of 2026-07-09 (D1). Approval here means "this is the product as it
> stands today, post-ship, including the intentional FE divergence
> recorded at `be_dev_history.md:41`."

## 12. Change Log

| Version | Date       | Author             | Change |
|---------|------------|--------------------|--------|
| 1.0.0   | 2026-07-10 | @product-manager   | Initial draft. Cycle-level retro-fit PRD for `be-ai-auto-reply-2026-07-03` plus the three post-cycle hotfixes of 2026-07-09 (episodic memory, chat summary, friendly fallback phrase rewrite — all rolled into seq 3 per D1). Documents `src/ai/settings/{store,composer,hardened-rules,defaults,schema,summary}.js`, `src/ai/llm/{openai-compat,anthropic-compat,prompt,parse,embed,base-prompts}.js`, `src/ai/retrieval/{hybrid,bm25,ann,reranker,chunker,ocr}.js`, `src/ai/store/{chunks,ingest,ingest-worker,episodic}.js`, `src/ai/whatsapp/{trigger,handoff,send}.js`, `src/ai/routes/{ai,crm,knowledge}.js`, `src/controllers/ai/{ask,replyPreview,toggleMode,schemas}.js`, `src/ai/audit/{log,redact}.js`, `src/i18n/ai-fallback.js`, and migrations `001-initial.sql` through `006-episodic-memory.sql`. Cites PRD-001 (project-level), FRD-001 (project-level), PLAN-RETROFIT-001 §3 Batch 3, MVP.md, and the 5 surviving per-feature PRDs. Intentional FE divergence on `AI_FALLBACK_MESSAGE_ID` / `BAILEYS_AI_SYSTEM_PROMPT_ID` documented at §5.3 per `be_dev_history.md:41`. attempt_id: `ATT-SEQ3-PM-1`. doc_id: `PRD-AI-1`. run_id: `WF_EXISTING-retrofit-all-features-2026-07-10`. cycle_id: `be-ai-auto-reply-2026-07-03`. |

---

**Next step after this PRD lands**: the parallel seq 3 dispatches
(`@requirements-analyst` → `docs/be/features/be-ai-auto-reply-2026-07-03/spec.md`,
`@technical-planner` → `docs/be/features/be-ai-auto-reply-2026-07-03/plan.md`,
`@be-engineer` → `docs/be/features/be-ai-auto-reply-2026-07-03/build.md`)
anchor their own documents against this PRD's §4 (Functional
Requirements — 11 sub-feature tables + 7-layer defense-in-depth),
§5 (3 post-cycle hotfixes), §6 (Locked values), and §9 (Risks).
Round 2 (Audit) verifies the four artifacts agree against the cycle
source files listed in §7 and §8, and against `be_dev_history.md`
rows 1–41 (the AI cycle + the 3 post-cycle hotfixes).