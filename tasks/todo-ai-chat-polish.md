# In-App AI Chat Polish — Task Checklist

Spec: `docs/specs/2026-08-18-in-app-ai-chat-polish.md`
Plan: `tasks/plan-ai-chat-polish.md`

## Phase 1: Backend SSE
- [ ] Task 1: SSE helper module (`api/stream.js`)
- [ ] Task 2: `streamChat` controller
- [ ] Task 3: Mount `POST /api/ai/chat` route

**Checkpoint: Backend** — SSE tests green, endpoint mounts.

## Phase 2: History persistence
- [ ] Task 4: Migration `011-ai-history.sql`
- [ ] Task 5: History store + CRUD routes

**Checkpoint: Backend + History** — history CRUD works.

## Phase 3: Frontend
- [ ] Task 6: `useChatStream` hook
- [ ] Task 7: `useAiHistory` store (replaces sessionStorage)
- [ ] Task 8: `ToolCallCard` + `MarkdownAnswer` components
- [ ] Task 9: Wire into `AiWorkspacePage` (stream, chips, copy, regenerate, export)
- [ ] Task 10: Add `react-markdown`, `remark-gfm`, `shiki` deps

**Checkpoint: Frontend** — page streams, chips show, history persists, copy/regenerate/export work.

## Phase 4: Polish
- [ ] Task 11: Verification HTML

**Checkpoint: Complete** — all tests green, verification HTML done, `AiChatPage` alias intact.
