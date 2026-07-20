<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md
  - docs/tech/crm-data-model.md
  - docs/tech/ai-settings-data-model.md
  - docs/crm/features/ai-chat/systemPrompt.md
-->

# BE Module Overview — AI Auto-Reply Engine

> **Goals source-of-truth:** [`docs/be/MVP.md`](../MVP.md). If anything in
> this document conflicts with MVP.md, MVP.md wins. Any SSoT drift must
> propagate from MVP.md to this tree, not the other way around.

This module ships the **Baileys-side AI auto-reply engine** and the
**team `/api/crm/ai/ask` endpoint** into the existing Express backend
at `src/`. It is greenfield — `docs/be/**` did not exist before run
`be-ai-auto-reply-2026-07-03`.

## 1. Purpose

Replace the legacy `/api/ai/ask` mock with a real, gated, multi-layer
auto-reply pipeline that:

1. Receives an inbound WhatsApp message via Baileys's `messages.upsert`.
2. Composes a locked, byte-stable system prompt (BASE + per-tenant
   fragment + HARDENED rules).
3. Retrieves evidence with a hybrid (BM25 + ANN) search scoped to the
   chat's contact.
4. Calls the LLM (MiniMax-M3 via OpenAI-compatible endpoint; fallback
   to Anthropic-compatible via env switch).
5. Applies the 7-layer defense-in-depth gate.
6. Either sends, flags for human review, or skips — and writes an
   audit log row.

It also exposes the **team `/api/crm/ai/ask` endpoint** for the in-app
dashboard `/ai` page (no contact filter, KB + ALL tenant CRM records).

## 2. Scope (this run)

### 2.1 In scope

- Postgres storage with migrations (`001-initial.sql`, `002-ai-tables.sql`,
  `003-indexes.sql`) and `pgvector` extension.
- LLM gateway: OpenAI-compatible client pointed at MiniMax-M3; structured
  outputs; retries; parse-retry; confidence gate.
- Full KB pipeline: PDF/DOCX/HTML/XLSX OCR → semantic chunker →
  MiniMax embeddings → Postgres upsert with idempotency.
- Hybrid retrieval: Postgres FTS (BM25) + pgvector cosine (ANN) + MiniMax
  embeddings-based re-rank.
- WhatsApp `messages.upsert` handler with the 13-step flow.
- `AIReplyMode` state machine + SQL CHECK constraint.
- Contact-scope hard filter at three layers: SQL, prompt, post-validation.
- REST endpoints (14 total, per MVP.md §2.3).
- Audit log (pino structured logs to `./data/audit/<date>.ndjson`).
- Vitest suite (~30+ specs).

### 2.2 Out of scope (deferred)

- Multi-tenant RLS / per-tenant vector namespacing (Phase 3).
- FE wiring to the new BE endpoints (a separate cycle; mostly trivial
  fetch swap). The FE keeps its mocks this run.
- Cross-encoder reranker (Phase 2; cosine re-rank is the MVP path).
- NLI entailment check at scale (Phase 2; stubbed this run).
- Real-time UI updates via WebSocket (Phase 3).
- KB auto-tag extraction at ingest (Phase 3).

## 3. Surface map

The BE module exposes three runtime surfaces:

| Surface | Entry point | Consumer | Contact filter |
|---|---|---|---|
| **WhatsApp auto-reply** | `src/ai/whatsapp/trigger.js::processInboundMessage(inboundMsg)` | Baileys `messages.upsert` subscription | **HARD** filter `contact_id = chat.contact_id` at SQL layer + post-validation |
| **Team `/api/crm/ai/ask`** | `POST /api/crm/ai/ask` | FE `/ai` dashboard page | **NONE** — full KB + all tenant CRM records |
| **KB + CRM persistence** | `GET/POST/PATCH/DELETE /api/crm/entities/**`, `/api/crm/knowledge/**` | FE schema-designer / data-viewer / knowledge upload | NA (operator-driven) |

A fourth surface — **preview** — is implemented read-only via
`POST /api/crm/ai/reply-preview` so an operator can see what the AI
would send for a given `(chatId, body)` BEFORE flipping the chat to AI
mode. Preview does NOT send.

## 4. Locked decisions (U-approved, this run)

These are the six locked decisions from MVP.md §1. Every other doc in
this tree must align with this table.

| # | Decision | Value | Source |
|---|---|---|---|
| 1 | LLM provider | `MiniMax-M3` (MiniMax) via OpenAI-compatible endpoint; Anthropic-compatible available via `LLM_PROVIDER` env var | `docs/be/MVP.md` §1 row 1 |
| 2 | Database | **PostgreSQL** from day one (no SQLite intermediate) | `docs/be/MVP.md` §1 row 2 |
| 3 | Embeddings | Full pipeline, provider = MiniMax embeddings endpoint | `docs/be/MVP.md` §1 row 3 |
| 4 | Scope | Full MVP (no half work) | `docs/be/MVP.md` §1 row 4 |
| 5 | Backend language/runtime | Node.js 18+, Express (existing) | `docs/be/MVP.md` §1 row 5 |
| 6 | FE coupling | None — FE keeps its mocks; the BE reuses the FE composer string verbatim over the wire | `docs/be/MVP.md` §1 row 6 |

## 5. Locked value table (byte-stable across FE and BE)

The following values are **byte-stable** across the FE codebase and
the BE mirror. Drift in any row is a blocker. See
`docs/tech/be-data-model.md` §"Locked values" for the authoritative
table with file:line anchors on both sides.

| Value | FE declaration | BE mirror | Doc anchor |
|---|---|---|---|
| `AI_CONFIDENCE_THRESHOLD = 0.65` | `frontend/src/lib/config.ts:13` | n/a (FE-only; legacy WA module) | `docs/frontend/api/api-spec.md` §2.4 |
| `CRM_AI_CONFIDENCE_THRESHOLD = 0.7` | `frontend/src/lib/config-crm.ts:16` | `src/ai/settings/defaults.js` → `whatsappAutoReply.confidenceThreshold` | `docs/tech/crm-data-model.md` §3 |
| `AiLanguage = 'id' \| 'en' \| 'id-mod'` | `frontend/src/types/aiSettings.ts:32` | `src/ai/settings/schema.js` (zod enum) | `docs/tech/ai-settings-data-model.md` §1 |
| `AIReplyMode = 'ai' \| 'human' \| 'human_pending_flag'` | `frontend/src/types/crm.ts:7` | SQL `CHECK (ai_mode IN (...))` + `src/ai/whatsapp/handoff.js` | `docs/tech/ai-reply-state-machine.md` §1 |
| `getHardenedRulesBlock()` 4-rule Indonesian block | `frontend/src/lib/ai/systemPrompt.ts:257-262` | `src/ai/settings/hardened-rules.js` | `docs/tech/ai-settings-data-model.md` §3.2 |
| `BAILEYS_AI_SYSTEM_PROMPT_ID` / `_EN` template literals | `frontend/src/lib/ai/systemPrompt.ts:43-167` | `src/ai/settings/composer.js` (byte-equivalent output) | `docs/crm/features/ai-chat/systemPrompt.md` §"Indonesian rules" / §"English rules" |
| `useAiSettingsStore.DEFAULT_AI_SETTINGS` defaults | `frontend/src/types/aiSettings.ts:72-90` | `src/ai/settings/defaults.js` | `docs/tech/ai-settings-data-model.md` §4.1 |
| Indonesian fallback phrase | `frontend/src/i18n/id.json:74` (`ai.fallback.message`) | embedded inside `BAILEYS_AI_SYSTEM_PROMPT_ID` (LLM emits it verbatim on fallback) | `docs/crm/features/ai-chat/systemPrompt.md` §"Locked values" row 4 |

## 6. Glossary

| Term | Meaning |
|---|---|
| **Turbo cutoff** | The retrieval-score threshold `τ_retrieval = 0.30` below which the BE skips the LLM and sets `aiMode = 'human_pending_flag'`. Locked. |
| **Confidence gate** | The per-tenant `τ_user = settings.whatsappAutoReply.confidenceThreshold` (default `0.7`) that the LLM's `confidence` must clear before the BE sends. |
| **Hardened rules** | The four Bahasa Indonesia rules in `getHardenedRulesBlock()`. Always appended to the system prompt, never user-editable. |
| **Contact-scope hard filter** | A SQL-layer `WHERE entity_records.contact_id = chat.contact_id` predicate applied to ALL WhatsApp-scope queries. Defense-in-depth layer 6. |
| **Composer** | The function that produces the system prompt string. BE mirror of the FE's `buildSystemPrompt({ settings, tenantName, language })`. |
| **Hybrid retrieval** | Union of BM25 (Postgres FTS) and ANN (pgvector cosine), with MiniMax-embeddings cosine re-ranking on top. |
| **Structured outputs** | `response_format: { type: 'json_schema', ... }` mode of the OpenAI-compatible API. The BE mandates `zodParse(reply) === success` before any reply is returned. |
| **Handoff** | The act of changing `chats.ai_mode`. Governed by the AIReplyMode state machine. |
| **Audit log** | Pino structured NDJSON records written to `./data/audit/<date>.ndjson`. Every code path writes a row. |

## 7. Route map (BE-only)

Full contract lives in [`../api/api-spec.md`](../api/api-spec.md). Quick map:

| Verb | Path | Source MVP.md § |
|---|---|---|
| POST | `/api/crm/ai/ask` | §2.3 |
| POST | `/api/crm/ai/reply-preview` | §2.3 |
| POST | `/api/crm/ai/toggle-mode` | §2.3 |
| GET | `/api/crm/entities` | §2.3 |
| POST | `/api/crm/entities` | §2.3 |
| PATCH | `/api/crm/entities/:id` | §2.3 |
| DELETE | `/api/crm/entities/:id` | §2.3 |
| GET | `/api/crm/entities/:id/records` | §2.3 |
| POST | `/api/crm/entities/:id/records` | §2.3 |
| PATCH | `/api/crm/records/:id` | §2.3 |
| DELETE | `/api/crm/records/:id` | §2.3 |
| GET | `/api/crm/knowledge/files` | §2.3 |
| POST | `/api/crm/knowledge/upload` | §2.3 |
| GET | `/api/crm/knowledge/files/:id` | §2.3 |
| DELETE | `/api/crm/knowledge/files/:id` | §2.3 |

(`/api/crm/ai/settings` GET/PUT — referenced in
`docs/tech/ai-settings-data-model.md` §5.2 — is **out of scope** for
this run; MVP.md §2.3 does not list it. The FE keeps its localStorage
adapter.)

## 8. Cross-references

- Goals: [`../MVP.md`](../MVP.md).
- API: [`../api/api-spec.md`](../api/api-spec.md).
- Features:
  [`../features/ai-orchestration/spec.md`](../features/ai-orchestration/spec.md),
  [`../features/ai-whatsapp-trigger/spec.md`](../features/ai-whatsapp-trigger/spec.md),
  [`../features/ai-state-machine/spec.md`](../features/ai-state-machine/spec.md),
  [`../features/kb-ingestion/spec.md`](../features/kb-ingestion/spec.md),
  [`../features/crm-store/spec.md`](../features/crm-store/spec.md).
- Data model (BE-side TS + SQL mirror):
  [`../../tech/be-data-model.md`](../../tech/be-data-model.md).
- Postgres DDL: [`../../tech/postgresql-schema.md`](../../tech/postgresql-schema.md).
- FE composer SSoT (canonical system prompt):
  [`../../crm/features/ai-chat/systemPrompt.md`](../../crm/features/ai-chat/systemPrompt.md).
- FE data model (parallel interface definitions):
  [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md),
  [`../../tech/ai-settings-data-model.md`](../../tech/ai-settings-data-model.md),
  [`../../tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md).