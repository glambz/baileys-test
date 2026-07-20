# Plan 14: Settings Shortcut from `/ai` Page

**Goal**: Add a small `Atur AI` link in the `AiWorkspacePage` header that navigates to `/ai-settings` AND switches `pane1Selection` to `'settings'` (so the rail item highlights immediately on arrival). The link respects the "no cross-page link while a settings drawer is open" rule — currently a no-op because `/ai` has no drawer, but the guard is wired defensively for future cycles.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- Plan 11 (`11-ai-settings-page-and-form.md`) — the destination page must exist before the link is meaningful.
- Plan 13 (`13-ai-workspace-integration.md`) — the `/ai` page header is the location of the new link; Plan 13 touches the same component only via the hook wiring and does not modify the header. The two plans merge cleanly when 13 lands first because the header is a separate JSX block.

## Micro-Tasks

1. **Add the `Atur AI` link to the `/ai` page header**
   - In `frontend/src/pages/AiWorkspacePage.tsx`, locate the existing page header (the row that contains the page title `AI Workspace` and the subtitle `Scope: tim internal — semua entity CRM terlihat.`). Add a new compact `<Button variant="ghost" size="sm">` to the right side of the header reading `Atur AI` (byte-identical per PRD UX-C1).
   - Wire the button to `useNavigate()` from `react-router-dom` and `useUiStore.getState().setPane1Selection('settings')` from Plan 10. The handler:
     ```ts
     const navigate = useNavigate();
     const onClick = () => {
       useUiStore.getState().setPane1Selection('settings');
       navigate('/ai-settings');
     };
     ```
   - **Acceptance**: clicking `Atur AI` navigates to `/ai-settings` AND the `AI Settings` rail item is highlighted (because the `setPane1Selection('settings')` call precedes the navigation, and Plan 10's route-sync effect picks it up); `pnpm typecheck` passes.

2. **Wire the "no cross-page link while a drawer is open" guard**
   - The link's disabled state reads `useAiSettingsStore((s) => /* guard flag */)`. For this cycle, the guard is `false` (no drawer exists yet on `/ai`). The handler still calls `setPane1Selection` + `navigate` regardless, but a JSDoc comment on the button makes the future-cycle intent explicit:
     ```ts
     /**
      * Atur AI shortcut. Disabled when a settings drawer is open
      * (future cycles). For now the guard is always false.
      */
     ```
   - **Acceptance**: the button is always enabled this cycle; the JSDoc is in place; `pnpm typecheck` passes.

3. **Header layout — no Pane 1 conflict**
   - The link is rendered inside the content area of `AiWorkspacePage`, not in the rail. Pane 1 (`Pane1Rail`) remains unchanged — Plan 10 already added the `AI Settings` rail item; this plan does NOT add a second route entry or a second rail item.
   - The `/ai-chat` alias (Plan 07) renders the same `AiWorkspacePage`, so the shortcut is reachable from both URLs identically. No special-casing needed.
   - **Acceptance**: `/ai` and `/ai-chat` both render the shortcut; clicking it from either URL navigates to `/ai-settings` and highlights the rail item; `pnpm build` succeeds.

4. **Persistence-flow regression check (T-owned, lives in this plan)**
   - In `__tests__/flows/ai-page-to-settings.test.tsx`:
     - Render `AiWorkspacePage` at `/ai`.
     - Click the `Atur AI` button.
     - Assert `window.location.pathname === '/ai-settings'`.
     - Assert `useUiStore.getState().pane1Selection === 'settings'`.
     - Render `Pane1Rail` and assert the `AI Settings` item has the `bg-accent` highlight class.
   - **Acceptance**: the test passes in jsdom; `pnpm vitest run` reports no regression on Plan-07 tests (the existing `Buka chat contoh` link to `/chats` is unaffected).

## Cross-References
- Destination page: `frontend/src/pages/AiSettingsPage.tsx` (from Plan 11)
- `/ai` page header (extended here): `frontend/src/pages/AiWorkspacePage.tsx` (from Plan 07)
- Rail item + selection state: `frontend/src/components/layout/Pane1Rail.tsx`, `frontend/src/stores/ui.ts` (from Plan 10)
- React Router API: `react-router-dom` v6 (already in `frontend/package.json`)
- PRD UX-C1 (cross-page navigation + selection sync): `docs/crm/features/ai-settings/prd.md` §5.4

## Notes
- This plan is UI-only. It does NOT call `useAskAiTeam`, does NOT touch the mock interceptor, and does NOT modify `systemPrompt.ts`.
- The "no cross-page link while a settings drawer is open" rule is wired defensively (task 2) because Plan 11's settings page does NOT have a drawer, but future cycles may add one. The guard is `false` for this cycle; flipping it later is a one-line change.
- Plan 07 already added a `Buka chat contoh` link in the same header that points to `/chats`. The two links coexist — `Buka chat contoh` is on the right-of-subtitle cluster; `Atur AI` is on the right edge of the header. No layout conflict; no JSX reordering required.
- The button text `Atur AI` is byte-identical to PRD UX-C1. Do NOT translate to `Settings` or `AI Settings`; the page label `AI Settings` lives in the rail (Plan 10) where PRD UX-M1 fixes it.
- No new dependency is added to `frontend/package.json` — `useNavigate` is already exported by `react-router-dom`.