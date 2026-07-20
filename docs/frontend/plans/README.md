# Plans — `docs/frontend/plans/`

> Plan index for the `frontend/` module. Populated by the **Planner** in
> Phase 3 from the SSoT docs at `../general/MODULE_OVERVIEW.md`,
> `../features/chats/`, `../features/ai-chat/`, `../api/api-spec.md`,
> `../../tech/chat-data-model.md`, and `../../tech/frontend-stack.md`.
>
> Every plan in this folder follows the format defined in
> `.kilo/agent/orchestrator.md` §6. The Orchestrator assigns the next free
> `NN` from this index.
>
> **Phase 5 dual-verdict gate (added 2026-07-09):** every plan in this
> folder is owned by `@frontend-dev` and ships user-visible UI, so
> every `done` plan here requires **two** Phase 5 verdicts before it
> counts as shipped — `production-ready` from
> [`a-audit-implementation`](../../../.kilo/skills/a-audit-implementation/SKILL.md)
> (code level) **and** `ui-production-ready` from
> [`a-audit-ui`](../../../.kilo/skills/a-audit-ui/SKILL.md) (browser
> level, via `browser-use`). See
> [`../general/MODULE_OVERVIEW.md`](../general/MODULE_OVERVIEW.md) §11
> and
> [`.kilo/agent/orchestrator.md`](../../../.kilo/agent/orchestrator.md)
> §11 termination criteria.

## Owner

All plans below are owned by **@frontend-dev**.

## Status legend

- `todo` — drafted, awaiting Phase 4 dependency resolution.
- `in-progress` — delegated to the owner; work in flight.
- `done` — owner reports completion; awaits Phase 5 audit.

## Plan Index

| File | Title | Owner | Status | Depends on |
|---|---|---|---|---|
| [`01-frontend-bootstrap.md`](01-frontend-bootstrap.md) | Frontend Bootstrap (Vite + React + TS + Tailwind + shadcn scaffold) | @frontend-dev | `done` | — |
| [`02-shared-types-and-mock-data.md`](02-shared-types-and-mock-data.md) | Shared Types and Mock Data (interfaces, zod schemas, Indonesian seeds) | @frontend-dev | `done` | 01 |
| [`03-routing-and-layout.md`](03-routing-and-layout.md) | Routing and Layout (React Router 6 + AppShell + TanStack Query + Zustand) | @frontend-dev | `done` | 01 |
| [`04-api-client-and-mock-handler.md`](04-api-client-and-mock-handler.md) | API Client and Mock Handler (fetch client + interceptor + TanStack hooks + auth banner) | @frontend-dev | `done` | 01, 02, 03 |
| [`05-chats-page-list.md`](05-chats-page-list.md) | Chats Page — List (sidebar + `contactLabel()` real impl) | @frontend-dev | `done` | 01, 02, 03, 04 |
| [`06-chats-page-thread.md`](06-chats-page-thread.md) | Chats Page — Thread (header + message list + composer with optimistic send) | @frontend-dev | `done` | 01, 02, 03, 04, 05 |
| [`07-ai-chat-page.md`](07-ai-chat-page.md) | AI Chat Page (transcript + confidence badge + evidence panel + fallback) | @frontend-dev | `done` | 01, 02, 03, 04, 05, 06 |
| [`08-polish-and-theming.md`](08-polish-and-theming.md) | Polish and Theming (dark/light, skeletons, keyboard, responsive, i18n, a11y) | @frontend-dev | `done` | 01, 02, 03, 04, 05, 06, 07 |

> All 8 plans transitioned to `done` on 2026-07-01 by @frontend-dev execution; read-only consistent with the per-plan `## Status` sections.

## Dependency Graph (ASCII)

```
[01 bootstrap]
   │
   ├─▶ [02 types + mock] ───────────────────────┐
   │                                            │
   ├─▶ [03 routing + layout] ──┐                │
   │                           ▼                │
   └─▶ [04 api client + mock handler] ──┐        │
                                        ▼        ▼
                                  [05 chats list]
                                        │
                                        ▼
                                  [06 chats thread]
                                        │
                                        ▼
                                  [07 ai chat]
                                        │
                                        ▼
                                  [08 polish]
```

Plans 02 and 03 may run in parallel after 01. Plan 04 requires 01, 02, and
03. Plans 05–07 form a chain. Plan 08 runs last.

## Execution notes (for the Orchestrator in Phase 4)

- The smallest executable plan is **Plan 01** (no upstream dependencies).
- After Plan 01 reports `done`, **Plan 02** and **Plan 03** become
  executable in parallel.
- Plan 04 unblocks once all three (01, 02, 03) are `done`.
- Plan 08 is the cycle-terminating plan; on its `done`, the cycle is
  ready for the Phase 5 audit.
- Every plan sets its own status. The Orchestrator must **not** mutate a
  plan's status on behalf of the executing agent.

## Related SSoT

- Feature specs that drive the plans above:
  [`../features/chats/spec.md`](../features/chats/spec.md),
  [`../features/ai-chat/spec.md`](../features/ai-chat/spec.md).
- PRDs (acceptance framing):
  [`../features/chats/prd.md`](../features/chats/prd.md),
  [`../features/ai-chat/prd.md`](../features/ai-chat/prd.md).
- API contract the plans must implement:
  [`../api/api-spec.md`](../api/api-spec.md).
- Data shapes the plans must honor:
  [`../../tech/chat-data-model.md`](../../tech/chat-data-model.md).
- Stack constraints the plans must respect:
  [`../../tech/frontend-stack.md`](../../tech/frontend-stack.md).
- Module overview (mock-vs-real boundary, route map, contact display rule):
  [`../general/MODULE_OVERVIEW.md`](../general/MODULE_OVERVIEW.md).