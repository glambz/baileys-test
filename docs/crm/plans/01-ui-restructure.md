# Plan 01: UI Restructure (Three-Pane Layout + Router)

**Goal**: Restructure the existing `frontend/` shell into the three-pane layout defined in `docs/crm/features/navigation/spec.md` (left rail → secondary chat list → content), wire the new routes (`/crm/**`, `/ai`), and hoist the `AuthStatusBanner` to the shell level — without changing any locked value of the existing WhatsApp module.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- *(none — this is the foundation plan)*

## Micro-Tasks

1. **Add the CRM/RAG types and Zustand store slots needed by the shell**
   - Extend `frontend/src/types/crm.ts` (new file) with the literal union `type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';` spelled byte-identical to `docs/tech/crm-data-model.md` and `docs/tech/ai-reply-state-machine.md` (do NOT introduce alternate spellings).
   - Extend `frontend/src/stores/ui.ts` (Zustand) with `pane1Selection: 'chats' | 'crm' | 'ai'` (default `'chats'`), `pane1Collapsed: boolean` (default `false`), and selectors `selectPane1Selection` / `selectPane1Collapsed`.
   - **Acceptance**: `pnpm typecheck` passes; `useUiStore.getState().pane1Selection === 'chats'` initially; the literal union compiles with zero `any`; no other file redefines `AIReplyMode`.

2. **Wire the new router entries next to the existing ones**
   - In `frontend/src/router.tsx`, add these routes (do NOT delete or rename any existing route — `/chats`, `/chats/:chatId`, `/ai-chat`, `*` stay intact):
     - `/crm` → `<CrmWorkspacePage />` (placeholder body for now; Plan 02 replaces it)
     - `/crm/_schema` → `<CrmSchemaDesignerPage />` (placeholder; Plan 03)
     - `/crm/_knowledge` → `<CrmKnowledgePage />` (placeholder; Plan 05)
     - `/crm/:entityName` → `<CrmDataViewerPage />` (placeholder; Plan 04)
     - `/crm/:entityName/:recordId` → `<CrmRecordDetailPage />` (placeholder; Plan 04)
     - `/ai` → `<AiWorkspacePage />` (placeholder; Plan 07)
   - Keep `/ai-chat` as a permanent alias that renders the same `AiWorkspacePage` (the old `/ai-chat` route continues to work — do not redirect).
   - **Acceptance**: `pnpm typecheck` passes; visiting `/crm` and `/ai` renders their placeholder card (not a 404); visiting `/ai-chat` still resolves; the new routes lazy-load with `React.lazy` + `<Suspense fallback={<SkeletonPage />}>` per `docs/frontend/plans/03-routing-and-layout.md`.

3. **Rebuild `AppShell` to host the three panes**
   - Rewrite `frontend/src/components/layout/AppShell.tsx` into a flex row: `[Pane 1 left rail | (optional) Pane 2 | Pane 3]`.
   - Read `pane1Selection` from the Zustand store; render Pane 2 (`<ChatSidebar />` reused unmodified from `frontend/src/components/chats/ChatSidebar.tsx`) only when `pane1Selection === 'chats'`. When selection is `'crm'` or `'ai'`, Pane 2 is removed from the flex layout (not just hidden).
   - Hoist `<AuthStatusBanner />` to render above the row regardless of selection (per `docs/crm/features/navigation/spec.md` §1.2). Do not modify the banner component itself.
   - Render Pane 3 via `<Outlet />` (router owns the page).
   - **Acceptance**: at `/chats` the chat sidebar is visible at `320 px`; at `/crm` and `/ai` the layout reflows so Pane 3 spans the full remaining width; the banner is visible on all three selections; `pnpm typecheck` and `pnpm build` pass.

4. **Build `Pane1Rail` (the left rail)**
   - Create `frontend/src/components/layout/Pane1Rail.tsx` (TSX) that renders three vertically stacked items (`Chats` / `CRM` / `AI`) using lucide-react icons (`MessageSquare`, `Briefcase`, `Sparkles`). Each item has `aria-label` matching its label and `aria-current="page"` when active. Active item has `bg-accent` background + `2 px` right-edge bar in `bg-primary` (per `docs/crm/features/navigation/spec.md` §1.1).
   - Wire each item to set `pane1Selection` and `pane1Collapsed = false`, plus call `useNavigate()` to the matching route (`/chats`, `/crm`, `/ai`).
   - Add a chevron at the bottom that toggles `pane1Collapsed`; collapsed width is `64 px` (icon-only with tooltip), expanded is `240 px` (icon + label).
   - **Acceptance**: clicking each item navigates and updates the active style; keyboard Tab reaches all three and Enter activates; the chevron toggles width; tooltips appear on hover when collapsed; `pnpm typecheck` passes.

5. **Verify locked values are untouched and placeholders render**
   - Confirm `frontend/src/lib/contactLabel.ts`, `frontend/src/lib/ai/fallbackMessage.ts`, and `frontend/src/types/chat.ts` still contain the locked strings byte-identical: `0.65`, `"Grup belum dinamai"`, `"Status"`, `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …`, and the `senderPn` display rule.
   - Confirm `pnpm dev` boots and `/`, `/chats`, `/ai-chat`, `/crm`, `/crm/_schema`, `/crm/_knowledge`, `/ai` all resolve without console errors; `/does-not-exist` renders the existing `NotFoundPage`.
   - **Acceptance**: a grep over `frontend/src/**/*.{ts,tsx}` for `0.65`, `Grup belum dinamai`, and the locked Indonesian sentence returns the existing matches only (no edits to those files); all seven routes above resolve 200; console has zero errors on a fresh `pnpm dev`.

## Cross-References
- Three-pane layout, route map, Pane 1 / Pane 2 / Pane 3 rules: `docs/crm/features/navigation/spec.md` (§1, §2, §3, §4)
- Component reuse contract (the four read-only components): `docs/crm/features/navigation/spec.md` §3
- Locked values preserved: `docs/crm/features/navigation/spec.md` §4; `docs/tech/chat-data-model.md` §2.6, §2.8
- AIReplyMode literal union: `docs/tech/crm-data-model.md` §2, `docs/tech/ai-reply-state-machine.md` §1, `docs/crm/features/ai-autoreply/spec.md` §2
- Route map alignment with the new module overview: `docs/crm/general/MODULE_OVERVIEW.md` §1, §3
- Stack pins: `docs/tech/frontend-stack.md`

## Notes
- Backend (`src/`) is OUT OF SCOPE for this run; nothing in this plan may touch `src/` or any Baileys/pg code. All CRM endpoints are mocked in `frontend/src/mock/interceptor.ts` by Plan 02.
- The four components `ChatSidebar`, `AuthStatusBanner`, `AppShell`, `ChatsPage` are read-only for this run — wrap them in the new shell but do NOT modify their props or internal implementation. Any change to those files must go through the `pm-doc-audit` cycle first.
- Pane 1 collapse state is per-operator (not per-route), persisted to `localStorage` under `ui.pane1Collapsed`.
- The `/ai-chat` route is a permanent alias for `/ai`; both render the same `AiWorkspacePage` once Plan 07 lands.
- Do NOT introduce a right-side context panel, drag-to-reorder, or custom Pane 1 icons — these are out of scope per `docs/crm/features/navigation/spec.md` §6.