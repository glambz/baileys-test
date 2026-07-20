# Plan 10: Navigation Rail + Route — Add `AI Settings`

**Goal**: Teach the existing `Pane1Selection` literal union, `Pane1Rail`, `AppShell`, and `router.tsx` about a new fourth menu item (`AI Settings`) that lives at route `/ai-settings`. The route is single-column (Pane 2 hidden), exactly like `/crm`.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- Plan 09 (`09-ai-settings-types-and-store.md`) — the rail item does not import the store, but Plan 09 must be merged first so Plan 11's form can mount under the new route without merge conflicts on the `useUiStore` slice.

## Micro-Tasks

1. **Extend `Pane1Selection` and `useUiStore`**
   - In `frontend/src/stores/ui.ts`:
     - Change `export type Pane1Selection = 'chats' | 'crm' | 'ai';` to `export type Pane1Selection = 'chats' | 'crm' | 'ai' | 'settings';`.
     - Default `pane1Selection` stays `'chats'`. The `localStorage` re-hydration in `ui.ts` accepts the new variant without changes.
     - Update the `isFullWidthPage` derivation in `AppShell.tsx` so it becomes `pane1Selection === 'crm' || pane1Selection === 'settings'` (the settings page hides Pane 2 just like `/crm`).
   - **Acceptance**: `pnpm typecheck` passes; every existing use site of `Pane1Selection` still compiles; the Settings rail item (task 2) renders highlighted when the store value is `'settings'`.

2. **Add the `AI Settings` rail item**
   - In `frontend/src/components/layout/Pane1Rail.tsx`, append a fourth rail entry with:
     - `id: 'settings'`
     - `icon: <SlidersHorizontal />` from `lucide-react` (already used elsewhere; verify import is in place).
     - `label: 'AI Settings'` (collapsed-mode tooltip text is the same string, byte-identical per `docs/crm/features/ai-settings/prd.md` UX-M3).
   - The existing `bg-accent` + 2 px primary bar treatment applies unchanged.
   - **Acceptance**: clicking the new item sets `useUiStore.pane1Selection` to `'settings'` (the rail highlights, no route change happens *yet* because Pane 1 is a UI-only state; the route sync is wired in task 3).

3. **Teach `AppShell`'s route-sync effect and the `showPane2` gate**
   - In `frontend/src/components/layout/AppShell.tsx`, the existing `useEffect` that derives `pane1Selection` from `location.pathname` MUST grow a fourth branch: `else if (path.startsWith('/ai-settings')) next = 'settings';`. The branch is placed after the existing `/ai` and `/crm` arms, before the default.
   - The same effect MUST also call `useUiStore.getState().setPane1Selection(next)` when the user navigates to `/ai-settings`, so the rail item stays in sync if the user lands on the URL directly (deep link).
   - The `showPane2` gate (currently `pane1Selection === 'chats' || pane1Selection === 'ai' || pane1Selection === 'crm'`) is updated to also include `'settings'` OR — preferred — `showPane2` is set to `false` whenever `isFullWidthPage` is true. Pick one of the two patterns; document the choice in the file's top-of-file comment.
   - **Acceptance**: navigating to `/ai-settings` directly via the URL bar highlights the `AI Settings` rail item and hides Pane 2; navigating away (e.g. to `/crm`) clears the highlight and re-shows Pane 2 if appropriate; `pnpm typecheck` passes; existing `/chats`, `/crm`, `/ai` behavior is unchanged.

4. **Register the `/ai-settings` route**
   - In `frontend/src/router.tsx`, add a lazy `lazyRoute` for `frontend/src/pages/AiSettingsPage.tsx` (the page itself is built by Plan 11). The route is registered at `/ai-settings`. The page is rendered inside `AppShell` (not as a top-level layout) — same wrapping as `/crm` and `/ai`.
   - **Acceptance**: visiting `/ai-settings` after Plan 11 lands renders the page; before Plan 11 lands, React Router's lazy fallback shows the existing app-level spinner (no crash); `pnpm build` succeeds.

5. **Shortcut binding parity**
   - In `frontend/src/hooks/useShortcuts.ts`, the existing comment lists `Alt+1/2/3` for chats/crm/ai. Add the binding `Alt+4` -> `setPane1Selection('settings')` (no nav, because Pane 1 is UI-only). Update the JSDoc to read "Alt+1/2/3/4 — switch pane1Selection to chats/crm/ai/settings".
   - **Acceptance**: pressing `Alt+4` highlights the new rail item; the keyboard hint surfaces in the collapsed-mode tooltip; `pnpm typecheck` passes.

## Cross-References
- Pane1Selection literal union + the showPane2 gate: `frontend/src/stores/ui.ts`, `frontend/src/components/layout/AppShell.tsx`
- PRD UX-M1 / UX-M2 / UX-M3 (rail item + label): `docs/crm/features/ai-settings/prd.md` §5.1
- PRD UX-C2 (single-column workspace): `docs/crm/features/ai-settings/prd.md` §5.4
- Settings spec §3 (rail placement): `docs/crm/features/ai-settings/spec.md` §3
- Route map: `docs/crm/general/MODULE_OVERVIEW.md` §3
- Existing rail (read-only pattern): `frontend/src/components/layout/Pane1Rail.tsx`

## Notes
- The `Pane1Selection` literal change is the only edit in `useUiStore.ts`. The AI Settings domain lives in its own store from Plan 09.
- Pane 2 is hidden on `/ai-settings` exactly like `/crm`. The settings page renders inside the AppShell's content area, full-width.
- This plan does NOT add the page component. `AiSettingsPage.tsx` is created in Plan 11; until that plan lands, the lazy route shows the spinner fallback. This ordering lets Plan 10 land and merge first.
- The `SlidersHorizontal` icon is reused from `lucide-react`; do not introduce a new icon library.
- Plan 11 must NOT add a second route entry — it only fills in the page component that Plan 10 already wires.