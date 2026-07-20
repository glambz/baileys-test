# Plan 08: CRM Polish & Theming (responsive, keyboard, a11y, i18n)

**Goal**: Apply the cross-cutting polish (responsive collapse to single-drawer on `< md`, keyboard shortcuts, a11y attributes, dark/light theme, skeletons, i18n keys) to the new CRM pages (workspace, schema designer, data viewer, knowledge, AI toggle/flag, AI workspace) — without regressing any locked value from the WhatsApp module and without touching `src/`.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 04 (`04-data-viewer.md`) — Data Viewer shipped.
- Plan 05 (`05-knowledge-upload-ui.md`) — Knowledge Upload UI shipped.
- Plan 06 (`06-ai-toggle-flag-ui.md`) — AI toggle/flag UI shipped.
- Plan 07 (`07-ai-team-scope-page.md`) — AI workspace page shipped.

## Micro-Tasks

1. **Add responsive collapse to the three-pane layout for CRM/AI menus on `< md`**
   - In `frontend/src/components/layout/AppShell.tsx`, when the viewport width is `< md` (`768 px`, matched via the existing `useMediaQuery` hook in `frontend/src/hooks/useShortcuts.ts` or a new `useMediaQuery`), Pane 1 (left rail) collapses to a hamburger drawer that opens via a chevron in the top bar. Pane 2 (the chat list) is hidden entirely when the selection is `CRM` or `AI` on `< md` (no point showing a 320 px sidebar on a phone-sized viewport for the CRM workspace).
   - The `Pane1Rail` chevron and the `useUiStore.pane1Collapsed` slot are reused (Plan 01 already wired them); this task only adds the media-query override.
   - **Acceptance**: with the dev-tools viewport set to `375 px`, visiting `/crm` shows the CRM workspace full-width with a hamburger to open the left rail; visiting `/chats` shows the chat list full-width; `pnpm typecheck` passes.

2. **Add keyboard shortcuts for the new pages**
   - Extend `frontend/src/hooks/useShortcuts.ts` with:
     - `Alt+1` / `Alt+2` / `Alt+3` — switch `pane1Selection` to `chats` / `crm` / `ai` and navigate to the matching route (already partially implemented by Plan 01; verify and complete).
     - `c` (when on `/crm`) — focus the search input on the data viewer.
     - `n` (when on `/crm/:entityName`) — open the `+ New record` modal.
     - `u` (when on `/crm/_knowledge`) — open the upload dropzone.
   - Update `frontend/src/components/layout/ShortcutHelpDialog.tsx` (`?` opens it) with the new shortcuts grouped by menu.
   - **Acceptance**: pressing each shortcut performs the action; the help dialog lists every shortcut; shortcuts are suppressed when focus is inside an `<input>`, `<textarea>`, or a contenteditable element; `pnpm typecheck` passes.

3. **Add accessibility attributes and ARIA roles to the new components**
   - `Pane1Rail` items: confirm `role="tablist"` / `role="tab"` / `aria-selected` are present (added by Plan 01 — verify) and add `aria-controls` pointing to the matching `<section id="pane-crm">` / `pane-ai` etc.
   - `CrmWorkspacePage` tabs: render the shadcn `<Tabs>` with `role="tabpanel"` and `aria-labelledby` on each panel.
   - `Data viewer` table: `<table>` with `<caption>`, `<thead>` with `scope="col"`, sortable headers as `<button>` inside `<th>` with `aria-sort` (`"ascending"` / `"descending"` / `"none"`).
   - `HeldDraftBanner` (Plan 06): `role="alert"` + `aria-live="polite"` so screen readers announce the held draft.
   - **Acceptance**: an axe-core scan (`pnpm test:a11y`, added in this plan) returns zero `serious` or `critical` violations on `/crm`, `/crm/_schema`, `/crm/_knowledge`, `/crm/:entityName`, `/ai`; `pnpm typecheck` passes.

4. **Theme + skeleton coverage for the new pages**
   - Verify dark/light theming works on every new page (the shadcn tokens already ship; this task only checks the new pages and adds a `dark:` class to any spot missing one).
   - Replace any remaining raw `…loading…` text on the new pages with the existing `<Skeleton>` (`frontend/src/components/ui/skeleton.tsx`) — at minimum: entity list loading, record table loading, knowledge file list loading, AI workspace history loading.
   - Add a per-page `Skeleton` variant in `frontend/src/components/layout/SkeletonPage.tsx` for the four CRM destinations (`CrmSkeleton`, `CrmSchemaSkeleton`, `CrmDataSkeleton`, `CrmKnowledgeSkeleton`, `AiWorkspaceSkeleton`) so the route-level `<Suspense fallback={<SkeletonPage />}>` (added by Plan 01) has a real skeleton per route.
   - **Acceptance**: every CRM route renders a skeleton on first paint under a throttled network profile; toggling dark/light mode shows no contrast regressions on the new pages (manual + axe-core); `pnpm typecheck` passes.

5. **Extend `i18n` with the new keys (Indonesian primary + English mirror)**
   - In `frontend/src/i18n/id.json` and `frontend/src/i18n/en.json`, add keys for the new surfaces:
     - `crm.workspace.title`, `crm.workspace.empty`, `crm.workspace.errorRetry`
     - `crm.schema.*` (entity list, field editor per type, version history, restore button copy, rollback confirm)
     - `crm.data.*` (column list empty, validation errors per field type, search placeholder)
     - `crm.knowledge.*` (status chip copy: `Menunggu`, `Dipecah`, `Siap`, `Gagal`; upload constraints; delete confirm)
     - `crm.ai.toggle.ai`, `crm.ai.toggle.human`, `crm.ai.banner.held`, `crm.ai.actions.sendAsIs`, `crm.ai.actions.editAndSend`, `crm.ai.actions.discard`
     - `crm.shortcuts.*` (the new shortcut labels)
   - Use the existing `frontend/src/i18n/index.ts` helper; do NOT introduce a second i18n library.
   - **Acceptance**: switching the locale (the existing `useUiStore.locale` slot) translates every new label; the locked Indonesian fallback sentence and `"Grup belum dinamai"` are NOT moved into the i18n bundle — they stay as code constants in `frontend/src/lib/ai/fallbackMessage.ts` and the chat components (per the locked-values contract from `docs/tech/chat-data-model.md` §2.8); `pnpm typecheck` passes.

## Cross-References
- Responsive rules (single-drawer on `< md`): `docs/crm/features/navigation/spec.md` §1 (responsive collapse); `docs/crm/features/navigation/prd.md` (UX requirements)
- Keyboard shortcuts (Alt+1/2/3, `/` to focus): `docs/crm/features/navigation/spec.md` §1.1, §6
- Theming baseline: `docs/tech/frontend-stack.md` (Tailwind 3.x, shadcn tokens)
- i18n baseline: `frontend/src/i18n/index.ts`; `docs/frontend/features/chats/prd.md` §5 (Indonesian primary)
- Locked values preserved (not i18n-ized): `docs/tech/chat-data-model.md` §2.6, §2.8; `docs/frontend/features/chats/spec.md` (contact-display rule, "Grup belum dinamai", locked Indonesian fallback)
- Reused hooks/components: `frontend/src/hooks/useShortcuts.ts`; `frontend/src/components/layout/ShortcutHelpDialog.tsx`; `frontend/src/components/ui/skeleton.tsx`

## Notes
- This plan is **polish only** — no new product surface, no new endpoints, no new components. Bug fixes belong in their respective plans (03–07), not here.
- Do NOT touch `src/`; the entire scope is `frontend/src/`.
- Do NOT consolidate the WhatsApp-module `0.65` and the CRM/RAG `0.7` into a single constant. They are distinct.
- After this plan lands, `pnpm typecheck`, `pnpm build`, `pnpm test` (which now includes the Plan 04 cross-contact leak test, the Plan 04 data-viewer test, the Plan 05 chunking test, and the new a11y scan), and `pnpm test:a11y` must all pass. The Auditor will gate this.
- Locked Indonesian copy (`"Grup belum dinami"`, locked fallback sentence) stays as code constants — they are NOT moved into the i18n bundle.