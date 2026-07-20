# Plans — `docs/crm/plans/`

> Plan index for the new **`crm/`** module (CRM + RAG, UI restructure,
> WhatsApp auto-reply). Populated by the **Planner** in Phase 3 from the
> SSoT docs at `../general/MODULE_OVERVIEW.md`,
> `../features/{navigation,schema-designer,data-viewer,knowledge-rag,ai-autoreply}/spec.md`,
> `../../tech/crm-data-model.md`, `../../tech/ai-reply-state-machine.md`,
> and the `docs/frontend/api/api-spec.md` §6 CRM endpoints section.
>
> Every plan in this folder follows the format defined in
> `.kilo/agent/orchestrator.md` §6. The Orchestrator assigns the next free
> `NN` from this index.

## Owner

- Plans 01–14 are owned by **@frontend-dev**.
- Plans 15–24 are owned by **@backend-dev** (BE AI Auto-Reply cycle,
  run `be-ai-auto-reply-2026-07-03`).

## Status legend

- `todo` — drafted, awaiting Phase 4 dependency resolution.
- `in-progress` — delegated to the owner; work in flight.
- `done` — owner reports completion; awaits Phase 5 audit.

## Plan Index

| File | Title | Owner | Status | Depends on |
|---|---|---|---|---|
| [`01-ui-restructure.md`](01-ui-restructure.md) | UI Restructure (Three-Pane Layout + Router) | @frontend-dev | `todo` | — |
| [`02-crm-workspace-and-mock-layer.md`](02-crm-workspace-and-mock-layer.md) | CRM Workspace Shell + Shared CRM Types + Mock Layer | @frontend-dev | `todo` | 01 |
| [`03-schema-designer.md`](03-schema-designer.md) | Schema Designer (entity / field / relation editor + version history) | @frontend-dev | `todo` | 01, 02 |
| [`04-data-viewer.md`](04-data-viewer.md) | Data Viewer (schema-driven column list + record form + cross-contact leak guard) | @frontend-dev | `todo` | 01, 02, 03 |
| [`05-knowledge-upload-ui.md`](05-knowledge-upload-ui.md) | Knowledge Upload UI (drag-drop, lifecycle chips, retry, deterministic mock embedder) | @frontend-dev | `todo` | 01, 02 |
| [`06-ai-toggle-flag-ui.md`](06-ai-toggle-flag-ui.md) | AI Toggle / Flag UI (WhatsApp thread header + held-draft banner + reply-preview) | @frontend-dev | `todo` | 01, 02 |
| [`07-ai-team-scope-page.md`](07-ai-team-scope-page.md) | In-App AI Team-Scope Page (`/ai` + `/ai-chat` alias) | @frontend-dev | `todo` | 01 |
| [`08-polish-and-theming.md`](08-polish-and-theming.md) | CRM Polish & Theming (responsive, keyboard, a11y, i18n, skeletons) | @frontend-dev | `todo` | 04, 05, 06, 07 |
| [`09-ai-settings-types-and-store.md`](09-ai-settings-types-and-store.md) | AI Settings — TS types + Zustand store + localStorage persistence | @frontend-dev | `todo` | — |
| [`10-nav-rail-and-route-add-settings.md`](10-nav-rail-and-route-add-settings.md) | Navigation Rail + Route — add `AI Settings` (4th Pane1Rail item, `/ai-settings` route, single-column) | @frontend-dev | `todo` | 09 |
| [`11-ai-settings-page-and-form.md`](11-ai-settings-page-and-form.md) | AI Settings Page + Form (seven cards: Identity / Tone / Language / Scope / Rules / WhatsApp Auto-reply / Hardened read-only) | @frontend-dev | `todo` | 09, 10 |
| [`12-system-prompt-templating.md`](12-system-prompt-templating.md) | System Prompt Templating — `buildSystemPromptFragment(settings)` + `getHardenedRulesBlock()` + composed `buildSystemPrompt`; cycle-9 17 specs continue passing | @frontend-dev | `todo` | 09 |
| [`13-ai-workspace-integration.md`](13-ai-workspace-integration.md) | AI Workspace Integration — `/ai` reads `useAiSettingsStore`, mock interceptor honors `language`; WhatsApp-scope `contact_id` filter MUST NOT regress | @frontend-dev | `todo` | 11, 12 |
| [`14-settings-shortcut-from-ai-page.md`](14-settings-shortcut-from-ai-page.md) | Settings shortcut from `/ai` page — `Atur AI` link → `/ai-settings` with rail highlight sync | @frontend-dev | `todo` | 11, 13 |
| [`15-db-layer-postgresql.md`](15-db-layer-postgresql.md) | Database Layer — PostgreSQL + Kysely + 3 migrations + dev seed | @backend-dev | `todo` | — |
| [`16-settings-store-composer-hardened.md`](16-settings-store-composer-hardened.md) | Settings Store + Composer (byte-equal mirror of FE) + Hardened Rules + Defaults + Zod | @backend-dev | `todo` | — |
| [`17-llm-gateway.md`](17-llm-gateway.md) | LLM Gateway — MiniMax-M3 OpenAI-compat + Anthropic-compat fallback + retries + parse-retry | @backend-dev | `todo` | — |
| [`18-kb-ingestion.md`](18-kb-ingestion.md) | KB Ingestion — OCR (PDF/DOCX/HTML/XLSX) + chunker + MiniMax embeddings + idempotent upsert | @backend-dev | `todo` | 15, 17 |
| [`19-retrieval-pipeline.md`](19-retrieval-pipeline.md) | Retrieval Pipeline — BM25 (Postgres FTS) + ANN (pgvector) + rerank + turbo cutoff + contact-scope filter | @backend-dev | `todo` | 15, 17, 18 |
| [`20-whatsapp-trigger-state-machine.md`](20-whatsapp-trigger-state-machine.md) | WhatsApp Trigger + AIReplyMode State Machine + Send | @backend-dev | `todo` | 16, 19 |
| [`21-rest-endpoints.md`](21-rest-endpoints.md) | REST Endpoints — 14 Express routes covering MVP.md §2.3 | @backend-dev | `todo` | 16, 17, 18, 19, 20 |
| [`22-audit-log.md`](22-audit-log.md) | Audit Log — pino structured NDJSON to `./data/audit/<date>.ndjson` | @backend-dev | `todo` | 20, 21 |
| [`23-defense-in-depth-tests.md`](23-defense-in-depth-tests.md) | Defense-in-Depth Tests — vitest suite (≥30 specs) covering all 7 MVP.md §3.5 layers | @backend-dev | `todo` | 15, 16, 17, 18, 19, 20, 21, 22 |
| [`24-integration-and-smoke.md`](24-integration-and-smoke.md) | Integration & Smoke — wire it all up + README + package.json + manual end-to-end smoke | @backend-dev | `todo` | 15, 16, 17, 18, 19, 20, 21, 22, 23 |

> Plans 01–08 are `todo` as of 2026-07-01 (Round-1 Planner authoring phase, Phase 3).
> Plans 09–14 are `todo` as of 2026-07-02 (Round-2 Planner authoring phase, Phase 3).
> Plans 15–24 are `todo` as of 2026-07-03 (Round-3 Planner authoring phase, Phase 3, BE AI Auto-Reply cycle).

## Dependency Graph (ASCII)

```
[01 ui-restructure]
    │
    ├─▶ [02 crm-workspace + mock] ──┬──▶ [03 schema-designer] ──▶ [04 data-viewer] ──┐
    │                               │                                                       │
    │                               ├──▶ [05 knowledge-upload-ui] ───────────────────────┤
    │                               │                                                       │
    │                               └──▶ [06 ai-toggle/flag-ui] ────────────────────────┤
    │                                                                                       │
    └─▶ [07 ai-team-scope-page] ───────────────────────────────────────────────────────────┤
                                                                                              │
                                                                    [08 polish + theming] ◀────┘

Round 2 — AI Settings:

[09 types + store]
    │
    ├─▶ [10 nav rail + /ai-settings route]
    │       │
    │       └─▶ [11 ai-settings page + form]
    │               │
    │               └─▶ [13 ai-workspace integration] ──▶ [14 settings shortcut from /ai]
    │                       │
    │                       ▲
    └───────────────────────┴──▶ [12 system prompt templating]
                              (12 only needs 09; runs in parallel with 10/11)

Round 3 — BE AI Auto-Reply (run be-ai-auto-reply-2026-07-03):

[15 db layer]          [16 settings + composer]      [17 llm gateway]
    │                       │                               │
    │                       │                               │
    ├───────────────────────┼───────────────────────────────┤
    ▼                       ▼                               ▼
                [18 kb ingestion] ─────────────────────────┐
                    │                                       │
                    ▼                                       │
                [19 retrieval pipeline] ◀──────────────────┘
                    │
                    ▼
                                    [20 whatsapp trigger + state machine] ◀── [16]
                                            │
                                            ▼
                                    [21 rest endpoints] ◀── [16, 17, 18, 19, 20]
                                            │
                                            ▼
                                    [22 audit log] ◀── [20, 21]
                                            │
                                            ▼
                                    [23 defense-in-depth tests] ◀── all prior
                                            │
                                            ▼
                                    [24 integration + smoke] ◀── all prior
```

Round 1: Plans 02 and 07 may run in parallel after 01. Plan 03 requires 01 + 02.
Plan 04 requires 01 + 02 + 03 (it reads `schemaJson.fields` produced by
the schema designer). Plans 05 and 06 each require 01 + 02 (they are
independent of the schema designer and of each other; they may run in
parallel). Plan 08 runs last and consolidates the polish pass over 04,
05, 06, 07.

Round 2: Plan 09 is the root. Plan 10 depends on 09 (extends
`Pane1Selection`). Plan 11 depends on 09 + 10 (form imports store and
lives under the new route). Plan 12 depends on 09 only (only needs the
types) and may run in parallel with 10/11. Plan 13 depends on 11 + 12.
Plan 14 depends on 11 + 13 and closes the round.

Round 3 (BE cycle): Plan 15 (DB), 16 (settings/composer), and 17 (LLM
gateway) are independent roots — all three may run in parallel after
the cycle enters Phase 4. Plan 18 requires 15 + 17. Plan 19 requires 15
+ 17 + 18. Plan 20 requires 16 + 19. Plan 21 requires 16 + 17 + 18 + 19
+ 20. Plan 22 requires 20 + 21. Plan 23 requires all prior plans (15–22).
Plan 24 closes the cycle and requires all prior plans (15–23).

## Execution notes (for the Orchestrator in Phase 4)

- The smallest executable plans in Round 3 are **Plan 15, 16, and 17** (no upstream dependencies).
- After Plans 15 and 17 are `done`, **Plan 18** becomes executable.
- After Plan 18 is `done`, **Plan 19** becomes executable.
- After Plans 16 and 19 are `done`, **Plan 20** becomes executable.
- After Plans 16, 17, 18, 19, and 20 are `done`, **Plan 21** becomes executable.
- After Plans 20 and 21 are `done`, **Plan 22** becomes executable.
- Plan 23 requires all of 15–22; Plan 24 requires all of 15–23.
- The cycle-terminating plan is **Plan 24**; on its `done`, the BE AI Auto-Reply cycle is ready for the Phase 5 audit.
- Every plan sets its own status. The Orchestrator must **not** mutate a
  plan's status on behalf of the executing agent.

## Out-of-scope (this run)

- Frontend wiring to the new BE endpoints — the FE keeps its `frontend/src/mock/crm/*` stubs for this cycle; wiring is a separate follow-up cycle (mostly trivial fetch swap).
- Multi-tenant isolation (RLS). Documented as future work in
  `docs/crm/general/MODULE_OVERVIEW.md` §6.
- NLI entailment check (defense-in-depth layer 5) — Phase 2.
- Cross-encoder reranker (replaces MiniMax-embed cosine rerank) — Phase 2.
- WebSocket for real-time `aiMode` updates — Phase 3.
- KB auto-tag extraction at ingest time — Phase 3.
- Audit-log export (compliance) — Phase 3.
- Fine-tuned model on tenant data — Phase 3.

## Locked values (preserved byte-identical across all plans)

| Value | Source | Used by |
|---|---|---|
| `0.65` — legacy WhatsApp-module AI threshold | `docs/tech/chat-data-model.md` §2.6 | WhatsApp `/api/ai/ask` only (untouched) |
| `0.7` — CRM/RAG threshold | `docs/tech/crm-data-model.md` §3 | Plans 04, 06, 07, 13, 16, 19, 21 |
| `'ai' \| 'human' \| 'human_pending_flag'` (literal union) | `docs/tech/crm-data-model.md` §2 / `docs/tech/ai-reply-state-machine.md` §1 / `docs/crm/features/ai-autoreply/spec.md` §2 / `docs/be/MVP.md` §3.4 | Plans 02, 06, 15 (SQL CHECK), 20, 21 |
| `"Grup belum dinamai"` | `docs/frontend/features/chats/spec.md` | WhatsApp module only (untouched) |
| `"Status"` (WhatsApp placeholder) | `docs/frontend/features/chats/spec.md` | WhatsApp module only (untouched) |
| `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …` | `docs/tech/chat-data-model.md` §2.8 / `docs/crm/features/knowledge-rag/spec.md` §7 / `frontend/src/i18n/id.json -> ai.fallback.message` | Plans 04, 05, 07, 12, 13, 16, 21 (single source in `frontend/src/i18n/id.json`; prompt builder REFERENCES the constant, does not inline) |
| Four Bahasa Indonesia hardened rules (canonical order) | `docs/tech/ai-settings-data-model.md` §3.2 / `docs/crm/features/ai-settings/spec.md` §4.7 / `docs/be/MVP.md` §3.2 | Plans 11, 12, 13, 16, 23 (single source `getHardenedRulesBlock()`) |
| `pane1Selection = 'chats' \| 'crm' \| 'ai' \| 'settings'` | `docs/crm/features/ai-settings/spec.md` §3 + `frontend/src/stores/ui.ts` | Plans 09 (read), 10 (extends), 13 (sets), 14 (sets) |
| `localStorage` key `'baileys-frontend:ai-settings'` (tagged `{ version: 1, value: AiSettings }`) | `docs/tech/ai-settings-data-model.md` §5 | Plans 09, 11 |
| `AiLanguage = 'id' \| 'en' \| 'id-mod'` | `docs/tech/ai-settings-data-model.md` §1 | Plans 09, 11, 12, 13, 16, 21 |
| `AiTone = 'formal' \| 'casual' \| 'friendly' \| 'concise' \| 'enthusiastic'` | `docs/tech/ai-settings-data-model.md` §1 | Plans 09, 11, 12, 16 |
| `senderPn` contact-display rule | `docs/frontend/features/chats/spec.md` / `docs/crm/features/navigation/spec.md` §4 | All plans (read-only) |
| `τ_turbo = 0.30` (turbo cutoff, locked) | `docs/be/MVP.md` §3.3 | Plans 19, 20, 21, 23 |
| `τ_user` default = `0.7` (range `[0.5, 0.95]`, step `0.05`) | `docs/be/MVP.md` §3.3 + `docs/tech/crm-data-model.md` §3 | Plans 16, 19, 20, 21, 23 |
| MiniMax-M3 (MiniMax) via OpenAI-compat default; Anthropic-compat via `LLM_PROVIDER` | `docs/be/MVP.md` §1 #1 | Plans 17, 18, 20, 21, 23 |
| Defense-in-depth 7 layers (locked) | `docs/be/MVP.md` §3.5 | Plans 15, 16, 17, 18, 19, 20, 22, 23 |
| Stack pins (Vite 5.x, React 18.x, TypeScript 5.x, Tailwind 3.x, React Router 6.x, TanStack Query 5.x, Zustand 4.x) | `docs/tech/frontend-stack.md` | Plans 01–14 (FE only) |
| BE stack pins (Node 18+, Express, `pg@^8`, `kysely@^0.27`, `zod@^3`, `openai@^4`, `pino`, `vitest@^2`) | `docs/be/MVP.md` §4 | Plans 15–24 (BE only) |

## Related SSoT

- Module overview (scope, route map, locked decisions): [`../general/MODULE_OVERVIEW.md`](../general/MODULE_OVERVIEW.md).
- Feature specs that drive the plans above:
  [`../features/navigation/spec.md`](../features/navigation/spec.md),
  [`../features/schema-designer/spec.md`](../features/schema-designer/spec.md),
  [`../features/data-viewer/spec.md`](../features/data-viewer/spec.md),
  [`../features/knowledge-rag/spec.md`](../features/knowledge-rag/spec.md),
  [`../features/ai-autoreply/spec.md`](../features/ai-autoreply/spec.md),
  [`../features/ai-chat/spec.md`](../features/ai-chat/spec.md),
  [`../features/ai-chat/systemPrompt.md`](../features/ai-chat/systemPrompt.md),
  [`../features/ai-settings/spec.md`](../features/ai-settings/spec.md),
  [`../features/ai-settings/prd.md`](../features/ai-settings/prd.md).
- PRDs (acceptance framing): the matching `prd.md` next to each spec.
- API contract the plans must implement (CRM section, all `[mock]`):
  [`../../frontend/api/api-spec.md` §6](../../frontend/api/api-spec.md).
- BE API contract (canonical source for the BE):
  [`../../be/api/api-spec.md`](../../be/api/api-spec.md) and
  [`../../be/MVP.md` §2.3](../../be/MVP.md).
- Data shapes the plans must honor:
  [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md),
  [`../../tech/ai-settings-data-model.md`](../../tech/ai-settings-data-model.md),
  [`../../tech/postgresql-schema.md`](../../tech/postgresql-schema.md),
  [`../../tech/be-data-model.md`](../../tech/be-data-model.md).
- State machine for `AIReplyMode` transitions:
  [`../../tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md).
- BE feature specs that drive Plans 15–24:
  [`../../be/features/ai-orchestration/spec.md`](../../be/features/ai-orchestration/spec.md),
  [`../../be/features/ai-state-machine/spec.md`](../../be/features/ai-state-machine/spec.md),
  [`../../be/features/ai-whatsapp-trigger/spec.md`](../../be/features/ai-whatsapp-trigger/spec.md),
  [`../../be/features/crm-store/spec.md`](../../be/features/crm-store/spec.md),
  [`../../be/features/kb-ingestion/spec.md`](../../be/features/kb-ingestion/spec.md).
- Coexistence with the existing WhatsApp module (locked values preserved):
  [`../../frontend/general/MODULE_OVERVIEW.md` §10](../../frontend/general/MODULE_OVERVIEW.md).
- Stack constraints: [`../../tech/frontend-stack.md`](../../tech/frontend-stack.md); BE deps in `docs/be/MVP.md` §4.