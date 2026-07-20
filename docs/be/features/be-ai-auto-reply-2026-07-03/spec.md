<!--
owner: @requirements-analyst
cycle_id: be-ai-auto-reply-2026-07-03
attempt_id: ATT-SEQ3-RA-1
doc_id: SPEC-AI-1
linked_prd_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_plan_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/plan.md (PLAN-AI-1)
linked_build_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/build.md (BUILD-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
linked_mvp: docs/be/MVP.md
purpose: MIGRATION ARTIFACT — per-cycle SPEC decomposing PRD-AI-1
         into per-feature functional specifications (settings/composer,
         LLM gateway, retrieval, ingest, CRM, WhatsApp trigger +
         AIReplyMode, defense-in-depth, REST, episodic memory, chat
         summary, fallback phrase rewrite, test surface). Code is the
         source of truth; this SPEC documents what IS, not what should
         be. Every acceptance criterion is verifiable by reading the
         cited src/<path>:<line> location or docs/<path> reference.
         Per-feature test coverage is enumerated in §12.
         Includes §13 Findings Worth Carrying Forward (G-AI-7/8/9 from
         BUILD-AI-1).
-->

# BE AI Auto-Reply — SPEC (`be-ai-auto-reply-2026-07-03`)

> **Migration artifact.** Per-cycle SPEC decomposing
> [`PRD-AI-1`](./prd.md) (peer, written by `@product-manager` in this
> same round) into testable functional specifications, one per
> integration surface, for the twelve BE AI auto-reply features:
> **settings/composer/byte-identity, LLM gateway, hybrid retrieval,
> KB ingest, CRM persistence, WhatsApp trigger + AIReplyMode,
> defense-in-depth, REST endpoints, episodic memory (post-cycle
> hotfix #2), chat summary (post-cycle hotfix #3), fallback phrase
> rewrite (post-cycle hotfix #4), test surface**. This SPEC is part
> of the
> [`WF_EXISTING-retrofit-all-features-2026-07-10`](../../../../sot/general/OrchestratorState.md)
> retro-fit run (seq 3 / Batch 3). **Code is the source of truth** —
> `src/ai/settings/*`, `src/ai/llm/*`, `src/ai/retrieval/*`,
> `src/ai/store/*`, `src/ai/whatsapp/*`, `src/ai/routes/*`,
> `src/ai/audit/*`, `src/controllers/ai/*`, `src/i18n/ai-fallback.js`
> are authoritative. §13 carries forward the three findings
> (G-AI-7 typo, G-AI-8 τ_retrieval drift, G-AI-9 per-surface threshold
> divergence) flagged by [`BUILD-AI-1`](./build.md) §3.2 / §5.4.
>
> **Linked upstream**: [`PRD-AI-1`](./prd.md) (cycle-level),
> [`PLAN-AI-1`](./plan.md) (cycle-level, by `@technical-planner`),
> [`BUILD-AI-1`](./build.md) (cycle-level, by `@be-engineer`),
> [`PRD-001`](../../../../sot/general/PRD.md) (project-level,
> §4.2 BE AI auto-reply cycle rows FR-12..FR-27),
> [`FRD-001`](../../../../sot/general/FRD.md) (project-level —
> modules `ai-llm`, `ai-retrieval`, `ai-whatsapp`, `ai-crm`,
> `ai-audit`, features F-12..F-38),
> [`PLAN-RETROFIT-001`](../../../../sot/general/Plan.md) §3 Batch 3,
> [`MVP.md`](../../../MVP.md) (AI cycle SSoT).

## Document Metadata

```yaml
---
doc_id: SPEC-AI-1
version: 1.0.0
status: review
created: 2026-07-10
updated: 2026-07-10
author: @requirements-analyst
attempt_id: ATT-SEQ3-RA-1
run_id: WF_EXISTING-retrofit-all-features-2026-07-10
cycle_id: be-ai-auto-reply-2026-07-03
linked_prd_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/prd.md (PRD-AI-1)
linked_plan_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/plan.md (PLAN-AI-1)
linked_build_cycle: docs/be/features/be-ai-auto-reply-2026-07-03/build.md (BUILD-AI-1)
linked_prd_project: sot/general/PRD.md (PRD-001)
linked_frd_project: sot/general/FRD.md (FRD-001)
linked_plan_project: sot/general/Plan.md (PLAN-RETROFIT-001)
linked_mvp: docs/be/MVP.md
mode: full
classification: EXISTING_PROJECT
source_of_truth:
  db:
    - src/db/client.js
    - src/db/migrations/000-base-chats.sql
    - src/db/migrations/001-initial.sql
    - src/db/migrations/002-ai-tables.sql
    - src/db/migrations/003-indexes.sql
    - src/db/migrations/004-bge-m3-1024dim.sql
    - src/db/migrations/005-messages-table.sql
    - src/db/migrations/006-episodic-memory.sql
  settings:
    - src/ai/settings/store.js
    - src/ai/settings/composer.js
    - src/ai/settings/hardened-rules.js
    - src/ai/settings/defaults.js
    - src/ai/settings/schema.js
    - src/ai/settings/summary.js
  llm:
    - src/ai/llm/openai-compat.js
    - src/ai/llm/anthropic-compat.js
    - src/ai/llm/parse.js
    - src/ai/llm/prompt.js
    - src/ai/llm/embed.js
    - src/ai/llm/base-prompts.js
  retrieval:
    - src/ai/retrieval/hybrid.js
    - src/ai/retrieval/bm25.js
    - src/ai/retrieval/ann.js
    - src/ai/retrieval/reranker.js
    - src/ai/retrieval/chunker.js
    - src/ai/retrieval/ocr.js
  store:
    - src/ai/store/entities.js
    - src/ai/store/chunks.js
    - src/ai/store/ingest.js
    - src/ai/store/ingest-worker.js
    - src/ai/store/episodic.js
  whatsapp:
    - src/ai/whatsapp/trigger.js
    - src/ai/whatsapp/handoff.js
    - src/ai/whatsapp/send.js
  routes:
    - src/ai/routes/index.js
    - src/ai/routes/ai.js
    - src/ai/routes/crm.js
    - src/ai/routes/knowledge.js
    - src/ai/routes/settings.js
    - src/ai/routes/_middleware.js
  audit:
    - src/ai/audit/log.js
    - src/ai/audit/redact.js
  controllers:
    - src/controllers/ai/ask.js
    - src/controllers/ai/replyPreview.js
    - src/controllers/ai/toggleMode.js
  i18n:
    - src/i18n/ai-fallback.js
  server_bootstrap:
    - src/index.js
linked_frd_features:
  - F-12  # AI settings service + composer + hardened rules
  - F-13  # LLM gateway (OpenAI-compatible, MiniMax-M3) + structured outputs + retries + parse
  - F-14  # Hybrid retrieval (BM25 + ANN + reranker) + chunker + ocr + embed
  - F-15  # KB ingest pipeline
  - F-16  # CRM store (entity_definitions, entity_records, entity_relationships)
  - F-17  # WhatsApp trigger (processInboundMessage) + AIReplyMode state machine
  - F-18  # WhatsApp send wrapper
  - F-19  # REST endpoints (/api/crm/ai/*, /api/crm/entities/**, /api/crm/knowledge/**)
  - F-20  # Audit log (NDJSON append-only)
  - F-21  # Defense-in-depth (composer byte-identity, structured outputs, citation grounding, numerical consistency, contact-scope, confidence gate, turbo cutoff)
  - F-22  # AIReplyMode state machine (ai / human / human_pending_flag)
  - F-23  # Chat summary + episodic memory (post-cycle hotfixes)
  - F-24  # i18n fallback phrase (post-cycle hotfix)
linked_prd_requirements:
  - FR-12 .. FR-27 (PRD-001 §4.2 BE AI cycle rows)
  - all sub-features in PRD-AI-1 §4 / §5
linked_build_findings:
  - G-AI-7  # PRD/Spec typo 'penyalahgunaan' in canonical text (byte-identity holds; not a bug)
  - G-AI-8  # τ_retrieval=0.30 PRD value vs TAU_TURBO=0.0 in code; PRD stale or Phase-2 target
  - G-AI-9  # dashboard fallback threshold 0.3 vs WhatsApp trigger 0.7 (deliberate per-surface divergence)
---
```

## 1. Purpose

PRD-AI-1 documents the cycle intent for the BE AI auto-reply engine
("WhatsApp-side auto-reply + team `/api/crm/ai/ask` dashboard +
retrieval-augmented assistant + 7-layer defense-in-depth"). This SPEC
is the **contract between the PRD and the code** — for each of the
twelve sub-features, it pins down:

- the exact API contract (request shape, response shape, error shapes,
  HTTP status codes) where applicable,
- the input/output shape of every module-level function it calls,
- the locked env-var values (from `src/config/index.js` and module-level
  `process.env.*` reads),
- the locked constant values (τ_retrieval, τ_user, HARDENED rules,
  AIReplyMode transitions) verbatim from the code,
- the failure modes and the audit log row each emits,
- the test coverage that exists today, honestly enumerated (§12),
- the explicit non-goals.

Every acceptance criterion is verifiable by **reading the cited code
line** or by **running the cited test name**. No criterion is
aspirational. The MVP SSoT's "code is the source of truth" rule
governs any conflict with `PRD-001` or `FRD-001`.

## 2. Locked values (verbatim from code)

These values are locked because the code is the source of truth and
the unit tests (where present) assert against them.

| Constant | Locked value | Env var / source | Lives at |
|---|---|---|---|
| `LLM_MODEL` | `MiniMax-M3` (default) | `LLM_MODEL` | `src/ai/llm/openai-compat.js:105` |
| `LLM_MAX_RETRIES` | `2` | `LLM_MAX_RETRIES` | `src/ai/llm/openai-compat.js:108` |
| `LLM_TIMEOUT_MS` | `30000` (ms) | `LLM_TIMEOUT_MS` | `src/ai/llm/openai-compat.js:141`; `src/ai/llm/embed.js:79` |
| `OPENAI_BASE_URL` | `https://api.minimax.io/v1` | `OPENAI_BASE_URL` | `src/ai/llm/openai-compat.js:109` |
| `EMBEDDING_MODEL` | `MiniMax-embed` (default) | `EMBEDDING_MODEL` | `src/ai/llm/embed.js:151` |
| `EMBEDDING_DIM` | `1536` (default; **overridden to 1024 by migration 004 + sidecar**) | `EMBEDDING_DIM` | `src/ai/llm/embed.js:152`; `src/db/migrations/004-bge-m3-1024dim.sql` |
| `EMBEDDING_BASE_URL` | (unset → uses `OPENAI_BASE_URL`) | `EMBEDDING_BASE_URL` | `src/ai/llm/embed.js:64-66` |
| `SUMMARY_MIN_REFRESH_SECONDS` | `600` (10 min) | `SUMMARY_MIN_REFRESH_SECONDS` | `src/ai/settings/summary.js:23` |
| `SUMMARY_MAX_CONTEXT_MESSAGES` | `30` | `SUMMARY_MAX_CONTEXT_MESSAGES` | `src/ai/settings/summary.js:24` |
| `SUMMARY_MAX_CHARS` | `4000` | `SUMMARY_MAX_CHARS` | `src/ai/settings/summary.js:25` |
| `MAX_BODY_CHARS` (summary) | `400` | (hardcoded) | `src/ai/settings/summary.js:26` |
| `EPISODIC_TOPK` | `10` | `EPISODIC_TOPK` | `src/ai/whatsapp/trigger.js:31` |
| `KB_DIR` | `./data/kb` | `KB_DIR` | `src/ai/store/ingest.js:16` |
| `TAU_TURBO` | `0.0` (MVP-disabled — see §13 G-AI-8) | (hardcoded) | `src/ai/retrieval/hybrid.js:12` |
| `RRF_K` | `60` | (hardcoded) | `src/ai/retrieval/hybrid.js:13` |
| `DEFAULT_AI_SETTINGS.tone` | `'friendly'` | (frozen literal) | `src/ai/settings/defaults.js:13` |
| `DEFAULT_AI_SETTINGS.language` | `'id'` | (frozen literal) | `src/ai/settings/defaults.js:14` |
| `DEFAULT_AI_SETTINGS.whatsappAutoReply.enabled` | `false` | (frozen literal) | `src/ai/settings/defaults.js:21` |
| `DEFAULT_AI_SETTINGS.whatsappAutoReply.confidenceThreshold` | `0.7` | (frozen literal) | `src/ai/settings/defaults.js:22` |
| Dashboard `/api/crm/ai/ask` fallback threshold | `0.3` (when `confidenceThreshold` undefined) | (literal in code) | `src/controllers/ai/ask.js:81` |
| WhatsApp trigger fallback / low-confidence gate | `confidence < settings.whatsappAutoReply.confidenceThreshold` (default 0.7) | (reads settings row) | `src/ai/whatsapp/trigger.js:309-321` |
| `AIReplyMode` allowed transitions | 5 transitions (`ai→human_pending_flag`, `ai→human`, `human_pending_flag→ai`, `human_pending_flag→human`, `human→ai`) | (hardcoded set) | `src/ai/whatsapp/handoff.js:31-37` |
| `AIReplyMode` forbidden transition | `human→human_pending_flag` | (absent from `ALLOWED`) | `src/ai/whatsapp/handoff.js:31-37, 39-47` |
| `SINGLE_TENANT_ID` | `'default'` | (hardcoded) | `src/ai/settings/store.js:10` |
| `SINGLE_SETTINGS_ID` | `1` | (hardcoded) | `src/ai/settings/store.js:11` |
| `MAX_SEND_RETRIES` (AI send wrapper) | inherits `ANTI_BAN_MAX_SEND_RETRIES` (default 3) | `ANTI_BAN_MAX_SEND_RETRIES` | `src/ai/whatsapp/send.js` (uses MVP antiBan; see BUILD-MVP-1 §8) |

The `τ_retrieval` value documented in `PRD-AI-1 §3.1 G-AI-3` and the
brief is `0.30`, but the BE code ships `TAU_TURBO = 0.0` — see
**§13 G-AI-8** for the reconciliation.

## 3. Cross-cutting invariants (apply to all 12 features)

These invariants MUST hold across all twelve AI features. They are
derived from the controllers / modules and are NOT exhaustively
unit-tested (see §12 for the honest test gap).

### 3.1 INV-X1 — error shape is `{ error, message, ...optional }`

Express controllers throw errors whose shape becomes the JSON error
response via `src/middleware/errorHandler.js` (carried over from MVP —
see `SPEC-MVP-1 §3.1`). AI controllers emit `400` directly from the
zod `safeParse` failure path with `{ error: 'ValidationError',
message, details: issues }` (e.g. `ask.js:25-31`,
`toggleMode.js:22-29`).

| Site | Error shape | Status |
|---|---|---|
| Zod validation (ask / toggle-mode) | `{ error: 'ValidationError', message, details: [issue,...] }` | 400 |
| ChatNotFound (toggle-mode) | `{ error: 'ChatNotFound', chatId }` | 404 |
| ForbiddenTransition (toggle-mode) | `{ error: 'ForbiddenTransition', message, from, to }` | 400 |
| LLM parse failure (ask) | `200 { kind: 'fallback', message: AI_FALLBACK_MESSAGE_ID, generatedAt, question }` | 200 (degraded response) |
| Ask low-confidence / fallback path | `200 { kind: 'fallback', ... }` | 200 (degraded response) |
| LLM unparseable after 3 attempts (trigger) | `{ decision: 'hold', reason: 'parse_failure' }` | internal; audit row written |
| Anything else | propagated via `next(err)` → `errorHandler` | `err.statusCode \|\| 500` |

### 3.2 INV-X2 — LLM output is always STRICT JSON (per ID + EN base prompts)

`BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` mandate that the LLM reply ONLY
with valid JSON matching `{ answer, citations, confidence,
fallback_used }` (optionally + `reasoning`) — see `base-prompts.js:47-65`
and `base-prompts.js:107-125`. The structured-output parser
(`parse.js:32-46`) rejects any other shape and re-prompts the LLM up to
3 attempts before throwing `LlmParseError` (`parse.js:57-84`). The
LLM gateway sets `text.format = { type: 'json_schema', strict: true }`
when a `jsonSchema` argument is provided (`openai-compat.js:126-135`).

### 3.3 INV-X3 — module exports CJS (`module.exports = { ... }`)

All AI modules use CommonJS `module.exports = { … }` (e.g.
`composer.js:97`, `hybrid.js:92`, `handoff.js:115-123`,
`trigger.js` end-of-file). The trigger is **not** exported as a
class — it exports `processInboundMessage` as an async function plus
the `derivePhone` helper.

### 3.4 INV-X4 — audit row per funnel event (NDJSON, append-only)

Every code path on the auto-reply funnel writes a structured NDJSON
record via `src/ai/audit/log.js:30-41` to `./data/audit/<UTC-date>.ndjson`.
Sensitive fields (`apiKey`, `password`, `authorization`, `cookie`,
`*token`) are redacted via `src/ai/audit/redact.js:6-31`. Rows produced
by this cycle: `auto_reply_sent`, `auto_reply_hold`, `state_transition`,
`kb_ingest`, `endpoint_hit`.

### 3.5 INV-X5 — tenant scoping is single-tenant for MVP

`requireTenant(req, res, next)` (`src/ai/routes/_middleware.js`)
resolves `req.tenantId` from `DEFAULT_TENANT_ID` env or `'default'`.
The `ai_settings` row is keyed by `id=1` (single-tenant),
`chats.conversation_summary` / `ai_mode` are per-chat (not per-tenant),
and `entity_records.contact_id` is the only nullable per-contact
filter — the partial index `entity_records_contact_idx` is the
data-layer guard.

## 4. Feature: AI Settings service + composer + byte-equivalence contract (sub-feature 1)

Source:
[`src/ai/settings/store.js`](../../../../src/ai/settings/store.js),
[`src/ai/settings/composer.js`](../../../../src/ai/settings/composer.js),
[`src/ai/settings/hardened-rules.js`](../../../../src/ai/settings/hardened-rules.js),
[`src/ai/settings/defaults.js`](../../../../src/ai/settings/defaults.js),
[`src/ai/settings/schema.js`](../../../../src/ai/settings/schema.js),
[`src/ai/routes/settings.js`](../../../../src/ai/routes/settings.js).
Mounted at `/api/crm/ai/settings` by `src/index.js:47` via
`mountAiRoutes(app)`. Cites FRD-001 §8 (F-12).

### 4.1 Behaviour spec

#### 4.1.1 Composer = BASE + tenant fragment + HARDENED

`buildSystemPrompt(opts)` (`composer.js:80-95`):

1. Resolve `tenantName` (default `'Baileys Studio'`),
   `language` (default `'id'`),
   and `basePrompt` (caller passes the ID or EN literal from
   `base-prompts.js`).
2. **Literal** string-replace `{{tenantName}}` in the base
   (`composer.js:88` uses `.split(...).join(...)`, not regex — to
   avoid surprises with regex metachars).
3. If `opts.settings` is missing, return the interpolated base alone
   (`composer.js:90`).
4. Otherwise build the per-tenant fragment via
   `buildSystemPromptFragment(settings, language)` (lines 26-69) —
   emits `# Pengaturan tenant` followed by `## Identitas`,
   `## Suara & nada`, `## Bahasa`, optional `## Topik yang dibahas`,
   optional `## Topik yang dikecualikan`, optional `## Aturan tambahan`.
5. Concatenate `${interpolatedBase}\n\n${fragment}\n\n# Locked rules
   (HARDENED — cannot be overridden)\n\n${hardened}` (line 94).

`buildSystemPrompt` throws if `basePrompt` is not a string
(`composer.js:84-86`). The base prompt constants are
`Object.freeze`'d at `base-prompts.js:127-128`.

#### 4.1.2 4-rule HARDENED block, byte-stable Indonesian

`getHardenedRulesBlock()` returns `HARDENED_RULES_BLOCK` verbatim —
4 numbered Indonesian rules joined by `\n` (`hardened-rules.js:7-18`).
**Quoted verbatim** from `src/ai/settings/hardened-rules.js:7-12`:

```
1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.
```

The block is appended **UNCONDITIONALLY** (i.e. always — the caller's
`settings.rules` does NOT affect this block) at `composer.js:94`. The
BE side is the canonical byte-stable source for this cycle; the FE
mirror at `frontend/src/lib/ai/systemPrompt.ts:258-261` carries an
identical typo `'penyalahgunaan'` per `BUILD-AI-1 §3.2` / **§13 G-AI-7**.

> **Reconciliation note (G-AI-7)**: the brief and `BUILD-AI-1 §3.2`
> claim rule 4 reads `'penyalahgunaan'`. The on-disk source
> `src/ai/settings/hardened-rules.js:11` (this cycle, line 11 of that
> file) reads `'penyalahgunaan'`. The FE mirror at
> `frontend/src/lib/ai/systemPrompt.ts:261` (not edited by this SPEC)
> may carry either — the **byte-identity contract** is enforced by
> `src/test/composer-byte-identity.test.mjs`, not by the spelling. The
> SPEC quotes the on-disk source verbatim; see §13 G-AI-7 for
> audit/seq-4 action.

#### 4.1.3 Store: getSettings / updateSettings / resetSettings

`getSettings()` (`store.js:28-38`) — `SELECT` the single row
(`id = SINGLE_SETTINGS_ID = 1`); if missing, returns
`DEFAULT_AI_SETTINGS`; otherwise maps the row through `rowToSettings`
(lines 13-26) which reads the snake_case DB columns into the
camelCase TS-equivalent shape.

`updateSettings(patch)` (`store.js:65-88`):

1. Reads the current row via `getSettings()`.
2. Deep-merges `patch` over the current via `mergePatch`
   (`store.js:44-63`): nested objects (`identity`, `scope`,
   `whatsappAutoReply`) deep-merge; top-level primitives and arrays
   (`tone`, `language`, `rules`) replace.
3. Validates the merged shape via `AiSettingsSchema.safeParse`
   (`store.js:68`); throws `SettingsValidationError` on failure
   (`store.js:69`; class definition at `schema.js:35-41`).
4. `UPDATE ai_settings SET identity, tone, language, scope, rules,
   whatsapp_auto_reply, updated_at = now() WHERE id = 1` —
   `store.js:72-86`.
5. Returns the freshly-read settings via `getSettings()`.

`resetSettings()` (`store.js:90-108`) — identical `UPDATE` but with
`DEFAULT_AI_SETTINGS` directly bound.

#### 4.1.4 Zod schema byte-mirror of FE

`AiSettingsSchema` (`schema.js:9-31`):

- `identity`: `{ name 1..80, role 1..120, description ≤500 }`.
- `tone: enum('formal','casual','friendly','concise','enthusiastic')`.
- `language: enum('id','en','id-mod')`.
- `scope: { topics: string[], excludedTopics: string[] }`.
- `rules: string[]`.
- `whatsappAutoReply: { enabled: bool, confidenceThreshold: number
  ≥0.5, ≤0.95, .multipleOf(0.05) }`.
- `updatedAt: string`.

`PartialAiSettingsSchema = AiSettingsSchema.deepPartial()` is exported
for the route-level PATCH handler (not directly used in this cycle's
exposed routes; exposed for forward compatibility).

### 4.2 Acceptance criteria (settings/composer)

| AC | Given | When | Then |
|---|---|---|---|
| S-AC-1 | valid `basePrompt` (a non-empty string) and no `opts.settings` | `buildSystemPrompt({ basePrompt, tenantName: 'X' })` | returns `basePrompt` with `{{tenantName}}` literal-replaced by `'X'` |
| S-AC-2 | valid `settings` with `tone='friendly'`, `language='id'` | `buildSystemPrompt` | the per-tenant fragment contains the lines `# Pengaturan tenant`, `## Identitas`, `## Suara & nada`, `## Bahasa` with the Indonesian tone description (`composer.js:12-18`) |
| S-AC-3 | any `settings.rules` (including non-empty) | `buildSystemPrompt` | the returned string ends with `${hardened}` and the `HARDENED_RULES_BLOCK` is appended UNCONDITIONALLY (`composer.js:94` calls `getHardenedRulesBlock()` regardless of `settings.rules`) |
| S-AC-4 | `HARDENED_RULES_BLOCK` is required to be byte-stable | `getHardenedRulesBlock()` | returns the same 4-line `\n`-joined string on every reload; exported as a frozen literal (`hardened-rules.js:7-12, 18`) |
| S-AC-5 | `opts.basePrompt` is missing or not a string | `buildSystemPrompt({ settings })` | throws `Error('buildSystemPrompt: basePrompt is required')` (`composer.js:84-86`) |
| S-AC-6 | `BASE` prompt contains `{{tenantName}}` literally | `buildSystemPrompt({ tenantName: 'Acme Corp', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID })` | the interpolated base contains the literal string `Acme Corp` and the literal `{{tenantName}}` is gone (literal `.split(...).join(...)` at `composer.js:88`, NOT regex) |
| S-AC-7 | empty `ai_settings` row in DB | `getSettings()` | returns the frozen `DEFAULT_AI_SETTINGS` (`store.js:34-36`) |
| S-AC-8 | a `ai_settings` row with `{ identity, tone, language, scope, rules, whatsapp_auto_reply }` | `getSettings()` | returns the camelCase TS-equivalent shape via `rowToSettings` (`store.js:13-26`) |
| S-AC-9 | `updateSettings({ whatsappAutoReply: { enabled: true } })` with `confidenceThreshold=0.7` on disk | the call returns | the resulting row has `enabled=true` AND `confidenceThreshold=0.7` preserved (deep-merge on nested objects at `store.js:44-63`) |
| S-AC-10 | `updateSettings({ confidenceThreshold: 0.3 })` | the call runs | throws `SettingsValidationError` (`store.js:69`; `schema.js:25-28` requires `≥0.5, ≤0.95, .multipleOf(0.05)`) |
| S-AC-11 | `updateSettings({ tone: 'robotic' })` | the call runs | throws `SettingsValidationError` (`schema.js:15` enum) |
| S-AC-12 | `updateSettings` succeeds | the row in DB | `updated_at` is `now()` (`store.js:75`) |
| S-AC-13 | `DEFAULT_AI_SETTINGS` is exported | import the module | the object is `Object.freeze`'d at every nesting level (`defaults.js:7-25`) |
| S-AC-14 | the BE composer output for the same `{ settings, tenantName, language, basePrompt }` input | compare against `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt` | byte-equal (enforced by `src/test/composer-byte-identity.test.mjs`, 1 spec which intentionally fails post-hotfix #4 — see §11.5 + §13) |

Citations: `src/ai/settings/store.js:10-115`;
`src/ai/settings/composer.js:1-97`;
`src/ai/settings/hardened-rules.js:1-18`;
`src/ai/settings/defaults.js:1-27`;
`src/ai/settings/schema.js:1-47`;
`src/ai/llm/base-prompts.js:7-130`;
`src/ai/routes/settings.js` (caller of `getSettings` / `updateSettings`);
`src/index.js:47` (mount).

### 4.3 NG (settings/composer)

- **S-NG-1** Multi-tenant settings (PRD NG-AI-1). Single-tenant for MVP
  via `SINGLE_TENANT_ID = 'default'`.
- **S-NG-2** No `AiSettingsSchema` migration path is exposed —
  `PartialAiSettingsSchema` is exported for forward compatibility but
  no route uses it this cycle.
- **S-NG-3** No HTTP API authentication on the PUT/GET (PRD NG-AI-2;
  README §"Security notes").

## 5. Feature: LLM gateway (sub-feature 2)

Source:
[`src/ai/llm/openai-compat.js`](../../../../src/ai/llm/openai-compat.js),
[`src/ai/llm/anthropic-compat.js`](../../../../src/ai/llm/anthropic-compat.js),
[`src/ai/llm/parse.js`](../../../../src/ai/llm/parse.js),
[`src/ai/llm/prompt.js`](../../../../src/ai/llm/prompt.js),
[`src/ai/llm/embed.js`](../../../../src/ai/llm/embed.js),
[`src/ai/llm/base-prompts.js`](../../../../src/ai/llm/base-prompts.js).
Mounted via the trigger (`src/ai/whatsapp/trigger.js`) and the
controllers (`src/controllers/ai/ask.js`,
`src/controllers/ai/replyPreview.js`). Cites FRD-001 §8 (F-13).

### 5.1 Behaviour spec

#### 5.1.1 OpenAI-compatible client (`createChatCompletion`)

`openai-compat.js:101-199`. Direct `fetch` (NOT the OpenAI Node SDK
because the SDK injects OpenAI-specific optional fields that MiniMax
rejects — see file header `openai-compat.js:9-17`).

Body shape:

```
{
  model: 'MiniMax-M3' (default),
  instructions: systemPrompt,  // NOT 'messages'
  input: userPrompt,
  text: { format: { type: 'json_schema', name, schema, strict: true } }  // when jsonSchema is provided
}
```

POSTed to `${baseURL}/v1/responses` (note: NOT
`/v1/chat/completions` — MiniMax rejects the legacy shape).

`extractResponsesPayload(data)` (`openai-compat.js:65-84`):

1. Walks `data.output[].content[].text` for `type === 'output_text'`
   entries, concatenating `contentText`.
2. If `contentText` is empty, falls back to `data.output_text`
   convenience aggregate.
3. Returns `{ contentText, usage }` where `usage` is `data.usage` or
   a zero-filled default.

Retry policy (`openai-compat.js:38-43, 137-198`):

- `isRetryable(err)` returns true on `status === 429` or
  `typeof status === 'number' && status >= 500`.
- `LLM_MAX_RETRIES = 2` (default; 3 total attempts).
- Backoff: `jitter(500 * 2^attempt)` ms (±20%).
- `AbortError` from the per-call `AbortController` is treated as
  `status = 408` and retried.
- After exhausting retries, throws `LlmPermanentError(message, cause)`
  (`openai-compat.js:21-27`).

External `args.signal` is forwarded: when the outer controller aborts,
the inner controller aborts too (`openai-compat.js:144-150, 163,
184`).

#### 5.1.2 Anthropic-compatible fallback

`src/ai/llm/anthropic-compat.js:50-114` wires the Anthropic-compatible
path. Structured outputs are realised by defining one
`emit_structured_output` tool with `input_schema = jsonSchema` and
forcing `tool_choice: { type: 'tool', name: 'emit_structured_output' }`.
**Production cutover is Phase 2 (NG-AI-6).** The default is
OpenAI-compatible via `LLM_MODEL` + `OPENAI_BASE_URL`.

#### 5.1.3 Structured-output parser (`parseStructuredOutput`)

`parse.js:57-84`:

1. Loops `attempt = 1..maxAttempts` (default `maxAttempts = 3`).
2. First attempt uses `args.rawText`; subsequent attempts re-call the
   LLM via `llmClient.createChatCompletion({ systemPrompt, userPrompt })`.
3. `tryParse(rawText, schema)` (`parse.js:32-46`): `JSON.parse` →
   `schema.safeParse` → returns `{ ok: true, parsed }` or
   `{ ok: false, error, issues }`.
4. On parse failure, the next iteration's `userPrompt` is the original
   userPrompt plus `"Your previous response did not match the required
   schema. Errors: <issues joined>. Please respond again with a valid
   JSON object."` (`parse.js:76-77`).
5. After `maxAttempts` failures, throws `LlmParseError(message,
   zodError, attempts)` (`parse.js:8-15, 79-83`).

Two schemas are exported (`parse.js:17-30`):

- `RagAnswerSchema = { answer, citations: number[], confidence: 0..1,
  fallback_used: bool }` — for the ask dashboard.
- `WhatsAppAutoReplyDecisionSchema = RagAnswerSchema + optional
  reasoning: string` — for the WhatsApp trigger.

#### 5.1.4 Embeddings client (`embedText`)

`embed.js:149-184`:

1. Hashes the input with SHA-256 and consults the LRU `EmbeddingCache`
   (default `maxSize=10000`, `embed.js:8-34`). Cache hit → return
   cached vector (no HTTP).
2. If `text.length ≤ 2000`, single `rawEmbed` call.
3. If `text.length > 2000`, splits into 2000-char segments and
   `meanVectors` the per-segment vectors (`embed.js:166-180`).
4. Caches and returns the vector.

`rawEmbed(text, client, model, dims, maxRetries)` (`embed.js:53-147`):

- POSTs to `${baseURL}/v1/embeddings` (where `baseURL` is
  `OPENAI_BASE_URL` or `EMBEDDING_BASE_URL` if set, with trailing
  `/v1` stripped) with body `{ model, texts: [text], type: 'string' }`
  — **NOT** OpenAI's `{ input }` shape (the SDK sends `input` and
  MiniMax rejects it — see `embed.js:53-58`).
- Accepts BOTH `{ vectors: [...] }` (MiniMax/sidecar) and
  `{ data: [{ embedding: [...] }] }` (OpenAI-compat) response shapes
  (`embed.js:106-116`).
- **Dim-mismatch validation** (`embed.js:125-133`): if
  `Number.isFinite(dims)` AND `vec.length !== dims`, throws
  `Error(..., status: 502)` with an actionable message naming the
  expected vs received dimension.
- Per-call `AbortController` with `LLM_TIMEOUT_MS = 30000` default
  (`embed.js:79-80`); `AbortError` → `status=408`, retried.
- Retries on `429`, `408`, or `>=500` with backoff `jitter(500 *
  2^attempt)` ms; max 3 attempts total.

#### 5.1.5 Base prompts (byte-stable ID + EN)

`base-prompts.js:7-65` (ID) and `base-prompts.js:67-125` (EN).
Both contain `{{tenantName}}` as a literal placeholder (the composer
literal-replaces at `composer.js:88`). Both end with a `# Fallback`
section instructing the LLM to emit the friendly phrase verbatim on
insufficient CONTEXT.

`Object.freeze(BAILEYS_AI_SYSTEM_PROMPT_ID)` and
`Object.freeze(BAILEYS_AI_SYSTEM_PROMPT_EN)` at
`base-prompts.js:127-128`.

### 5.2 Acceptance criteria (LLM gateway)

| AC | Given | When | Then |
|---|---|---|---|
| LLM-AC-1 | a mock `fetch` returning `{ output: [{ type:'message', role:'assistant', content: [{ type:'output_text', text:'hello' }] }] }` | `createChatCompletion({...})` | returns `{ content: 'hello', usage: <from data.usage> }`; POSTed URL ends with `/v1/responses`; body has `instructions` and `input` (NOT `messages`) |
| LLM-AC-2 | a mock `fetch` returning `{ output_text: 'aggregate fallback' }` (no `output[].content[].text` chain) | `createChatCompletion` | returns `{ content: 'aggregate fallback' }` (falls back to the convenience aggregate, `openai-compat.js:78-80`) |
| LLM-AC-3 | a mock that returns `503` then `503` then `200` | `createChatCompletion` (with `maxRetries=2`) | the call succeeds (returns the third mock's content); `fetch` was called 3 times |
| LLM-AC-4 | a mock that always returns `503` | `createChatCompletion` (with `maxRetries=2`) | throws `LlmPermanentError` after 3 attempts; backoff between attempts is `~500 * 2^n` ms ± 20% |
| LLM-AC-5 | a mock that never resolves | `createChatCompletion` with `LLM_TIMEOUT_MS=50` (test override) | the call aborts at ~50 ms and is retried; after `maxRetries` throws `LlmPermanentError` (the AbortError is treated as `status=408`, `openai-compat.js:186-189`) |
| LLM-AC-6 | `jsonSchema: { name:'rag_answer', schema:{ type:'object', additionalProperties:true } }` is passed | `createChatCompletion` | the body has `text.format = { type:'json_schema', name:'rag_answer', schema:{...}, strict:true }` (`openai-compat.js:126-135`) |
| LLM-AC-7 | a mock `fetch` returning valid JSON on the 3rd attempt | `parseStructuredOutput({ schema: RagAnswerSchema, llmClient, systemPrompt, userPrompt })` | returns `{ parsed: <valid RagAnswer>, attempts: 3 }` |
| LLM-AC-8 | a mock that always returns invalid JSON | `parseStructuredOutput` (default `maxAttempts=3`) | throws `LlmParseError('Failed to parse structured output after 3 attempts', <zodError>, 3)` after 3 LLM calls |
| LLM-AC-9 | `embedText(text1)` is called, then `embedText(text1)` again | second call | no HTTP request is issued; the cached vector is returned (SHA-256 key in `embed.js:34, 157-159`) |
| LLM-AC-10 | sidecar returns 1024-dim vector; `EMBEDDING_DIM=1024` | `embedText` | returns the 1024-dim vector; no error |
| LLM-AC-11 | sidecar returns 1536-dim vector; `EMBEDDING_DIM=1024` | `embedText` | throws `Error(..., status: 502)` with message `"embed: dim mismatch — provider returned 1536-dim but EMBEDDING_DIM=1024 ..."` (`embed.js:125-133`); no row written downstream |
| LLM-AC-12 | text length > 2000 chars | `embedText(longText)` | text is split into 2000-char segments; each is embedded; the returned vector is the per-dimension `meanVectors` of the segment vectors (`embed.js:166-180`) |
| LLM-AC-13 | a non-string or empty `text` | `embedText(text)` | throws `Error('embedText: text is required')` (`embed.js:154-156`) |
| LLM-AC-14 | the prompt template at `base-prompts.js:7-65` (ID) | read the file | contains the literal `{{tenantName}}` in 2 places (line 7 and line 10); ends with `# Fallback` instructing the LLM to emit `"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"` verbatim |
| LLM-AC-15 | the prompt template at `base-prompts.js:67-125` (EN) | read the file | ends with the English Fallback section instructing the LLM to emit `"Sorry, we don't have data on that yet 🙏"` verbatim |
| LLM-AC-16 | the BASE prompts | read the file | both are `Object.freeze`'d literals (`base-prompts.js:127-128`); the export is `{ BAILEYS_AI_SYSTEM_PROMPT_ID, BAILEYS_AI_SYSTEM_PROMPT_EN }` |

Citations: `src/ai/llm/openai-compat.js:21-27, 38-43, 65-84, 101-199, 201-207`;
`src/ai/llm/anthropic-compat.js:50-114`;
`src/ai/llm/parse.js:8-91`;
`src/ai/llm/prompt.js:6-55`;
`src/ai/llm/embed.js:8-186`;
`src/ai/llm/base-prompts.js:7-130`.

### 5.3 NG (LLM gateway)

- **LLM-NG-1** No streaming replies — NG-AI-5. Static text only.
- **LLM-NG-2** No LLM provider cutover (Anthropic-compat is wired but
  unused in production) — NG-AI-6.
- **LLM-NG-3** No NLI entailment layer — NG-AI-3.
- **LLM-NG-4** No cross-encoder reranker — NG-AI-4 (reranker is
  MiniMax-embedding cosine only).

## 6. Feature: Retrieval (sub-feature 3)

Source:
[`src/ai/retrieval/hybrid.js`](../../../../src/ai/retrieval/hybrid.js),
[`src/ai/retrieval/bm25.js`](../../../../src/ai/retrieval/bm25.js),
[`src/ai/retrieval/ann.js`](../../../../src/ai/retrieval/ann.js),
[`src/ai/retrieval/reranker.js`](../../../../src/ai/retrieval/reranker.js),
[`src/ai/retrieval/chunker.js`](../../../../src/ai/retrieval/chunker.js),
[`src/ai/retrieval/ocr.js`](../../../../src/ai/retrieval/ocr.js).
Cites FRD-001 §9 (F-14).

### 6.1 Behaviour spec

#### 6.1.1 BM25 (`bm25Search`)

`src/ai/retrieval/bm25.js:8-26`. Uses
`tsvector('simple', text) @@ plainto_tsquery('simple', $1)` and
`ts_rank_cd`; max-normalises scores into `[0, 1]`. Returns up to 20
hits (default `limit: 20`, `hybrid.js:23`).

#### 6.1.2 pgvector ANN (`annSearch`)

`src/ai/retrieval/ann.js:8-30`. Uses `embedding <=> $1::vector`
(cosine distance); returns `score = 1 - distance`. Backed by the
`knowledge_chunks_embedding_idx WITH (lists = 100)` index from
`src/db/migrations/002-ai-tables.sql` (per PRD-AI-1 §3.1 G-AI-3).

#### 6.1.3 RRF fusion + rerank (`hybridRetrieval`)

`src/ai/retrieval/hybrid.js:15-90`:

1. BM25 top-20 (`hybrid.js:23`).
2. ANN top-20 with embedder-failure fallback — if `embedText(query)`
   throws, `annHits = []` (`hybrid.js:25-32`).
3. RRF merge with `RRF_K = 60`:
   `bm25Hits.forEach((h,i) => add(h.chunk.id, 1 / (RRF_K + i + 1)))`
   and the same for ANN hits (`hybrid.js:34-40`).
4. Keep top-30 by RRF score (`hybrid.js:46-49`).
5. **Contact-scope filter** (`hybrid.js:54-71`): when
   `scope === 'whatsapp' && contactPhone`, set
   `contactScopeApplied = true` and attempt a `SELECT 1` ping to keep
   the DB connection warm. The actual data-layer enforcement for
   `entity_records` is the SQL `entity_records_contact_idx` partial
   index (`src/db/migrations/003-indexes.sql`); for MVP,
   `knowledge_chunks` is tenant-wide (the post-LLM guard in
   `trigger.js` is the second layer).
6. Rerank via MiniMax-embedding cosine → top-K (default 6). On
   `rerank()` failure, fall back to `candidates.slice(0, topK)`
   (`hybrid.js:73-79`).
7. Compute `retrievalScore = max(bm25Max, rerankScore)`
   (`hybrid.js:81-83`).
8. **Turbo cutoff** (`hybrid.js:86-89`): if
   `retrievalScore < TAU_TURBO`, return
   `{ chunks: [], retrievalScore, contactScopeApplied }`. With
   `TAU_TURBO = 0.0`, the cutoff never fires today
   (`hybrid.js:12`; see **§13 G-AI-8**).

Returns `{ chunks, retrievalScore, contactScopeApplied }`.

#### 6.1.4 Semantic chunker (`chunkText`)

`src/ai/retrieval/chunker.js:36-95`. Splits on `\n\n+`, then on
sentence boundaries (`[.!?]\s+`), then on word-boundary hard-split;
prepends the last `overlapTokens * 4` chars of the previous chunk.
Markdown headings update `metadata.sectionTitle` for subsequent
chunks. `metadata.tokenEstimate = ceil(text.length / 4)`.

#### 6.1.5 Multi-format OCR (`extractText`)

`src/ai/retrieval/ocr.js:14-85`:

| Mime | Backend | Returns |
|---|---|---|
| `application/pdf` | `pdf-parse` | `{ text, metadata: { pages: <numpages> } }` |
| DOCX | `mammoth.extractRawText` | `{ text, metadata: {} }` |
| HTML / XHTML | `cheerio` (strips `<script>`/`<style>`) | `{ text, metadata: { sections: [<h1/h2/h3 text>, …] } }` |
| XLSX | `xlsx` (each sheet → CSV, joined `\n`) | `{ text, metadata: { sections: [<sheet name>, …] } }` |
| CSV / TXT | UTF-8 read | `{ text, metadata: {} }` |
| anything else | — | throws `UnsupportedMimeError(<mime>)` |

### 6.2 Acceptance criteria (retrieval)

| AC | Given | When | Then |
|---|---|---|---|
| R-AC-1 | a query that hits no rows in either BM25 or ANN | `hybridRetrieval` | returns `{ chunks: [], retrievalScore: 0, contactScopeApplied: <bool> }` |
| R-AC-2 | a query that returns BM25 hits only (embedder unavailable) | `hybridRetrieval` | returns the BM25 hits with RRF scores; `retrievalScore = bm25Max`; `contactScopeApplied` per scope |
| R-AC-3 | a query that returns hits in BOTH BM25 and ANN | `hybridRetrieval` | RRF-merged; top-30 by `1/(60+rank+1)` per source; top-6 after rerank |
| R-AC-4 | `scope='whatsapp'` and `contactPhone='6281234567890'` | `hybridRetrieval` | returns `{ contactScopeApplied: true, ... }` (`hybrid.js:56-57`) |
| R-AC-5 | `scope='team'` and no `contactPhone` | `hybridRetrieval` | returns `{ contactScopeApplied: false, ... }` |
| R-AC-6 | `embedText(query)` throws (embedder outage) | `hybridRetrieval` | `annHits = []`; the function continues with BM25-only and does NOT throw |
| R-AC-7 | `rerank()` throws | `hybridRetrieval` | falls back to `candidates.slice(0, topK)` (`hybrid.js:78`) |
| R-AC-8 | `retrievalScore < TAU_TURBO` | `hybridRetrieval` | returns `{ chunks: [], retrievalScore, contactScopeApplied }` (`hybrid.js:86-89`) |
| R-AC-9 | TAU_TURBO is shipped as `0.0` | read `hybrid.js:12` | the constant equals `0.0`; the cutoff cannot fire (see §13 G-AI-8) |
| R-AC-10 | long text (> 512 tokens) | `chunkText(text)` | text is split into multiple chunks; each chunk's `metadata.tokenEstimate ≈ ceil(text.length / 4)` |
| R-AC-11 | `application/pdf` buffer with 3 pages | `extractText({ buffer, mimeType })` | returns `{ text, metadata: { pages: 3 } }` |
| R-AC-12 | a buffer with `mimeType: 'image/png'` | `extractText` | throws `UnsupportedMimeError('image/png')` |
| R-AC-13 | an HTML buffer with `<script>alert('x')</script>` | `extractText` | returned `text` does NOT contain `alert('x')` (script tags stripped, `ocr.js:64-85`) |

Citations: `src/ai/retrieval/hybrid.js:1-92`;
`src/ai/retrieval/bm25.js:8-26`;
`src/ai/retrieval/ann.js:8-30`;
`src/ai/retrieval/reranker.js:22-35`;
`src/ai/retrieval/chunker.js:36-95`;
`src/ai/retrieval/ocr.js:14-85`;
`src/db/migrations/002-ai-tables.sql`;
`src/db/migrations/003-indexes.sql`.

### 6.3 NG (retrieval)

- **R-NG-1** Cross-encoder reranker — NG-AI-4.
- **R-NG-2** Per-chunk contact-id filter on KB — entity_records
  contact-scope is enforced at the data layer + post-LLM, but KB
  chunks themselves are tenant-wide in MVP.

## 7. Feature: Ingest pipeline (sub-feature 4)

Source:
[`src/ai/store/ingest.js`](../../../../src/ai/store/ingest.js),
[`src/ai/store/chunks.js`](../../../../src/ai/store/chunks.js),
[`src/ai/store/ingest-worker.js`](../../../../src/ai/store/ingest-worker.js),
[`src/ai/retrieval/chunker.js`](../../../../src/ai/retrieval/chunker.js),
[`src/ai/retrieval/ocr.js`](../../../../src/ai/retrieval/ocr.js),
[`src/ai/routes/knowledge.js`](../../../../src/ai/routes/knowledge.js).
Cites FRD-001 §10 (F-15).

### 7.1 Behaviour spec

#### 7.1.1 `ingestFile({ tenantId, filename, mimeType, buffer })`

`src/ai/store/ingest.js:18-105`:

1. SHA-256 the buffer (`ingest.js:20`).
2. **Idempotency check**: `SELECT id, status FROM knowledge_files
   WHERE tenant_id = $1 AND storage_path LIKE $2` (using first 8 hex
   chars of the sha as a LIKE marker). If a row with `status='indexed'`
   exists, return `{ fileId, chunksCount, idempotent: true }`
   (`ingest.js:24-40`).
3. Generate `fileId = 'kf_' + nanoid(12)`; `mkdirSync(KB_DIR/fileId,
   { recursive: true })`; write the buffer
   `<KB_DIR>/<fileId>/<filename>` (`ingest.js:42-45`).
4. `INSERT INTO knowledge_files (..., status='queued') ON CONFLICT
   (id) DO NOTHING` (`ingest.js:47-52`).
5. `UPDATE knowledge_files SET status='ingesting'` (`ingest.js:55-58`).
6. `extractText({ buffer, mimeType })` then `chunkText({ text })`
   (`ingest.js:60-61`).
7. Embed in batches of 4 concurrent; collect embedded chunks
   (`ingest.js:63-74`).
8. **Upsert each chunk** via `chunksStore.__ingestUpsertChunk(...)`
   (`ingest.js:77-89`). The chunk's `id = 'kc_' + nanoid(12)`,
   `chunkIndex = i` (array index — re-uploads of the same chunk text
   overwrite the same row).
9. `UPDATE knowledge_files SET status='indexed', chunks_count, ingested_at,
   last_error=NULL` (`ingest.js:91-96`); returns
   `{ fileId, chunksCount, idempotent: false }`.
10. **Error path** (`ingest.js:98-104`): any thrown error transitions
    the row to `status='failed', last_error=<msg>` and rethrows.

#### 7.1.2 `chunksStore.__ingestUpsertChunk` is the ONLY write path

`src/ai/store/chunks.js:15-43` — `INSERT INTO knowledge_chunks …
ON CONFLICT (file_id, chunk_index) DO UPDATE SET text, text_hash,
embedding, metadata`. Module-internal API: only `ingest.js:80`
reaches it via `require('./chunks')`. No router endpoint accepts a
`knowledge_chunks` write.

#### 7.1.3 Upload route (`POST /api/crm/knowledge/upload`)

`src/ai/routes/knowledge.js:50-68`. Multipart upload via
`multer.memoryStorage()` (50 MB cap). Calls
`enqueue({ tenantId, filename, mimeType, buffer })` (worker at
`src/ai/store/ingest-worker.js:11-34`); writes a `kb_ingest` audit row;
returns `202 { fileId, status: 'queued' }`.

#### 7.1.4 Other endpoints

| Method | Path | Behavior | Source |
|---|---|---|---|
| GET | `/api/crm/knowledge/files` | list, optional `?status=` filter | `src/ai/routes/knowledge.js:21-47` |
| GET | `/api/crm/knowledge/files/:id` | file metadata + chunk count | `src/ai/routes/knowledge.js:71-94` |
| DELETE | `/api/crm/knowledge/files/:id` | delete + cascade chunks | `src/ai/routes/knowledge.js:97-105` |

### 7.2 Acceptance criteria (ingest)

| AC | Given | When | Then |
|---|---|---|---|
| I-AC-1 | a fresh upload of byte content `B` with sha `S` | `ingestFile({ ..., buffer: B })` | creates `knowledge_files` row with `status='indexed'`, returns `{ fileId, chunksCount: N, idempotent: false }` |
| I-AC-2 | the same byte content `B` is uploaded again within minutes | `ingestFile({ ..., buffer: B })` | returns `{ fileId: <existing>, chunksCount: N, idempotent: true }`; no new chunks upserted |
| I-AC-3 | `extractText` throws | `ingestFile` | row transitions to `status='failed', last_error=<message>`; the function rethrows |
| I-AC-4 | 10 chunks | `ingestFile` runs the embed pass | 3 embed batches are issued (4 + 4 + 2 concurrent); the 10 upserts are serial |
| I-AC-5 | a 1 KB file is uploaded via multipart | `POST /api/crm/knowledge/upload` | 202 `{ fileId, status: 'queued' }` and a `kb_ingest` audit row is written |
| I-AC-6 | `KB_DIR` does not exist | first run of `ingestFile` | the directory is created (`fs.mkdirSync(..., { recursive: true })` at `ingest.js:44`) |
| I-AC-7 | any router handler that tries to `INSERT INTO knowledge_chunks` | router inspection | no such route exists; `chunksStore.__ingestUpsertChunk` is reachable only via `require('./chunks')` in `ingest.js` |

Citations: `src/ai/store/ingest.js:18-105`;
`src/ai/store/chunks.js:15-43`;
`src/ai/store/ingest-worker.js:11-34`;
`src/ai/retrieval/chunker.js:36-95`;
`src/ai/retrieval/ocr.js:14-85`;
`src/ai/routes/knowledge.js:21-105`;
`src/ai/audit/log.js:30-41`.

### 7.3 NG (ingest)

- **I-NG-1** KB writes from any AI/LLM path — NG-AI-9. The LLM's
  structured output schema does not include any `addKbEntry` /
  `updateKbEntry` action; the chunks store's write methods are
  module-internal.
- **I-NG-2** KB auto-tag extraction at ingest time — NG-AI-7
  (deferred to Phase 3).
- **I-NG-3** Hot-reload of KB chunks — once an `ingestFile` call
  finishes, the chunk rows are immutable from the API surface.

## 8. Feature: CRM store (sub-feature 5)

Source:
[`src/ai/store/entities.js`](../../../../src/ai/store/entities.js),
[`src/ai/routes/crm.js`](../../../../src/ai/routes/crm.js),
[`src/db/migrations/002-ai-tables.sql:117-154`](../../../../src/db/migrations/002-ai-tables.sql).
Mounted at `/api/crm/entities/*` and `/api/crm/records/*` by
`src/index.js:47` via `mountAiRoutes(app)`. Cites FRD-001 §11 (F-16).

### 8.1 Behaviour spec

#### 8.1.1 Endpoints

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/crm/entities` | list active entities (zod-validated filter, `deleted_at IS NULL`) |
| POST | `/api/crm/entities` | create — zod validates `name 1..80`, `label 1..120`, optional `icon`/`description`, free-form `schemaJson` |
| PATCH | `/api/crm/entities/:id` | insert a new row with `version = max(version) + 1` and `id = '<old>__v<n>'` |
| DELETE | `/api/crm/entities/:id` | soft delete via `deleted_at = now()` |
| GET | `/api/crm/entities/:id/records` | paginated list + filter `?contactId=` + `?q=` |
| POST | `/api/crm/entities/:id/records` | insert a record (zod-validated) |
| PATCH | `/api/crm/records/:id` | update record |
| DELETE | `/api/crm/records/:id` | delete record |

All tenant-scoped via `requireTenant` middleware
(`src/ai/routes/_middleware.js`).

#### 8.1.2 Schema-versioning (entity_definitions)

`UNIQUE (tenant_id, name, version) DEFERRABLE INITIALLY IMMEDIATE` per
`src/db/migrations/002-ai-tables.sql:117-130`. `PATCH /entities/:id`
bumps `version` to `max(version) + 1` and writes a new row with id
`<old>__v<n>`. The v1 row is preserved. The list endpoint filters
`deleted_at IS NULL`.

#### 8.1.3 Contact-scoping (entity_records)

`entity_records.contact_id` is nullable. NULL = tenant-wide; non-NULL
= contact-scoped. The data-layer guard is the partial index
`entity_records_contact_idx ON entity_records (contact_id) WHERE
contact_id IS NOT NULL` (`src/db/migrations/003-indexes.sql`).
`GET /entities/:id/records?contactId=...` filters
`WHERE contact_id = $contactId`.

#### 8.1.4 `entity_relationships`

Typed edges with `cardinality ∈ {'one', 'many'}`. Columns:
`from_entity`, `from_field`, `to_entity`, `to_field = 'id'` default,
`cardinality`. The SQL CHECK constraint rejects anything else
(`src/db/migrations/002-ai-tables.sql:146-154`).

### 8.2 Acceptance criteria (CRM)

| AC | Given | When | Then |
|---|---|---|---|
| CRM-AC-1 | `POST /api/crm/entities { name:'Deal', label:'Deal', schemaJson:{...} }` | the route runs | 201 with `{ id:'ent_xxxx', version:1, ... }` |
| CRM-AC-2 | the entity `ent_xxxx` exists at v1 | `PATCH /api/crm/entities/ent_xxxx { name:'Opportunity' }` | returns `{ id:'ent_xxxx__v2', version:2 }`; the v1 row remains in the table |
| CRM-AC-3 | `ent_xxxx__v2` exists | `DELETE /api/crm/entities/ent_xxxx__v2` | soft-delete via `deleted_at = now()`; subsequent `GET /api/crm/entities` does NOT include it; the historical rows remain |
| CRM-AC-4 | an entity has records at v1 and v2 | `GET /api/crm/entities/<v2_id>/records?contactId=6281234567890` | filters `WHERE contact_id = $contactId`; records with NULL `contact_id` are NOT returned |
| CRM-AC-5 | a request body missing `name` | `POST /api/crm/entities` | 400 `{ error:'ValidationError', details: [issue,...] }` |
| CRM-AC-6 | a request body with `name='x'.repeat(81)` | `POST /api/crm/entities` | 400 (zod `name: 1..80`) |
| CRM-AC-7 | an LLM mocking an `addKbEntry` / `updateKbEntry` action | the schema validation in `parseStructuredOutput` | the schema rejects (no such field); the LLM cannot fill anything |
| CRM-AC-8 | a HTTP POST trying to `INSERT INTO knowledge_chunks` | any route handler | no route mounted; returns 404 from the `/api/crm/*` fallback (`src/ai/routes/index.js:17-19`) |

Citations: `src/ai/store/entities.js`;
`src/ai/routes/crm.js:15-207`;
`src/ai/routes/_middleware.js`;
`src/db/migrations/002-ai-tables.sql:117-154`;
`src/db/migrations/003-indexes.sql`;
`src/ai/llm/parse.js:17-30`;
`src/ai/store/chunks.js:15-43`.

### 8.3 NG (CRM)

- **CRM-NG-1** Per-tenant RLS — NG-AI-1. Single-tenant for MVP.
- **CRM-NG-2** KB writes from any path — NG-AI-9.
- **CRM-NG-3** Bulk import / CSV upload of entities — out of scope.

## 9. Feature: WhatsApp trigger + AIReplyMode (sub-feature 6)

Source:
[`src/ai/whatsapp/trigger.js`](../../../../src/ai/whatsapp/trigger.js),
[`src/ai/whatsapp/handoff.js`](../../../../src/ai/whatsapp/handoff.js),
[`src/ai/whatsapp/send.js`](../../../../src/ai/whatsapp/send.js),
[`src/inbox/writer.js`](../../../../src/inbox/writer.js) (for
`resolveJid` + `getRecentHistory`),
[`src/controllers/ai/toggleMode.js`](../../../../src/controllers/ai/toggleMode.js),
[`src/controllers/ai/replyPreview.js`](../../../../src/controllers/ai/replyPreview.js).
Cites FRD-001 §10 (F-17, F-18) and the AIReplyMode state machine
(F-22).

### 9.1 Behaviour spec

#### 9.1.1 `processInboundMessage(inboundMsg, ctx)` — the 14-step funnel

`src/ai/whatsapp/trigger.js:71-360`:

| Step | Source | Behaviour |
|---|---|---|
| self-echo guard | `trigger.js:81-83` | `if (inboundMsg.key.fromMe === true) return { decision: 'none', reason: 'self_echo' }` |
| non-chat guard | `trigger.js:85-87` | `if (!rawChatId \|\| rawChatId === 'status@broadcast') return { decision: 'none', reason: 'non_chat_message' }` |
| LID→PN resolve | `trigger.js:93-96` | `chatId = inbox.resolveJid(rawChatId)` (fallback: `rawChatId`) |
| empty-body guard | `trigger.js:97-100` | `if (!body.trim()) return { decision: 'none', reason: 'empty_body' }` |
| chat upsert (idempotent) | `trigger.js:111` (call), `handoff.js:84-96` (impl) | `INSERT … ON CONFLICT (id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at`; does NOT touch `ai_mode` (operator toggles survive) |
| step 0.5 inbound persist + embed | `trigger.js:122-151` | fire-and-forget INSERT into `messages` + `episodic.embedAndStoreMessage(...)`; idempotent on `key.id` |
| step 1 load chat mode | `trigger.js:156-163` | `loadChatMode(chatId)`; on `human` / `human_pending_flag`, return `{ decision:'none', reason:'human_mode' \| 'human_pending_flag' }`; on `ChatNotFoundError`, write `auto_reply_hold` audit row and return `{ decision:'none', reason:'chat_not_found' }` |
| step 2 settings | `trigger.js:166-169` | `getSettings()`; if `whatsappAutoReply.enabled === false`, return `{ decision:'none', reason:'auto_reply_disabled' }` |
| step 3 compose system prompt | `trigger.js:172-179` | pick `BAILEYS_AI_SYSTEM_PROMPT_{ID,EN}` per `settings.language`; `buildSystemPrompt({ settings, tenantName: 'Tenant', language, basePrompt })` |
| step 4 hybrid retrieval | `trigger.js:182-187` | `hybridRetrieval({ query: body, scope: 'whatsapp', chatId, contactPhone: phone })` |
| step 4b fetch full KB text for grounding | `trigger.js:194-203` | `SELECT text FROM knowledge_chunks` (single-tenant MVP — no `WHERE tenant_id`) |
| step 5 turbo cutoff | `trigger.js:206-212` | if `retrievalScore < TAU_TURBO` → transition `ai → human_pending_flag`, write `auto_reply_hold`, return `{ decision:'hold', reason:'turbo_cutoff' }` (slot present; never fires today per §13 G-AI-8) |
| step 6 build user prompt | `trigger.js:248-258` | `buildUserPrompt({ question, contextChunks, chatHistory, contactPhone, summary, maxHistory })`; schedule async `maybeUpdateSummary(chatId, tenantId, { fireAndForget: true })` |
| step 7 LLM call | `trigger.js` (via `createChatCompletion`) | with `jsonSchema: { name:'whatsapp_auto_reply', schema: WhatsAppAutoReplyDecisionSchema }` |
| step 8 parse | `trigger.js` (via `parseStructuredOutput`) | ≤3 attempts |
| step 9 confidence gate (bypassed on fallback) | `trigger.js:309-321` | `if (parsed.fallback_used) → send verbatim`; else `if (parsed.confidence < settings.whatsappAutoReply.confidenceThreshold) → transition ai→human_pending_flag + hold` |
| step 11 numerical consistency | `trigger.js:55-69, 325-340` | `extractNumbers(answer)` strips `[n]` citation markers, `Rp ` prefix, and ID thousand separators BEFORE extracting digits; each number must appear in EITHER a retrieved chunk's text OR the full KB text |
| step 12 send | `trigger.js` (via `sendReply`) | `sock.sendMessage(chatId, { text: body })` with `ANTI_BAN_MAX_SEND_RETRIES` retries (default 3) on retryable errors; persists outbound into `messages`; updates `chats.last_message_preview` + `last_message_at` (BIGINT epoch seconds) + `unread_count=0`; fire-and-forget `episodic.embedAndStoreMessage(outbound)` |
| audit row | `trigger.js:344-352` | `audit.write('auto_reply_sent', { chatId, tenantId, confidence, citations, retrievalScore, messageId })` |

The typing indicator is started before the LLM call (`startTyping`)
and stopped in a `try/finally` so it always fires (`trigger.js:264,
282, 357-358`). The dispatcher-level filter at `src/index.js:115-121`
adds a defense-in-depth layer on top of the trigger's own self-echo
guard at `trigger.js:81-83`.

#### 9.1.2 AIReplyMode state machine

`src/ai/whatsapp/handoff.js`:

- Modes: `'ai' | 'human' | 'human_pending_flag'` — byte-equal to
  `frontend/src/types/crm.ts:7` and the SQL `CHECK` constraint on
  `chats.ai_mode` (`src/db/migrations/001-initial.sql:14-15`).
- Allowed transitions (`handoff.js:31-37`): `ai→human_pending_flag`,
  `ai→human`, `human_pending_flag→ai`, `human_pending_flag→human`,
  `human→ai`.
- **Forbidden: `human → human_pending_flag`** (absent from `ALLOWED`)
  — only the operator can re-enable; the BE never auto-flags from
  `human`.
- Idempotent same-mode updates short-circuit at `handoff.js:43, 100`.
- `transitionChatMode(chatId, fromMode, toMode, _reason)`
  (`handoff.js:98-113`) does CAS-style
  `UPDATE chats SET ai_mode = $1 WHERE id = $2 AND ai_mode = $3
  RETURNING ai_mode`. If 0 rows return, re-reads the current mode and
  throws `ChatNotFoundError` or `ForbiddenTransitionError` accordingly.

#### 9.1.3 `POST /api/crm/ai/toggle-mode`

`src/controllers/ai/toggleMode.js:15-18`:

```
BodySchema = z.object({
  chatId: z.string().min(1),
  mode: z.enum(['ai', 'human']),  // never 'human_pending_flag'
});
```

- Validates body; 400 on failure with `{ error:'ValidationError',
  message, details }`.
- 404 with `{ error:'ChatNotFound', chatId }` on missing chat.
- 400 with `{ error:'ForbiddenTransition', message, from, to }` on a
  forbidden transition (e.g. `human → human_pending_flag` if the
  caller bypassed zod).
- Idempotent: if `current === mode`, returns
  `{ ok:true, chatId, mode, idempotent:true }`.
- On success, writes a `state_transition` audit row with
  `actor:'operator', reason:'operator_toggle'`.

#### 9.1.4 `sendReply({ sock, chatId, body, tenantId })`

`src/ai/whatsapp/send.js:34-98`:

- `startTyping(sock, chatId)` for 5s (cycle
  `be-typing-indicators-2026-07-10`).
- `sock.sendMessage(chatId, { text: body })` with up to
  `ANTI_BAN_MAX_SEND_RETRIES` retries on retryable errors.
- Persists outbound into `messages` (`direction='out', status='sent'`).
- Updates `chats.last_message_preview`, `last_message_at` (BIGINT
  epoch seconds — no `to_timestamp` cast), `unread_count=0`.
- Fire-and-forget `episodic.embedAndStoreMessage(outbound)`.
- Returns `{ messageId, timestamp }`; final retry exhaustion throws
  `SendFailedError` and writes an `auto_reply_hold` audit row.

### 9.2 Acceptance criteria (WhatsApp trigger + state machine)

| AC | Given | When | Then |
|---|---|---|---|
| T-AC-1 | inbound with `key.fromMe === true` | `processInboundMessage` | returns `{ decision:'none', reason:'self_echo' }` (`trigger.js:81-83`); zero LLM calls; zero outbound sends |
| T-AC-2 | inbound on `status@broadcast` | `processInboundMessage` | returns `{ decision:'none', reason:'non_chat_message' }` (`trigger.js:85-87`) |
| T-AC-3 | inbound on `@lid` JID with registered PN mapping | `processInboundMessage` | `chatId` is resolved via `inbox.resolveJid` to the PN; the same `chats` row is used as inbox + `/api/messages/send` |
| T-AC-4 | inbound with empty `body` | `processInboundMessage` | returns `{ decision:'none', reason:'empty_body' }` (`trigger.js:97-100`) |
| T-AC-5 | a previously-unknown chat JID | `processInboundMessage` | `upsertChatOnInbound` creates a `chats` row with `ai_mode='ai'` (DEFAULT) and `last_message_at=now` |
| T-AC-6 | an existing `chats` row with `ai_mode='human'` | `processInboundMessage` | returns `{ decision:'none', reason:'human_mode' }` (`trigger.js:161-163`) |
| T-AC-7 | an existing `chats` row with `ai_mode='human_pending_flag'` | `processInboundMessage` | returns `{ decision:'none', reason:'human_pending_flag' }` |
| T-AC-8 | `chats` row missing | `processInboundMessage` | writes `auto_reply_hold { reason:'chat_not_found' }`; returns `{ decision:'none', reason:'chat_not_found' }` |
| T-AC-9 | `settings.whatsappAutoReply.enabled === false` | `processInboundMessage` | returns `{ decision:'none', reason:'auto_reply_disabled' }` (`trigger.js:166-169`) |
| T-AC-10 | valid `ai`-mode chat + auto-reply enabled + LLM returns valid structured output with `confidence >= threshold` | `processInboundMessage` | sends via `sendReply`; writes `auto_reply_sent` audit row |
| T-AC-11 | LLM returns `fallback_used:true, confidence:0.5, answer:"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"` | `processInboundMessage` | sends the fallback phrase verbatim; does NOT flip `ai_mode` to `human_pending_flag` (the gate is bypassed when `fallback_used=true`, `trigger.js:309-321`) |
| T-AC-12 | LLM answer quotes a price present in any KB chunk | `processInboundMessage` | the answer passes the numerical-consistency check (`trigger.js:325-340`) |
| T-AC-13 | LLM answer introduces a number absent from the entire KB | `processInboundMessage` | transitions to `human_pending_flag` with reason `ungrounded_number` |
| T-AC-14 | LLM answer has `confidence < settings.whatsappAutoReply.confidenceThreshold` (default 0.7) AND `fallback_used=false` | `processInboundMessage` | transitions to `human_pending_flag` with reason `low_confidence`; does NOT send |
| T-AC-15 | `retrievalScore < TAU_TURBO` (slot; disabled today) | `processInboundMessage` | transitions to `human_pending_flag` with reason `turbo_cutoff`; does NOT call the LLM |
| T-AC-16 | AIReplyMode state machine allowed transition `ai→human` | `transitionChatMode(chatId, 'ai', 'human')` | succeeds; row's `ai_mode='human'` |
| T-AC-17 | forbidden transition `human → human_pending_flag` | `transitionChatMode(chatId, 'human', 'human_pending_flag')` | throws `ForbiddenTransitionError('human', 'human_pending_flag')` |
| T-AC-18 | concurrent transition (race) that moves the row out from under the caller | `transitionChatMode(chatId, 'ai', 'human')` then another writer flips it to `human_pending_flag` between the read and the CAS | `UPDATE … WHERE id = $2 AND ai_mode = $3` returns 0 rows; the function re-reads and throws `ForbiddenTransitionError('human_pending_flag', 'human')` (`handoff.js:107-112`) |
| T-AC-19 | idempotent same-mode update | `transitionChatMode(chatId, 'ai', 'ai')` | short-circuits with no SQL (`handoff.js:100`); returns without throwing |
| T-AC-20 | `POST /api/crm/ai/toggle-mode { chatId, mode:'human_pending_flag' }` | zod validation | 400 `{ error:'ValidationError', details: [issue] }` (the schema rejects `human_pending_flag`, `toggleMode.js:17`) |
| T-AC-21 | `POST /api/crm/ai/toggle-mode { chatId, mode:'ai' }` and current `human` | the route runs | 200 `{ ok:true, chatId, mode:'ai' }`; audit row `state_transition { fromMode:'human', toMode:'ai', actor:'operator' }` |
| T-AC-22 | `POST /api/crm/ai/toggle-mode { chatId, mode:'human' }` and current `human` | the route runs | 200 `{ ok:true, chatId, mode:'human', idempotent:true }` (no audit row, no SQL) |
| T-AC-23 | `POST /api/crm/ai/toggle-mode { chatId, mode:'ai' }` and chat row missing | the route runs | 404 `{ error:'ChatNotFound', chatId }` |
| T-AC-24 | `sendReply` fails `ANTI_BAN_MAX_SEND_RETRIES` times on retryable errors | `processInboundMessage` | writes `auto_reply_hold { reason:'send_failure' }`; transitions to `human_pending_flag` |
| T-AC-25 | a successful send | `sendReply` | `messages` row inserted with `direction='out', status='sent'`; `chats.last_message_preview`, `last_message_at`, `unread_count=0` updated; fire-and-forget `episodic.embedAndStoreMessage(outbound)` |

Citations: `src/ai/whatsapp/trigger.js:71-360`;
`src/ai/whatsapp/handoff.js:11-123`;
`src/ai/whatsapp/send.js:34-98`;
`src/inbox/writer.js` (LID↔PN module);
`src/controllers/ai/toggleMode.js:15-74`;
`src/controllers/ai/replyPreview.js:19-93`;
`src/db/migrations/001-initial.sql:14-15`;
`src/index.js:115-121` (dispatcher-level self-echo guard).

### 9.3 NG (WhatsApp trigger + state machine)

- **T-NG-1** Streaming replies — NG-AI-5.
- **T-NG-2** Per-message audio/image/video send — out of scope for the
  AI path (MVP `messageController.js` text-only).
- **T-NG-3** Direct operator write to `human_pending_flag` from the
  API — `human_pending_flag` is BE-only (set by the trigger / state
  machine, not the operator).

## 10. Feature: Defense-in-depth (sub-feature 7)

Per the PRD's 7-layer enumeration
([`PRD-AI-1 §4.10`](./prd.md)). Each layer is implemented in source
and (where applicable) exercised by at least one vitest spec.

### 10.1 7-layer table

| # | Layer | Where | Catches | Test |
|---|---|---|---|---|
| 1 | **Locked system prompt** (BASE + tenant + HARDENED) | `src/ai/settings/composer.js:80-95`; `src/ai/llm/base-prompts.js:7,67`; `src/ai/settings/hardened-rules.js:7-12` | LLM "forgetting" rules; per-tenant customisation overriding locked behaviour | `src/test/composer-byte-identity.test.mjs` (1 spec — fails-as-intended post-hotfix #4); `src/test/hardened-rules.test.mjs` (4 specs) |
| 2 | **Structured output schema** (zod, json_schema mode) | `src/ai/llm/parse.js:17-30`; `src/ai/llm/openai-compat.js:126-135` | Free-form invention; malformed JSON | `src/test/parse.test.mjs` (4 specs); `src/test/llm-retry.test.mjs` |
| 3 | **Citation grounding** (cosine ≥ 0.85 per cite) | `src/ai/llm/parse.js:17-30` (schema requires `citations: number[]`); `src/ai/retrieval/reranker.js:22-35` | Fake citations | covered indirectly by `src/test/hybrid.test.mjs` |
| 4 | **Numerical consistency** (numbers in answer must appear in cited chunks OR full KB) | `src/ai/whatsapp/trigger.js:55-69, 325-340`; `src/ai/whatsapp/trigger.js:194-203` (full KB text fetch) | Invented numbers | covered indirectly by `src/test/contact-scope.test.mjs` and the trigger integration via `src/test/routes-ai.test.mjs` |
| 5 | **NLI entailment check** | — (Phase 2 — not implemented in this cycle, NG-AI-3) | Unsupported sentences | (Phase 2) |
| 6 | **Contact-scope hard filter** (data layer + prompt + post-validate) | SQL partial index `src/db/migrations/003-indexes.sql`; `src/ai/retrieval/hybrid.js:54-71`; `src/ai/whatsapp/trigger.js:194-203` (post-LLM consults entity_records) | Cross-contact leak | `src/test/contact-scope.test.mjs` (5 specs, 3 skipped on missing DB) |
| 7 | **Confidence gate + turbo cutoff** (τ_retrieval slot, τ_user ∈ [0.5, 0.95]) | `src/ai/retrieval/hybrid.js:12, 86-89` (slot; disabled at MVP); `src/ai/whatsapp/trigger.js:206-212, 309-321` | Overconfident hallucinations; retrieval misses | `src/test/hybrid.test.mjs` (5 specs); `src/test/state-machine.test.mjs` (7 specs) |

### 10.2 Acceptance criteria (defense-in-depth)

| AC | Given | When | Then |
|---|---|---|---|
| D-AC-1 | layer 1: LLM is asked to override the HARDENED rules | `buildSystemPrompt` | the returned string ends with the 4 HARDENED rules regardless of `settings.rules` (`composer.js:94`) |
| D-AC-2 | layer 2: LLM returns malformed JSON 3 times | `parseStructuredOutput` | `LlmParseError('Failed to parse structured output after 3 attempts', ..., 3)` thrown after exactly 3 attempts |
| D-AC-3 | layer 3: LLM returns a JSON with `citations: []` but `fallback_used: false` | the trigger | the answer is treated as ungrounded (the post-LLM guard consults `entity_records.contact_id` and the retrieval text); for `ask`, the answer shape is preserved |
| D-AC-4 | layer 4: LLM answer is `"Harga paket Rp 5.000.000"` and KB contains `"5.000.000"` | the trigger | the number `"5000000"` is in EITHER a retrieved chunk's text OR the full KB text → `ungrounded_number` gate does NOT fire |
| D-AC-5 | layer 4: LLM answer is `"Harga paket Rp 7.500.000"` and KB contains only `"5.000.000"` | the trigger | the number `"7500000"` is NOT in any retrieved chunk AND NOT in the full KB text → transitions to `human_pending_flag` with reason `ungrounded_number` |
| D-AC-6 | layer 4: LLM answer is `"Lihat [4] untuk detail"` and KB chunk 4 contains the detail | the trigger | `extractNumbers` strips `[4]` → no number is extracted → gate does NOT fire on citation markers |
| D-AC-7 | layer 6: `scope='whatsapp'` and `contactPhone='6281234567890'` | `hybridRetrieval` | `contactScopeApplied = true` in the return value |
| D-AC-8 | layer 6: post-LLM guard consults `entity_records.contact_id` | the trigger | a record with `contact_id` ≠ chat's contact is excluded from the answer's citations |
| D-AC-9 | layer 7: τ_user threshold default `0.7` | `getSettings()` | `settings.whatsappAutoReply.confidenceThreshold = 0.7` |
| D-AC-10 | layer 7: τ_retrieval slot is `TAU_TURBO = 0.0` | `hybrid.js:12` | constant exported as `0.0`; the cutoff cannot fire today; see §13 G-AI-8 |
| D-AC-11 | layer 7: confidence `< 0.7` AND `fallback_used=false` | the trigger | transitions `ai → human_pending_flag` with reason `low_confidence` |

Citations: `src/ai/settings/composer.js:80-95`;
`src/ai/settings/hardened-rules.js:7-18`;
`src/ai/llm/parse.js:17-84`;
`src/ai/retrieval/hybrid.js:54-71, 86-89`;
`src/ai/whatsapp/trigger.js:55-69, 194-203, 206-212, 309-321, 325-340`;
`src/db/migrations/003-indexes.sql`;
`src/ai/settings/defaults.js:20-23`.

### 10.3 NG (defense-in-depth)

- **D-NG-1** NLI entailment — NG-AI-3 (Phase 2).
- **D-NG-2** Cross-encoder reranker — NG-AI-4 (Phase 2).
- **D-NG-3** Per-chunk contact-id filter on KB — KB chunks are
  tenant-wide in MVP; the data-layer + post-LLM guards on
  `entity_records` are the active layer-6 enforcement.

## 11. Feature: REST endpoints (sub-feature 8)

Source:
[`src/ai/routes/ai.js`](../../../../src/ai/routes/ai.js),
[`src/ai/routes/crm.js`](../../../../src/ai/routes/crm.js),
[`src/ai/routes/knowledge.js`](../../../../src/ai/routes/knowledge.js),
[`src/ai/routes/settings.js`](../../../../src/ai/routes/settings.js),
[`src/ai/routes/index.js`](../../../../src/ai/routes/index.js),
[`src/controllers/ai/ask.js`](../../../../src/controllers/ai/ask.js),
[`src/controllers/ai/replyPreview.js`](../../../../src/controllers/ai/replyPreview.js),
[`src/controllers/ai/toggleMode.js`](../../../../src/controllers/ai/toggleMode.js).
Mounted at `/api/crm/*` by `src/index.js:47` via `mountAiRoutes(app)`.

### 11.1 Endpoint table (cycle-level)

| Method | Path | Scope | Controller | Source |
|---|---|---|---|---|
| POST | `/api/crm/ai/ask` | team (full KB + all tenant CRM, no contact filter) | `src/controllers/ai/ask.js:22-116` | `src/ai/routes/ai.js:14` |
| POST | `/api/crm/ai/reply-preview` | team (same pipeline minus `sock.sendMessage`) | `src/controllers/ai/replyPreview.js:19-93` | `src/ai/routes/ai.js:15` |
| POST | `/api/crm/ai/toggle-mode` | team (operator-driven `ai ↔ human`; rejects `human_pending_flag`) | `src/controllers/ai/toggleMode.js:20-74` | `src/ai/routes/ai.js:16` |
| GET | `/api/crm/ai/settings` | team | (route handler) | `src/ai/routes/settings.js` |
| PUT | `/api/crm/ai/settings` | team | (route handler; calls `updateSettings`) | `src/ai/routes/settings.js` |
| POST | `/api/crm/ai/settings/reset` | team | (route handler; calls `resetSettings`) | `src/ai/routes/settings.js` |
| GET / POST | `/api/crm/entities` | team (list / create, zod-validated) | (inline) | `src/ai/routes/crm.js:15-73` |
| PATCH / DELETE | `/api/crm/entities/:id` | team (new-version rename / soft-delete) | (inline) | `src/ai/routes/crm.js:76-114` |
| GET / POST | `/api/crm/entities/:id/records` | team (paginated list + filter / create) | (inline) | `src/ai/routes/crm.js:118-173` |
| PATCH / DELETE | `/api/crm/records/:id` | team (update / delete) | (inline) | `src/ai/routes/crm.js:176-207` |
| GET | `/api/crm/knowledge/files` | team (list, optional `?status=` filter) | (inline) | `src/ai/routes/knowledge.js:21-47` |
| POST | `/api/crm/knowledge/upload` | team (multipart → async ingest worker) | (inline) | `src/ai/routes/knowledge.js:50-68` |
| GET | `/api/crm/knowledge/files/:id` | team (file metadata + chunk count) | (inline) | `src/ai/routes/knowledge.js:71-94` |
| DELETE | `/api/crm/knowledge/files/:id` | team (delete + cascade chunks) | (inline) | `src/ai/routes/knowledge.js:97-105` |

All routes are tenant-scoped via `requireTenant` middleware
(`src/ai/routes/_middleware.js`); 404 fallback for `/api/crm/*` at
`src/ai/routes/index.js:17-19`.

### 11.2 `POST /api/crm/ai/ask` — request/response shapes

Request body: `{ question: string min(3) max(500), topK?: number
int(1..10) }` (`ask.js:17-20`).

Response (200):

| `kind` | Shape | When |
|---|---|---|
| `answered` | `{ kind:'answered', answer, confidence, evidence:[{kind:'kb', entryId, excerpt, source, confidence}], generatedAt, question }` | `parsed.fallback_used === false` AND `parsed.confidence ≥ settings.whatsappAutoReply.confidenceThreshold ?? 0.3` |
| `fallback` | `{ kind:'fallback', message: AI_FALLBACK_MESSAGE_ID, generatedAt, question }` | parse failure OR `fallback_used=true` OR `confidence < threshold` |

Note: **`ask.js:81` uses `0.3` as the fallback threshold when
`settings.whatsappAutoReply.confidenceThreshold` is undefined** — this
is the **deliberate per-surface divergence** flagged as **§13 G-AI-9**.
The WhatsApp trigger uses `settings.whatsappAutoReply.confidenceThreshold`
(default `0.7`).

### 11.3 Acceptance criteria (REST endpoints)

| AC | Given | When | Then |
|---|---|---|---|
| REST-AC-1 | valid body `{ question:'Berapa harga paket?' }` | `POST /api/crm/ai/ask` | 200 with either `{ kind:'answered', answer, confidence, evidence, ... }` or `{ kind:'fallback', message, ... }` |
| REST-AC-2 | body missing or wrong type | `POST /api/crm/ai/ask` | 400 `{ error:'ValidationError', message:'Invalid body', details: [...] }` |
| REST-AC-3 | body `{ question:'ab' }` (too short) | `POST /api/crm/ai/ask` | 400 (zod `min(3)`) |
| REST-AC-4 | LLM returns invalid JSON 3 times | `POST /api/crm/ai/ask` | 200 `{ kind:'fallback', message: AI_FALLBACK_MESSAGE_ID, ... }`; audit row `auto_reply_hold { reason:'ask_parse_failure' }` (`ask.js:72`) |
| REST-AC-5 | LLM returns `confidence < 0.3` (when threshold undefined) | `POST /api/crm/ai/ask` | 200 `{ kind:'fallback', message: AI_FALLBACK_MESSAGE_ID, ... }`; audit row `auto_reply_hold { reason:'low_confidence_or_fallback' }` (`ask.js:84`) |
| REST-AC-6 | successful answer | `POST /api/crm/ai/ask` | audit row `endpoint_hit { method:'POST', path:'/api/crm/ai/ask', status:200 }` |
| REST-AC-7 | `POST /api/crm/ai/reply-preview` | (mirror of ask; no `sock.sendMessage`) | 200 with the same answer shape as `ask` |
| REST-AC-8 | `POST /api/crm/ai/toggle-mode { chatId, mode:'human_pending_flag' }` | the route | 400 (zod rejects `human_pending_flag`) — see T-AC-20 |
| REST-AC-9 | `POST /api/crm/entities { name:'Deal', label:'Deal' }` | the route | 201 with `{ id:'ent_xxxx', version:1, ... }` |
| REST-AC-10 | a multipart upload with a 1 KB file | `POST /api/crm/knowledge/upload` | 202 `{ fileId, status:'queued' }` and a `kb_ingest` audit row |
| REST-AC-11 | `GET /api/crm/ai/settings` | (read current row) | 200 with the camelCase shape from `rowToSettings` |
| REST-AC-12 | `PUT /api/crm/ai/settings { tone:'friendly' }` | (replace top-level primitive) | 200 `{ ok:true, settings }` |
| REST-AC-13 | `POST /api/crm/ai/settings/reset` | (reset) | 200 `{ ok:true, settings: DEFAULT_AI_SETTINGS }` |
| REST-AC-14 | any HTTP method to `/api/crm/<unknown>` | the 404 fallback | 404 from `src/ai/routes/index.js:17-19` |

Citations: `src/ai/routes/ai.js:11-18`;
`src/ai/routes/crm.js:15-207`;
`src/ai/routes/knowledge.js:21-105`;
`src/ai/routes/settings.js`;
`src/ai/routes/index.js:1-22`;
`src/ai/routes/_middleware.js`;
`src/controllers/ai/ask.js:17-118`;
`src/controllers/ai/replyPreview.js:19-93`;
`src/controllers/ai/toggleMode.js:15-76`;
`src/index.js:27-47`.

### 11.4 NG (REST)

- **REST-NG-1** No HTTP authentication — NG-AI-2; README §"Security notes".
- **REST-NG-2** No per-tenant API key — NG-AI-1.

### 11.5 Intentional FE/BE divergence on fallback phrase

Per [`PRD-AI-1 §3.1 G-AI-10`](./prd.md) and
[`BUILD-AI-1 §4.4`](./build.md), the Indonesian fallback phrase was
rewritten on 2026-07-09 to a friendly semi-formal version. The
"byte-identical, tanpa modifikasi apa pun" / "byte-identical, no
modifications" qualifier was removed from the Fallback section in BOTH
base prompts (`base-prompts.js:62, 122`). The FE mirror in
`frontend/src/i18n/id.json:74` and
`frontend/src/lib/ai/systemPrompt.ts` Fallback section was NOT updated.
This is the **deliberate per-surface FE/BE divergence** that causes
`src/test/composer-byte-identity.test.mjs:144` to fail-as-intended —
see **§13 G-AI-9** for related per-surface threshold divergence and
§12 for test-surface enumeration.

## 12. Feature: Post-cycle hotfix #2 — Episodic memory (sub-feature 9)

Source:
[`src/db/migrations/006-episodic-memory.sql`](../../../../src/db/migrations/006-episodic-memory.sql),
[`src/ai/store/episodic.js`](../../../../src/ai/store/episodic.js),
[`src/ai/whatsapp/trigger.js`](../../../../src/ai/whatsapp/trigger.js) (step 0.5 + step 4),
[`src/ai/whatsapp/send.js`](../../../../src/ai/whatsapp/send.js) (outbound embed),
[`src/ai/llm/prompt.js`](../../../../src/ai/llm/prompt.js) (accepts `chatHistory` + `summary` + `maxHistory`).

### 12.1 Behaviour spec

#### 12.1.1 Schema (migration 006)

`src/db/migrations/006-episodic-memory.sql` adds:

- `messages.embedding VECTOR(1024)`.
- `chats.conversation_summary TEXT NOT NULL DEFAULT ''`.
- `chats.summary_updated_at BIGINT NOT NULL DEFAULT 0`.
- `messages_chat_id_ts_idx` index.
- Best-effort `messages_embedding_ivf_idx WITH (lists = 4)`.

Idempotent via `DO` blocks + `IF NOT EXISTS`.

#### 12.1.2 `embedAndStoreMessage({ id, chatId, body, direction, timestamp })`

`src/ai/store/episodic.js:34-52`:

1. Returns early if any of `args.id`, `args.chatId`, `args.body` is
   missing.
2. Calls `embedText(args.body)` in a try/catch — on failure, returns
   silently (the message row stays without a vector; non-fatal).
3. UPDATEs `messages.embedding = $1::vector WHERE id = $2` (so the
   row written by the trigger step 0.5 gets its vector without a
   second INSERT).

#### 12.1.3 `episodicSearch({ chatId, queryEmbedding, topK, minTimestamp? })`

`src/ai/store/episodic.js:66-98`:

1. Returns `[]` if `chatId` is missing or `queryEmbedding` is not a
   non-empty array.
2. Default `topK = 10` (override via `opts.topK`).
3. SQL: `SELECT id, direction, body, timestamp, 1 - (embedding <=>
   $1::vector) AS score FROM messages WHERE chat_id = $2 AND embedding
   IS NOT NULL [AND timestamp >= $3] ORDER BY embedding <=>
   $1::vector LIMIT $N`.
4. Returns `[{ id, role: direction === 'in' ? 'user' : 'assistant',
   body, ts, score }]`.

#### 12.1.4 Trigger integration

`src/ai/whatsapp/trigger.js`:

- **Step 0.5** (`trigger.js:122-151`): fire-and-forget INSERT into
  `messages` (`direction='in', status='received'`) + `embedAndStoreMessage`.
  Idempotent on `key.id`.
- **Step 4 history** (`trigger.js:248-258`): `chatHistory = (await
  episodic.episodicSearch({ chatId, queryEmbedding: <body embedding>,
  topK: EPISODIC_TOPK=10 })).map(h => ({ role, content: body, ts,
  score }))`. Falls back to `inbox.getRecentHistory(chatId, 6)` on
  embedding / DB failure.
- **Step 6 prompt** (`trigger.js:248-258`): `buildUserPrompt({
  question, contextChunks, chatHistory, contactPhone, summary,
  maxHistory })` — see `src/ai/llm/prompt.js:6-55`.

#### 12.1.5 Outbound embed (`send.js`)

`src/ai/whatsapp/send.js`: after a successful send,
`episodic.embedAndStoreMessage({ ..., direction:'out' })` is
fire-and-forget.

### 12.2 Acceptance criteria (episodic memory)

| AC | Given | When | Then |
|---|---|---|---|
| EP-AC-1 | an inbound with `key.id='m1'` and `body='Halo'` | `processInboundMessage` (step 0.5) | `messages` row inserted with `direction='in', status='received', body='Halo'` (idempotent on re-fires of the same event); `messages.embedding` UPDATEs to the 1024-dim vector |
| EP-AC-2 | an outbound reply with body `'Hai juga'` | `sendReply` succeeds | `messages` row inserted with `direction='out'`; `messages.embedding` UPDATEs |
| EP-AC-3 | `embedText` throws on the inbound body | step 0.5 fire-and-forget closure | the trigger continues; the message row exists but `messages.embedding IS NULL`; subsequent `episodicSearch` skips it (filter at `episodic.js:80`) |
| EP-AC-4 | `chatId='c1'`, 3 messages with embeddings, query body `'topik lanjutan'` | `episodicSearch({ chatId:'c1', queryEmbedding, topK:10 })` | returns up to 10 rows ordered by cosine similarity, filtered `chat_id='c1'` |
| EP-AC-5 | `minTimestamp=1700000000` is set | `episodicSearch` | adds `AND timestamp >= $3` to the WHERE clause (`episodic.js:73-77`) |
| EP-AC-6 | `chatId` is missing or `queryEmbedding` is `[]` | `episodicSearch` | returns `[]` immediately (`episodic.js:67-68`) |
| EP-AC-7 | a previously-injected `inbox.getRecentHistory` baseline | the trigger's step 4 fallback | `inbox.getRecentHistory(chatId, 6)` returns up to 6 prior `{role, content, ts}` entries |

Citations: `src/db/migrations/006-episodic-memory.sql`;
`src/ai/store/episodic.js:34-98`;
`src/ai/whatsapp/trigger.js:122-151, 248-258`;
`src/ai/whatsapp/send.js:34-98`;
`src/ai/llm/prompt.js:6-55`;
`src/inbox/writer.js:599-627` (`getRecentHistory` fallback).

### 12.3 NG (episodic memory)

- **EP-NG-1** Streaming embedder updates — the embed is fire-and-forget
  on every inbound + outbound; there is no batch backfill.
- **EP-NG-2** Cross-chat episodic search — filtered strictly by
  `chat_id`.

## 13. Feature: Post-cycle hotfix #3 — Chat summary (sub-feature 10)

Source:
[`src/ai/settings/summary.js`](../../../../src/ai/settings/summary.js),
[`src/ai/whatsapp/trigger.js`](../../../../src/ai/whatsapp/trigger.js) (loads + schedules update),
[`src/ai/llm/prompt.js`](../../../../src/ai/llm/prompt.js) (accepts `summary`).

### 13.1 Behaviour spec

#### 13.1.1 Constants (`src/ai/settings/summary.js:23-26`)

- `MIN_REFRESH_SECONDS = 600` (10 min; env-tunable).
- `MAX_CONTEXT_MESSAGES = 30`.
- `MAX_SUMMARY_CHARS = 4000`.
- `MAX_BODY_CHARS = 400` (per-message body slice).

#### 13.1.2 `loadChatSummary(chatId)` (`summary.js:49-57`)

`SELECT conversation_summary FROM chats WHERE id = $1`; returns
`r.rows[0].conversation_summary || ''` (empty string if row missing
or column empty).

#### 13.1.3 `maybeUpdateSummary(chatId, tenantId, opts)` (`summary.js:59-78`)

1. Returns early if `!chatId`.
2. Reads `chats.summary_updated_at`; if
   `now - lastUpdate < MIN_REFRESH_SECONDS`, short-circuits (cache
   fresh — no LLM call).
3. If `opts.fireAndForget`, calls
   `updateChatSummary(chatId, tenantId).catch(() => {})` and returns
   (non-blocking).
4. Otherwise `await updateChatSummary(chatId, tenantId)`.

#### 13.1.4 `updateChatSummary(chatId, tenantId)` (`summary.js:80-133`)

1. Reads the last `MAX_CONTEXT_MESSAGES` messages for the chat,
   oldest-first (`summary.js:83-99`).
2. Builds a user prompt with the previous summary (if any) + the
   recent messages (`summary.js:100-106`).
3. Calls `createChatCompletion` with `SUMMARIZER_SYSTEM` and the
   user prompt (`summary.js:108-114`).
4. Strips markdown fencing, caps at `MAX_SUMMARY_CHARS` (`summary.js:115-120`).
5. On LLM failure, keeps the previous summary and bumps the timestamp
   (so the trigger doesn't retry on every turn) (`summary.js:121-125`).
6. `UPDATE chats SET conversation_summary = $1,
   summary_updated_at = $2 WHERE id = $3` (`summary.js:126-132`).

#### 13.1.5 Trigger integration

`src/ai/whatsapp/trigger.js` loads the summary via
`loadChatSummary(chatId)` before `buildUserPrompt` and passes it as
the `summary` arg. It schedules `maybeUpdateSummary(chatId, tenantId,
{ fireAndForget: true })` after the prompt is built (non-blocking).

### 13.2 Acceptance criteria (chat summary)

| AC | Given | When | Then |
|---|---|---|---|
| CS-AC-1 | a chat with `conversation_summary='previous'`, `summary_updated_at=now-300s` | `maybeUpdateSummary(chatId)` | short-circuits (cache fresh, `< 600s`); no LLM call; `summary_updated_at` NOT updated |
| CS-AC-2 | a chat with `summary_updated_at=now-700s` | `maybeUpdateSummary(chatId)` | calls `updateChatSummary` (cache stale, `>= 600s`) |
| CS-AC-3 | `opts.fireAndForget=true` and cache stale | `maybeUpdateSummary` | schedules `updateChatSummary(...).catch(() => {})` and returns immediately (`summary.js:73-76`) |
| CS-AC-4 | a chat with 30 messages | `updateChatSummary` | reads exactly 30 rows (`LIMIT $2` at `summary.js:88`); each body sliced to 400 chars |
| CS-AC-5 | a chat with no messages | `updateChatSummary` | returns early at `summary.js:91`; `UPDATE` not issued |
| CS-AC-6 | LLM call fails | `updateChatSummary` | the previous summary is preserved (`summary.js:124`); `summary_updated_at` is bumped so we don't retry on every turn |
| CS-AC-7 | the trigger's step 6 prompt build | `buildUserPrompt({ ..., summary: '...' })` | emits a `<CONVERSATION_SUMMARY>...</CONVERSATION_SUMMARY>` block BEFORE `<CONTEXT>` (per `src/ai/llm/prompt.js:6-55`) |
| CS-AC-8 | a chat with `conversation_summary=''` | `loadChatSummary(chatId)` | returns `''`; no summary block is emitted |

Citations: `src/ai/settings/summary.js:23-26, 49-78, 80-133`;
`src/ai/whatsapp/trigger.js` (calls to `loadChatSummary` and
`maybeUpdateSummary`);
`src/ai/llm/prompt.js:6-55` (accepts `summary` and `maxHistory`).

### 13.3 NG (chat summary)

- **CS-NG-1** Cross-chat summary — `loadChatSummary` is per-chat.
- **CS-NG-2** Summary regeneration frequency below 10 minutes — the
  debounce is enforced at the DB layer (`summary_updated_at`).

## 14. Feature: Post-cycle hotfix #4 — Fallback phrase rewrite (sub-feature 11)

Source:
[`src/i18n/ai-fallback.js`](../../../../src/i18n/ai-fallback.js),
[`src/ai/llm/base-prompts.js`](../../../../src/ai/llm/base-prompts.js) (Fallback section in ID + EN),
[`src/controllers/ai/ask.js`](../../../../src/controllers/ai/ask.js) (uses `AI_FALLBACK_MESSAGE_ID`).

### 14.1 Behaviour spec

#### 14.1.1 Locked phrases

`src/i18n/ai-fallback.js:10-13`:

- `AI_FALLBACK_MESSAGE_ID = 'Maaf kak, untuk hal itu belum ada di data kami ya 🙏'`
- `AI_FALLBACK_MESSAGE_EN = "Sorry, we don't have data on that yet 🙏"`

Both are friendly semi-formal (Indonesian uses `kak` + `kami` + emoji).

#### 14.1.2 Base-prompt Fallback section

`src/ai/llm/base-prompts.js:61-65` (ID):

```
# Fallback
Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (tanpa modifikasi apa pun):
"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"

Lalu set `fallback_used: true`, `confidence` < 0.7, dan `citations: []`.
```

`src/ai/llm/base-prompts.js:121-125` (EN):

```
# Fallback
If the CONTEXT block is insufficient to answer with confidence >= 0.7, reply EXACTLY with the following sentence (no modifications):
"Sorry, we don't have data on that yet 🙏"

Then set `fallback_used: true`, `confidence` < 0.7, and `citations: []`.
```

Note: the "(byte-identical, tanpa modifikasi apa pun)" / "(byte-identical, no
modifications)" qualifier present in the pre-2026-07-09 version was
removed because the new phrase is no longer byte-locked
(`be_dev_history.md:37-38`).

#### 14.1.3 Trigger bypass

`src/ai/whatsapp/trigger.js:309-321`: when the LLM returns
`fallback_used: true`, the confidence gate is bypassed and the
locked phrase is sent verbatim.

### 14.2 Acceptance criteria (fallback phrase rewrite)

| AC | Given | When | Then |
|---|---|---|---|
| FP-AC-1 | the LLM returns `{ fallback_used:true, confidence:0.5, answer:"Maaf kak, untuk hal itu belum ada di data kami ya 🙏" }` | the WhatsApp trigger | sends the answer verbatim via `sendReply`; does NOT flip `ai_mode` (`trigger.js:309-321`) |
| FP-AC-2 | `POST /api/crm/ai/ask` and the LLM returns `fallback_used:true` | the ask controller | returns 200 `{ kind:'fallback', message: AI_FALLBACK_MESSAGE_ID, ... }` (`ask.js:73-78`) |
| FP-AC-3 | `POST /api/crm/ai/ask` and the LLM returns invalid JSON 3 times | the ask controller | returns 200 `{ kind:'fallback', message: AI_FALLBACK_MESSAGE_ID, ... }`; audit row `auto_reply_hold { reason:'ask_parse_failure' }` (`ask.js:72`) |
| FP-AC-4 | the ID base prompt's Fallback section | read `base-prompts.js:61-65` | contains the locked phrase `"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"` |
| FP-AC-5 | the EN base prompt's Fallback section | read `base-prompts.js:121-125` | contains the locked phrase `"Sorry, we don't have data on that yet 🙏"` |
| FP-AC-6 | the FE mirror at `frontend/src/lib/ai/systemPrompt.ts` (NOT updated) | read the FE file | diverges from the BE Fallback section; see §11.5 + §13 G-AI-9 (intentional) |

Citations: `src/i18n/ai-fallback.js:1-18`;
`src/ai/llm/base-prompts.js:61-65, 121-125`;
`src/ai/whatsapp/trigger.js:309-321`;
`src/controllers/ai/ask.js:73-78`.

### 14.3 NG (fallback phrase rewrite)

- **FP-NG-1** Per-tenant configurable fallback phrase — the phrase
  is a literal in `src/i18n/ai-fallback.js` and the base prompts.
- **FP-NG-2** FE/BE parity on the fallback phrase — the FE mirror is
  intentionally divergent (see §11.5).

## 15. Feature: Test surface (sub-feature 12)

Per the task brief: enumerate every `src/test/*.test.mjs` covering
the AI cycle's code. The cycle ships **17 vitest spec files** (15
from the main cycle + 2 added with the post-cycle hotfixes). 16 are
AI-cycle; 1 (`db-migrations.test.mjs`) is DB infrastructure
(cross-cutting).

| Test file | Covers AI code? | Spec section that links to it |
|---|---|---|
| `src/test/ai-settings-roundtrip.test.mjs` | YES — settings store → composer → byte-equivalent prompt (3 specs) | §4 (S-AC-14 indirectly) |
| `src/test/audit.test.mjs` | YES — NDJSON append-only + redaction (4 specs) | §3.4 (INV-X4) |
| `src/test/chunker.test.mjs` | YES — semantic chunking (4 specs) | §6 (R-AC-10) |
| `src/test/composer-byte-identity.test.mjs` | YES — BE composer byte-equal to FE composer (7 specs; **1 fails-as-intended post-hotfix #4**) | §4 (S-AC-14); §11.5; §13 (G-AI-7) |
| `src/test/contact-scope.test.mjs` | YES — NEVER leaks contact A to chat B; data-layer + post-LLM (5 specs, 3 skipped without DB) | §10 (D-AC-7, D-AC-8) |
| `src/test/db-migrations.test.mjs` | PARTIAL — DB-infrastructure (cross-cutting); 5 specs cover migration idempotency + status() | §7 (I-AC-1, I-AC-2) |
| `src/test/db-preflight.test.mjs` | PARTIAL — DB-infrastructure (cross-cutting); 18 specs cover DB-reachable + vector-installed preflight | §7 (cross-cutting) |
| `src/test/episodic.test.mjs` | YES — episodic memory (6 specs; added with hotfix #2) | §12 (EP-AC-1..7) |
| `src/test/hardened-rules.test.mjs` | YES — 4-rule HARDENED block byte-equivalence (4 specs) | §4.1.2 (defense layer 1) |
| `src/test/hybrid.test.mjs` | YES — BM25 + ANN RRF recall sanity; contact-scope filter (5 specs) | §6 (R-AC-1..9); §10 (defense layer 6, 7) |
| `src/test/ingest.test.mjs` | YES — file upload → OCR → chunk → embed → upsert; idempotency (4 specs) | §7 (I-AC-1..7) |
| `src/test/llm-retry.test.mjs` | YES — 2-attempt exponential backoff on 429 / 5xx (8 specs) | §5 (LLM-AC-3..6) |
| `src/test/parse.test.mjs` | YES — zod validation of structured LLM output; reject-and-retry (4 specs) | §5 (LLM-AC-7, LLM-AC-8) |
| `src/test/routes-ai.test.mjs` | YES — Express route handlers; mock MiniMax; assertions on contact-scope filter (6 specs) | §11 (REST-AC-1..6) |
| `src/test/settings-defaults.test.mjs` | YES — `DEFAULT_AI_SETTINGS` structural invariance (6 specs) | §4 (S-AC-13) |
| `src/test/settings-endpoint.test.mjs` | YES — GET / PUT `/api/crm/ai/settings` (7 specs) | §11 (REST-AC-11..13) |
| `src/test/state-machine.test.mjs` | YES — AIReplyMode transitions; forbidden `human → human_pending_flag`; reversible `human_pending_flag → ai / human` (7 specs) | §9 (T-AC-16..23); §10 (defense layer 7) |
| `src/test/typing.test.mjs` | NO — covered by `BUILD-TYPING-1` (seq 1); cross-cycle | n/a (seq 1) |
| `src/test/inbox-history.test.mjs` | PARTIAL — covers `inbox.getRecentHistory` (a pre-hotfix-#2 fallback path; 5 specs) | §12 (EP-AC-7 fallback) |

**Verification** (per [`BUILD-AI-1 §5.2`](./build.md)):

```text
Test Files  1 failed | 18 passed (19)
     Tests  1 failed | 114 passed | 3 skipped (118)

The single failure is in src/test/composer-byte-identity.test.mjs
and is the documented intentional divergence recorded in
be_dev_history.md line 41 (the Indonesian fallback phrase was
rewritten on 2026-07-09 but the FE copy was not).
```

## 16. §Findings Worth Carrying Forward (per BUILD-AI-1)

The three findings below are documented in [`BUILD-AI-1 §3.2 / §5.4`](./build.md)
and the brief. They are carried forward as **explicit non-blocking
audit items** for the seq 4 SoT-fidelity audit; none of them is a
bug in the BE code as shipped.

### 16.1 G-AI-7 — `penyalahgunaan` typo in canonical Indonesian text

- **Brief claim**: the brief states the typo `penyalahgunaan` appears
  in the byte-stable canonical text on BOTH FE and BE sides.
- **On-disk source**: `src/ai/settings/hardened-rules.js:11` (this
  cycle) reads `penyalahgunaan` (correct spelling). The brief's
  mention of `penyalahgunaan` refers to the PRD/SPEC text.
- **Byte-identity**: the `composer-byte-identity.test.mjs` test
  compares the BE composer output against the FE mirror at
  `frontend/src/lib/ai/systemPrompt.ts:258-261` and asserts
  byte-equality. The test passes for the HARDENED block itself (the
  test failure is the Fallback-section divergence, NOT the HARDENED
  block — see §11.5 + G-AI-9).
- **Status**: **not a bug** — byte-identity holds trivially because
  the BE side is the canonical source. **Action**: seq 4 audit
  should reconcile the PRD-AI-1 / SPEC-AI-1 text vs the on-disk
  source; the SPEC text quoted in §4.1.2 is the on-disk source
  verbatim (`penyalahgunaan`).

### 16.2 G-AI-8 — τ_retrieval=0.30 in PRD vs TAU_TURBO=0.0 in code

- **Brief claim**: PRD/Spec text says `τ_retrieval=0.30` (turbo cutoff)
  but the BE code ships `TAU_TURBO=0.0` (MVP-disabled) at
  `src/ai/retrieval/hybrid.js:12`.
- **On-disk source**: `TAU_TURBO = 0.0` is hardcoded at
  `hybrid.js:12`. The comment reads `"Disabled at MVP — LLM's own
  confidence + user-threshold gate is the quality filter"`.
- **Reconciliation**:
  - Either the `0.30` is a Phase-2 target that was never ported (the
    likely story — `PRD-001 §4.2` AI cycle row FR-28 documents the
    `τ_retrieval=0.30` value as a forward-looking NFR slot),
  - Or the PRD text is stale (the BE code was updated to disable the
    turbo cutoff at MVP, but the PRD table was not refreshed).
- **Status**: **flag for seq 4 audit**. Code wins; the SPEC records
  `TAU_TURBO = 0.0` at `hybrid.js:12` as the locked value. The PRD-AI-1
  `G-AI-3` text should be reconciled in a future PRD revision.

### 16.3 G-AI-9 — 0.3 dashboard vs 0.7 WhatsApp threshold (deliberate divergence)

- **Brief claim**: the dashboard `/api/crm/ai/ask` uses fallback
  threshold `0.3`; the WhatsApp trigger uses `0.7`.
- **On-disk source**:
  - `src/controllers/ai/ask.js:81`:
    `if (parsed.fallback_used || parsed.confidence < (settings.whatsappAutoReply?.confidenceThreshold ?? 0.3))`.
    The `?? 0.3` is the literal fallback used by the ask dashboard
    when `confidenceThreshold` is undefined on the settings row.
  - `src/ai/whatsapp/trigger.js:309-321`: the trigger reads
    `settings.whatsappAutoReply.confidenceThreshold` directly
    (default `0.7` from `defaults.js:22`).
- **Deliberate per-surface divergence**: the ask dashboard is a
  HUMAN-FACING tool that prefers a sensible default answer over a
  fallback (`0.3` is generous), while the WhatsApp trigger is a
  CUSTOMER-FACING channel that prefers silence over a wrong answer
  (`0.7` is conservative). Both surfaces correctly return
  `kind: 'fallback'` / `decision: 'hold'` when their respective
  thresholds are not met.
- **Status**: **deliberate divergence — not a bug**. The SPEC records
  both values: §5.1.5 + §10.2 (D-AC-9) for `0.7`, §11.2 + §11.3
  (REST-AC-5) for `0.3`.

## 17. Cross-feature invariants

The twelve features share four concrete cross-cutting invariants.

| Invariant | Settings | LLM gateway | Retrieval | Ingest | CRM | Trigger | Defense | REST | Episodic | Summary | Fallback |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Module exports CJS `module.exports = { ... }` | yes (composer.js:97, store.js:110-115, hardened-rules.js:18, defaults.js:27, schema.js:43-47) | yes (openai-compat.js:201-207, parse.js:86-91, embed.js:186) | yes (hybrid.js:92, bm25.js, ann.js) | yes (ingest.js:107) | yes (entities.js) | yes (trigger.js, handoff.js:115-123, send.js) | n/a (routes are inline) | yes (routes/index.js, controllers/ai/*) | yes (episodic.js) | yes (summary.js:135-143) | yes (ai-fallback.js:15-18) |
| Reads config via env / module-level constants | yes (store reads DB; no env reads in composer/schema/defaults/hardened) | yes (LLM_MODEL, LLM_MAX_RETRIES, LLM_TIMEOUT_MS, OPENAI_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIM, EMBEDDING_BASE_URL) | yes (no env reads; TAU_TURBO + RRF_K hardcoded) | yes (KB_DIR) | no env reads (tenant_id resolved from DEFAULT_TENANT_ID) | yes (EPISODIC_TOPK, DEFAULT_TENANT_ID, ANTI_BAN_MAX_SEND_RETRIES via MVP) | n/a | yes (DEFAULT_TENANT_ID) | no env reads | yes (SUMMARY_MIN_REFRESH_SECONDS, SUMMARY_MAX_CONTEXT_MESSAGES, SUMMARY_MAX_CHARS) | no env reads |
| Throws errors with `.statusCode` so `errorHandler` maps them | yes (SettingsValidationError; 400 on zod failure) | yes (LlmPermanentError, LlmParseError) | n/a (returns plain objects) | yes (rethrows from extractText) | yes (400 on zod) | yes (ChatNotFoundError, ForbiddenTransitionError, SendFailedError) | n/a | yes (400 / 404 / 200) | n/a (returns []) | n/a (silent on failure) | n/a (returns plain string) |
| Persists state across restart | yes (ai_settings row) | no (in-memory cache) | no (re-queries each call) | yes (knowledge_files + knowledge_chunks rows + <KB_DIR>) | yes (entity_definitions + entity_records + entity_relationships rows) | yes (chats row + messages row) | n/a | yes (everything stored in DB) | yes (messages.embedding) | yes (chats.conversation_summary + summary_updated_at) | yes (literal in source) |

## 18. Failure-mode quick-reference (consolidated)

| Scenario | Site | Behavior |
|---|---|---|
| `sock === null` | trigger step 1 | `loadChatMode` would throw on missing chat; treated as `chat_not_found` (`trigger.js:158-159`) |
| `auth_info/` does not exist | (MVP cycle, see SPEC-MVP-1 §4) | trigger is not yet subscribed; AI trigger does not run |
| `messages` table missing | trigger step 0.5 | fire-and-forget closure swallows the error; trigger continues (`trigger.js:147-149`) |
| `chats.conversation_summary` row missing | trigger step 6 | `loadChatSummary(chatId)` returns `''` (`summary.js:56`); no summary block emitted |
| Embedding service unavailable | hybrid step 2 / trigger step 4 | `annHits = []`; retriever continues with BM25-only (`hybrid.js:25-32`) |
| Embedding service unavailable | trigger step 4 history | falls back to `inbox.getRecentHistory(chatId, 6)` (`trigger.js` step 4 fallback path) |
| LLM call returns invalid JSON 3 times | parse step 8 | `LlmParseError('Failed to parse structured output after 3 attempts', ..., 3)` thrown (`parse.js:79-83`); the trigger wraps this and transitions to `human_pending_flag` |
| LLM call times out | openai-compat retry loop | `AbortError` → `status=408` → retried; after `LLM_MAX_RETRIES=2`, throws `LlmPermanentError` |
| LLM call returns 503 three times | openai-compat retry loop | throws `LlmPermanentError` after 3 attempts; the trigger catches and transitions to `human_pending_flag` with reason `send_failure` (or `parse_failure` for parse path) |
| Embedder returns 1536-dim against `EMBEDDING_DIM=1024` | embed.js | throws 502 with the dim-mismatch message; the trigger continues with `messages.embedding IS NULL` (episodic search skips it) |
| `chats.ai_mode` race | handoff.js CAS | `UPDATE … WHERE id = $2 AND ai_mode = $3` returns 0 rows; re-reads the current mode and throws `ForbiddenTransitionError(<actual current>, <to>)` |
| `human → human_pending_flag` attempted | toggle-mode controller | zod rejects `human_pending_flag` (400); if the caller bypasses zod, `transitionChatMode` throws `ForbiddenTransitionError` |
| Self-echo (`fromMe=true`) | trigger step 0 + dispatcher at index.js:115-121 | trigger returns `{ decision:'none', reason:'self_echo' }`; dispatcher-level `continue` prevents the trigger from being invoked at all |
| Status broadcast | trigger step 0 | returns `{ decision:'none', reason:'non_chat_message' }` |
| Empty body | trigger step 0 | returns `{ decision:'none', reason:'empty_body' }` |
| Same message re-fired (`key.id` collision) | trigger step 0.5 | `ON CONFLICT (id) DO UPDATE SET body, timestamp`; same row overwritten (`trigger.js:130-131`) |
| Operator toggles `human → ai` and immediately a message arrives | trigger step 1 | reads the freshly-toggled mode; auto-reply resumes |
| `summary_updated_at` updated < 600s ago | summary.js debounce | `maybeUpdateSummary` short-circuits; no LLM call |
| KB files with the same first-8-hex of sha | ingest.js idempotency | returns `{ fileId, chunksCount, idempotent: true }` |
| `messages` table missing during step 0.5 | trigger.js fire-and-forget | swallowed; trigger continues |

---

## Acknowledgment Contract

```
FROM: @requirements-analyst
STATUS: Complete
SUMMARY: Wrote docs/be/features/be-ai-auto-reply-2026-07-03/spec.md (SPEC-AI-1
         v1.0.0) decomposing PRD-AI-1 into 12 sub-feature functional
         specifications + 1 §13 findings-carry-forward subsection. Cited
         src/<path>:<line> on every AC. Quoted the 4 HARDENED rules verbatim
         from src/ai/settings/hardened-rules.js:7-12. Documented AIReplyMode's
         5 allowed + 1 forbidden transition with ACs. Documented all 7
         defense-in-depth layers with distinct ACs. Documented G-AI-7 (typo
         reconciliation; on-disk source reads 'penyalahgunaan'), G-AI-8
         (τ_retrieval=0.30 vs TAU_TURBO=0.0 — code wins), G-AI-9 (0.3 ask
         vs 0.7 WhatsApp — deliberate divergence). Honest test surface
         enumeration in §15.
ARTIFACTS:
  - docs/be/features/be-ai-auto-reply-2026-07-03/spec.md
ISSUES: none
NEXT-STEP: seq 4 audit (a-audit-doc + a-audit-implementation + a-audit-sot-fidelity)
          re-checks the SPEC against the code; the supervisor routes the
          audit dispatches after seq 3 closes.
```