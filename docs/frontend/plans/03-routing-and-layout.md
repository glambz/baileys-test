# Plan 03: Routing and Layout

**Goal**: Add React Router 6 with the route map from `docs/frontend/general/MODULE_OVERVIEW.md` §4, wrap the app in an `AppShell` layout that hosts the auth-status banner and a side nav, and verify both `/chats` and `/ai-chat` render placeholder pages with zero network calls.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (Vite + Router + shadcn scaffold; Tailwind base).
- Plan 02 (types exist so the placeholder pages can type-check; **not** required for compilation but recommended so future edits do not re-litigate the Chat/Message shapes).

## Micro-Tasks

1. **Create the router with the route map**
   - Create `frontend/src/router.tsx` that exports a `createBrowserRouter([...])` instance with these routes (per `docs/frontend/general/MODULE_OVERVIEW.md` §4):
     - `/` → `<Navigate to="/chats" replace />`
     - `/chats` → `<ChatsPage />` (Plan 05/06 will replace this with the real two-pane layout; for now a `<PlaceholderPage title="Chats" />`)
     - `/chats/:chatId` → same `ChatsPage` component (the page reads `useParams().chatId`)
     - `/ai-chat` → `<AiChatPage />` (Plan 07 replaces the placeholder)
     - `*` → `<NotFoundPage />`
   - Wrap the routes that should reuse a layout with `<AppShell><Outlet /></AppShell>` as their `element`.
   - **Acceptance**: `pnpm typecheck` passes; navigating to `/` redirects to `/chats`; navigating to `/does-not-exist` renders the NotFound card; no console errors.

2. **Build the `AppShell` layout**
   - Create `frontend/src/components/layout/AppShell.tsx` (TSX) that renders a flex column: a sticky top bar (56 px) containing the app title (`"WhatsApp Frontend"`), a tab strip (`Chats` / `AI Chat`) built from `NavLink`s with `aria-current="page"` styling, and an `<AuthStatusBanner />` slot on the right (filled by Plan 04).
   - Below the bar, a `<main>` that renders `<Outlet />` plus the page-level container with `max-w-screen-xl mx-auto` and the dark/light background classes.
   - **Acceptance**: clicking the `Chats` tab changes the URL to `/chats`; clicking `AI Chat` changes it to `/ai-chat`; the active tab has a visible underline or pill background; keyboard tabbing reaches both links.

3. **Bootstrap the React Query client and Zustand stores**
   - Create `frontend/src/main.tsx` that wraps `<RouterProvider router={router} />` in `<QueryClientProvider client={queryClient}><AppShellBoundary>{children}</AppShellBoundary></QueryClientProvider>`.
   - Create `frontend/src/lib/queryClient.ts` exporting a `QueryClient` configured with `defaultOptions.queries.staleTime = 30_000`, `retry = 1`.
   - Create `frontend/src/stores/ui.ts` (Zustand) exporting `useUiStore` with `{ lastOpenedChatId: string | null; setLastOpenedChatId(id): void; authBannerDismissed: boolean; dismissAuthBanner(): void }`.
   - **Acceptance**: `pnpm typecheck` passes; opening the React Query Devtools (or `window.__queryClient`) shows the client present; `useUiStore.getState().lastOpenedChatId` is initially `null`.

4. **Add placeholder pages for `/chats` and `/ai-chat`**
   - Create `frontend/src/pages/ChatsPage.tsx` exporting a placeholder that renders a shadcn `<Card>` with the title `"Chats"` and a body line `"Sidebar and thread panel land here in Plan 05/06."`. The component must read `useParams()` and log the param (so Plan 06 can verify the `:chatId` segment is wired).
   - Create `frontend/src/pages/AiChatPage.tsx` with the title `"AI Chat"` and the body line `"Transcript and composer land here in Plan 07."`.
   - Create `frontend/src/pages/NotFoundPage.tsx` rendering a shadcn `<Card>` with `"Page not found"` and a `<Button>` linking back to `/chats`.
   - **Acceptance**: visiting `/chats` shows the Chats placeholder; visiting `/chats/abc-123` shows the same Chats placeholder with `chatId === "abc-123"` in the browser console; visiting `/ai-chat` shows the AI Chat placeholder; visiting `/xyz` shows the NotFound page.

5. **Wire the entry HTML and remove Vite starter**
   - Update `frontend/src/main.tsx` so it no longer renders the original `App.tsx`. Delete `frontend/src/App.css` and the original `frontend/src/App.tsx` if still present.
   - Update `frontend/index.html` to set `<title>WhatsApp Frontend</title>` and `<html lang="id">` (Indonesian primary locale per `docs/frontend/features/chats/prd.md` §5).
   - **Acceptance**: `pnpm dev` boots; the browser title is `"WhatsApp Frontend"`; `pnpm build` succeeds and `pnpm preview` serves the production bundle with the same route map.

## Cross-References
- Route map: `docs/frontend/general/MODULE_OVERVIEW.md` §4 (path → page table).
- Page responsibilities (placeholders): `docs/frontend/features/chats/spec.md` §2 (`/chats` routing), `docs/frontend/features/ai-chat/spec.md` §2 (`/ai-chat`).
- Stack: `docs/tech/frontend-stack.md` §2 (React Router 6 data router, TanStack Query 5, Zustand 4).
- Mock-vs-real boundary: `docs/frontend/general/MODULE_OVERVIEW.md` §5 (placeholder pages do not yet touch the mock layer — Plan 04 introduces the API hooks).

## Notes
- The `AppShell` is **not** the Chats sidebar — it is the application chrome (top bar + nav). The Chats sidebar inside `/chats` is owned by Plan 05.
- Do **not** render any chat data, mock data, or AI bubble here. Plan 03 is the chrome and routing skeleton only.
- Lazy-load the page components with `React.lazy(() => import("@/pages/ChatsPage"))` so the bundle splits along the route boundary; wrap each in a `<Suspense fallback={<SkeletonPage />}>`.
- Do **not** add a backend proxy, fetch interceptor, or base URL configuration here — Plan 04 introduces the API client and base URL.