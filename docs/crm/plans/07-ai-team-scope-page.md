# Plan 07: In-App AI Team-Scope Page (`/ai`)

**Goal**: Build the `/ai` workspace page from `docs/crm/features/ai-autoreply/spec.md` — the team-scope variant of the CRM/RAG pipeline that uses `/api/crm/ai/ask` (NO contact filter, full evidence trail) — and replace the existing `/ai-chat` placeholder so both URLs render the new `AiWorkspacePage`. The page reuses the `ConfidenceBadge`, `EvidencePanel`, and `AiComposer` already shipped by the WhatsApp module, with one extension: the evidence panel shows `contactId` for every evidence item so the operator can audit the scope at a glance.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — page lives at `/ai` inside the new shell; `/ai-chat` is a permanent alias.

## Micro-Tasks

1. **Build the `AiWorkspacePage`**
   - Create `frontend/src/pages/AiWorkspacePage.tsx` (TSX) rendering two columns:
     - **Left (sidebar, 320 px)**: a list of past `/ai` questions (saved in `sessionStorage` under `ai.history.v1`) with the question text and the answer's confidence; clicking a row restores the transcript.
     - **Right (content)**: the existing `Transcript` (`frontend/src/components/ai/Transcript.tsx`), the existing `EvidencePanel` (`frontend/src/components/ai/EvidencePanel.tsx`), and the existing `AiComposer` (`frontend/src/components/ai/AiComposer.tsx`) stacked vertically.
   - Page title: `AI Workspace`; subtitle: `Scope: tim internal — semua entity CRM terlihat.`
   - **Acceptance**: visiting `/ai` renders the page with no console errors; visiting `/ai-chat` renders the same page (alias); the existing `ConfidenceBadge` and `EvidencePanel` render unchanged from the WhatsApp module; `pnpm typecheck` passes.

2. **Wire `useAskAi()` and the evidence-trail extension**
   - `frontend/src/hooks/useAskAi.ts` already exists for the WhatsApp module. Create `frontend/src/hooks/crm/useAskAiTeam.ts` (TS) that calls `POST /api/crm/ai/ask` (per `docs/frontend/api/api-spec.md` §6) and returns `{ answer, confidence, evidence[] }`. The hook is team-scope only — it does NOT pass any `contactId`.
   - Extend `EvidencePanel` minimally: add a small grey caption under each evidence row reading `contact: <contactId | none>` (per `docs/crm/features/ai-autoreply/spec.md` §5.1). The caption is rendered only when the evidence item has `contactId !== undefined`; for the in-app path the items typically carry `contactId` from the chunk's record (per the mock handler in Plan 02 task 3).
   - **Acceptance**: a question that matches two records owned by different contacts (`C-A`, `C-B`) returns evidence rows showing both `contactId`s (no filter applied — this is the team-scope behavior); the page title makes the scope explicit; `pnpm typecheck` passes.

3. **Replace the existing `/ai-chat` and the new `/ai` placeholders**
   - Delete (or rewrite) `frontend/src/pages/AiChatPage.tsx` so it re-exports `AiWorkspacePage`. The existing `frontend/src/pages/AiChatPage.tsx` file becomes a one-liner `export { default } from './AiWorkspacePage';`.
   - In `frontend/src/router.tsx`, both `/ai` and `/ai-chat` route to `AiWorkspacePage` (Plan 01 already added `/ai`; verify `/ai-chat` continues to resolve to the same component).
   - **Acceptance**: `pnpm typecheck` passes; both URLs render the new page; the WhatsApp module's existing usages of `AiChatPage` (none in tests, but check `grep -R "AiChatPage" frontend/src/`) keep working; `pnpm build` succeeds.

4. **Render the CRM/RAG-specific fallback message and threshold**
   - When `useAskAiTeam()` returns a fallback (low confidence OR `UNKNOWN`), the transcript shows the locked Indonesian sentence from `docs/crm/features/knowledge-rag/spec.md` §7 byte-identical: `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …`.
   - The threshold compared against `confidence` is the CRM/RAG `0.7` from `docs/tech/crm-data-model.md` §3 — distinct from the WhatsApp-module `0.65`. Both are constants in code, but they live in different files (do NOT consolidate).
   - **Acceptance**: a low-confidence answer renders the fallback sentence byte-identical (a grep across `frontend/src/lib/ai/fallbackMessage.ts` and the new team-scope page returns the same string); `ConfidenceBadge` displays the actual `confidence` value with two decimals; `pnpm typecheck` passes.

5. **Add a "Try the WhatsApp variant" link in the page header**
   - At the top-right of `AiWorkspacePage`, render a small button `Buka chat contoh` that navigates to `/chats` (the WhatsApp inbox) and opens the first seeded chat. This is the only cross-link between the two AI surfaces and is purely a navigation affordance.
   - **Acceptance**: clicking the button navigates to `/chats` and the URL contains the chat id; the link is hidden on `/ai-chat` if needed (the alias resolves identically so the link is always visible); `pnpm typecheck` passes.

## Cross-References
- Two-surface distinction (team scope vs WhatsApp scope): `docs/crm/features/ai-autoreply/spec.md` §1, §5 (table); `docs/crm/general/MODULE_OVERVIEW.md` §3
- `/api/crm/ai/ask` contract (no contact filter; full evidence): `docs/frontend/api/api-spec.md` §6
- Evidence item shape (with `contactId`): `docs/crm/features/ai-autoreply/spec.md` §5.1
- CRM/RAG threshold (`0.7`): `docs/tech/crm-data-model.md` §3
- Locked Indonesian fallback sentence (byte-identical): `docs/crm/features/knowledge-rag/spec.md` §7; `docs/tech/chat-data-model.md` §2.8
- Reused components (read-only): `frontend/src/components/ai/{Transcript,EvidencePanel,AiComposer,ConfidenceBadge}.tsx`
- Existing hook: `frontend/src/hooks/useAskAi.ts` (WhatsApp scope); this plan adds the team-scope hook

## Notes
- The team-scope page is **not** contact-scoped; the contact filter is applied ONLY on the WhatsApp auto-reply path (per `docs/crm/features/ai-autoreply/spec.md` §5 table). Do NOT add a contact filter to the in-app path.
- The plan reuses `ConfidenceBadge`, `EvidencePanel`, `Transcript`, and `AiComposer` without modification (except the minimal evidence caption in task 2). New visual design for these is out of scope.
- The locked WhatsApp-module fallback sentence and the locked `0.65` are untouched. The CRM/RAG fallback (`docs/crm/features/knowledge-rag/spec.md` §7) is byte-identical to the WhatsApp-module fallback by design; both files import from `frontend/src/lib/ai/fallbackMessage.ts` so there is a single source.
- Do NOT touch `src/`; `/api/crm/ai/ask` is mocked in `frontend/src/mock/interceptor.ts` by Plan 02.