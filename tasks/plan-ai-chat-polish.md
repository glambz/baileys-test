# Implementation Plan: In-App AI Chat — Streaming + Tool-Call Visualization

## Overview

Make the in-app AI workspace (`/ai-workspace`) feel modern: stream tokens, visualize CRM/KB tool calls, persist history server-side, add regenerate/copy/export. New SSE endpoint + new frontend components, no breaking changes to existing `/api/crm/ai/ask`.

## Architecture Decisions

- **SSE, not WebSockets.** Lower complexity, unidirectional, works with existing Express middleware. WebSockets would be overkill.
- **New endpoint, not change existing.** `POST /api/ai/chat` streams. `POST /api/crm/ai/ask` keeps its request/response contract for any non-streaming callers.
- **Server-side history.** A new `ai_history` table (per-user, but single-user now) with `id`, `question`, `answer`, `confidence`, `evidence_json`, `created_at`. Replaces `sessionStorage` stub.
- **Tool-call events on the stream.** The backend emits `event: tool` whenever the LLM calls a CRM/KB tool. The client renders them as chips in real time.
- **Cancel via `AbortController`.** Frontend passes `signal`; backend hooks `req.on('close')` to stop the LLM stream.

## Dependency Graph

```
Backend:
  streamChat controller (SSE)
    │
    ├── ai/audit/log.js (existing)
    ├── ai/retrieval/hybrid.js (now scope-aware from spec 1)
    ├── crm tools (existing)
    │
    └── ai_history migration + store
         │
         └── routes/ai.js mounts the new endpoint

Frontend:
  useChatStream hook
    │
    ├── Transcript updates (streaming items)
    ├── ToolCallCard component
    ├── MarkdownAnswer component
    │
    └── useAiHistory store (replaces sessionStorage)
```

## Task List

### Phase 1: Backend SSE

- [ ] **Task 1:** SSE helper module
  - Acceptance: `apps/backend/src/api/stream.js` exports `sseMiddleware(req, res, next)` that sets headers (`text/event-stream`, `cache-control: no-cache`, `connection: keep-alive`) and provides `res.sse(event, data)` + `res.sseDone()` + `res.sseError(msg)`. Heartbeat every 15s.
  - Verify: unit test with mocked `res` asserts wire format for tool/chunk/done events.
  - Files: `apps/backend/src/api/stream.js` (new), `tests/api/stream.test.js` (new).
  - Size: S.

- [ ] **Task 2:** `streamChat` controller
  - Acceptance: `POST /api/ai/chat` accepts `{question, history?}`. Streams `tool` events as the LLM calls tools, `chunk` events as tokens arrive, `done` event with final answer. Honors `req.on('close')` to abort.
  - Verify: integration test with a stubbed LLM that emits 3 chunks; assert SSE event order on the wire.
  - Files: `apps/backend/src/controllers/ai/streamChat.js` (new), `tests/controllers/ai/streamChat.test.js` (new).
  - Size: M.

- [ ] **Task 3:** Mount route
  - Acceptance: `POST /api/ai/chat` registered in `apps/backend/src/routes/ai.js`. Same auth/tenant middleware as `/api/crm/ai/ask`.
  - Verify: supertest hits the route and gets 200 + SSE headers.
  - Files: `apps/backend/src/routes/ai.js` (modified).
  - Size: S.

### Checkpoint: Backend
- [ ] All SSE tests green.
- [ ] Endpoint mounts cleanly.

### Phase 2: History persistence

- [ ] **Task 4:** Migration `011-ai-history.sql`
  - Acceptance: `ai_history` table with `id`, `user_id` (nullable for now), `question`, `answer`, `confidence`, `evidence_json`, `kind`, `created_at`. Index on `created_at DESC`.
  - Verify: `pnpm migrate` clean; `\d ai_history` shows table.
  - Files: `apps/backend/src/db/migrations/011-ai-history.sql` (new).
  - Size: S.

- [ ] **Task 5:** History store + routes
  - Acceptance: `GET /api/ai/history` returns last 30 entries; `POST /api/ai/history` persists one entry after stream completes; `DELETE /api/ai/history/:id` removes one. Backend uses `tenantId` from request.
  - Verify: integration tests for each.
  - Files: `apps/backend/src/ai/history/store.js` (new), `apps/backend/src/routes/ai.js` (modified), `tests/api/ai-history.test.js` (new).
  - Size: M.

### Checkpoint: Backend + History
- [ ] All backend tests green.
- [ ] History CRUD works.

### Phase 3: Frontend

- [ ] **Task 6:** `useChatStream` hook
  - Acceptance: takes `{endpoint, onTool, onChunk, onDone, onError}`. Uses `fetch` + `ReadableStream` (not `EventSource`, since we POST). Aborts on unmount. Returns `{abort, status}`.
  - Verify: unit test with mocked `fetch` streaming. Asserts events fire in order.
  - Files: `apps/frontend/src/hooks/useChatStream.ts` (new), `tests/hooks/useChatStream.test.ts` (new).
  - Size: S.

- [ ] **Task 7:** `useAiHistory` store
  - Acceptance: Zustand store backed by `react-query`. Loads on mount, saves on `done`, exposes `restore(id)`, `remove(id)`. Replaces `sessionStorage` stub in `AiWorkspacePage.tsx`.
  - Verify: component test asserts history row click restores the question into the composer.
  - Files: `apps/frontend/src/stores/useAiHistory.ts` (new), `tests/stores/useAiHistory.test.ts` (new).
  - Size: M.

- [ ] **Task 8:** `ToolCallCard` + `MarkdownAnswer` components
  - Acceptance: `ToolCallCard` renders collapsible `<Collapsible>` with name badge + result count + JSON input. `MarkdownAnswer` renders AI text with `react-markdown` + `remark-gfm`, lazy `shiki` for code.
  - Verify: snapshot tests + render with sample props.
  - Files: `apps/frontend/src/components/ai/ToolCallCard.tsx` (new), `apps/frontend/src/components/ai/MarkdownAnswer.tsx` (new), `tests/components/ai/*.test.tsx` (new).
  - Size: M.

- [ ] **Task 9:** Wire into `AiWorkspacePage`
  - Acceptance: streaming composer, tool-call chips inline with answers, "Copy answer" button on each AI message, "Regenerate" button, "Export to Markdown" button at the bottom, history sidebar uses `useAiHistory`. Cancel button stops the stream.
  - Verify: `tests/pages/AiWorkspacePage.test.tsx` green; manual click-through.
  - Files: `apps/frontend/src/pages/AiWorkspacePage.tsx` (modified), `apps/frontend/src/components/ai/TeamAiComposer.tsx` (modified), `tests/pages/AiWorkspacePage.test.tsx` (new).
  - Size: M.

- [ ] **Task 10:** New dependencies
  - Acceptance: `react-markdown`, `remark-gfm`, `shiki` added to `apps/frontend/package.json`. `pnpm install` succeeds. Bundle size impact < 200KB (shiki lazy-loaded).
  - Verify: `pnpm build` succeeds; check Vite output.
  - Files: `apps/frontend/package.json` (modified).
  - Size: S.

### Checkpoint: Frontend
- [ ] Page renders streaming answer.
- [ ] Tool-call chips appear.
- [ ] History persists across reloads.
- [ ] Copy/Regenerate/Export work.

### Phase 4: Polish

- [ ] **Task 11:** Verification HTML
  - Acceptance: `verification/2026-XX-XX-ai-chat-polish.html` with 5 user-click scenarios (stream, tool chip, regenerate, copy, export).
  - Verify: opens in browser, all 5 scenarios documented.
  - Files: `verification/2026-XX-XX-ai-chat-polish.html` (new).
  - Size: S.

### Checkpoint: Complete
- [ ] All tests green.
- [ ] Verification HTML ready.
- [ ] No regression in `AiChatPage` alias.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM doesn't support tool-call streaming | High | Use Vercel AI SDK 5 `streamText` with `tools`; it emits tool events. If we can't migrate yet, emit a single `tool` event when each tool returns. |
| SSE breaks under nginx proxy buffering | Medium | Document `X-Accel-Buffering: no` header in commit message. |
| Bundle size blow-up from `shiki` | Low | Lazy-load `shiki` only when code block appears. |
| History grows unbounded | Low | Cap at 30 by default; add prune later. |
| Existing `AiChatPage` alias breaks | Medium | Task 9 explicitly preserves the alias. |

## Open Questions

- Should `ai_history` be per-user or global (single-user now anyway)? Spec assumes per-user with `user_id` column from day one.
- Should "Export to Markdown" include timestamps on every message? Spec says yes.
