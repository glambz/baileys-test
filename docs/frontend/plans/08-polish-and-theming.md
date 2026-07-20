# Plan 08: Polish and Theming

**Goal**: Final cross-cutting polish pass: dark/light theming parity, skeleton coverage for every list-bearing view, keyboard shortcuts across both pages, responsive sidebar drawer on `< md` screens, i18n JSON files (Indonesian primary + English placeholder), accessibility audit, and a green `pnpm build` + Lighthouse a11y ≥ 90.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (Tailwind + shadcn base — needed for the theme tokens).
- Plan 02 (types + mock data referenced by skeletons and copy).
- Plan 03 (AppShell layout owns the dark-mode toggle).
- Plan 04 (banner; required to verify banner contrast in both themes).
- Plan 05 (`ChatSidebar`, `contactLabel()` — drawer lives next to it).
- Plan 06 (`Composer`, `MessageList` — keyboard shortcuts hook into these).
- Plan 07 (`AiComposer`, `Transcript` — i18n keys; keyboard; dark/light parity).

## Micro-Tasks

1. **Dark/light theming + theme toggle**
   - Add a shadcn `DropdownMenu` in the `AppShell` top bar with two items: `"Terang"` and `"Gelap"`. Persist the selection via Zustand `useUiStore.theme` (`"light" | "dark" | "system"`) backed by `localStorage` and applied by toggling the `dark` class on `<html>`. Default `"system"` — read `prefers-color-scheme` on first mount.
   - Audit every component added in Plans 03–07 against both modes; shadcn components use CSS variables and inherit the theme automatically. Manually verify the `ConfidenceBadge` palette (`emerald-100/900`, `amber-100/900`, `rose-100/900`) is readable on both backgrounds.
   - **Acceptance**: switching the theme updates the entire UI within one frame; the auth-status banner, sidebar, message bubbles, AI badges, and confidence tooltips all remain AA-contrast; the selection survives a hard refresh.

2. **Skeleton coverage for every list-bearing view**
   - Verify that the `ChatSidebar` (Plan 05), `MessageList` (Plan 06), and `Transcript` (Plan 07) each render a shadcn `<Skeleton />` placeholder set during `isLoading`. Add a `MessageList` skeleton (5 in/out placeholders, `max-width: 60%`) and a `Transcript` welcome-card skeleton if any are missing.
   - Add a global `<SkeletonPage />` placeholder (used by the lazy-route fallback in Plan 03) that renders a centered shadcn card skeleton.
   - **Acceptance**: with the mock interceptor's `VITE_MOCK_DELAY` set to `1000`, the first paint of `/chats` shows 6 sidebar skeletons; the first paint of `/chats/<id>` shows 5 message-bubble skeletons; the first paint of `/ai-chat` (when `isLoading === true` for some future reason) shows the welcome-card skeleton; no layout shift after the data arrives.

3. **Keyboard shortcuts across both pages**
   - Add a single `useShortcuts()` hook in `frontend/src/hooks/useShortcuts.ts` that listens to `keydown` on `document` and dispatches:
     - `/` → focus the sidebar search box (Chats page) or the AI composer (AI Chat page).
     - `↑` / `↓` when focus is in the sidebar → move the focused chat selection; `Enter` opens the focused chat.
     - `Esc` → clear the composer (`Chats` and `AI Chat`); on `/ai-chat` it also collapses any open evidence panel.
     - `g` then `c` → navigate to `/chats`; `g` then `a` → navigate to `/ai-chat`. (Mnemonic: "go chats", "go ai".)
   - All shortcuts are no-ops when the user is typing into an `<input>` or `<textarea>` (except `Esc`).
   - Add a small `<kbd>`-styled help dialog (shadcn `<Dialog>`) opened by `?` that lists every shortcut with a one-line description.
   - **Acceptance**: pressing `/` on `/chats` focuses the sidebar search; pressing `?` opens the shortcut help dialog; pressing `g` then `c` from `/ai-chat` navigates to `/chats`; shortcuts never fire while typing in the composer.

4. **Responsive sidebar drawer on `< md`**
   - Convert the `ChatSidebar` to a `Sheet` (shadcn) on screens `< md`: a hamburger button in the `AppShell` top bar opens the sidebar as a left-edge drawer; on `md` and above the sidebar renders inline as in Plan 05.
   - On small screens, opening a chat auto-closes the drawer.
   - **Acceptance**: at viewport width `375 px` the sidebar is hidden behind the hamburger; tapping it slides in; tapping a chat navigates and closes the drawer; resizing to `1024 px` shows the sidebar inline.

5. **i18n JSON files (Indonesian primary + English placeholder)**
   - Create `frontend/src/i18n/id.json` containing every Indonesian copy token used in Plans 03–07 (page titles, button labels, tooltips, fallback sentence key, badge labels, state captions). The fallback sentence under key `ai.fallback.message` must be **byte-identical** to the SSoT (`docs/frontend/features/ai-chat/spec.md` §8).
   - Create `frontend/src/i18n/en.json` with English equivalents — checked in but **not** wired to a locale switcher in this phase. The English fallback sentence under `ai.fallback.message` matches `docs/frontend/features/ai-chat/spec.md` §8.1.
   - Create `frontend/src/i18n/index.ts` exporting `t(key: string): string` that resolves from `id.json` by default. Refactor existing hardcoded strings (button labels, captions) to call `t(...)`.
   - **Acceptance**: `pnpm exec ripgrep "Maaf, saya tidak memiliki informasi"` matches `frontend/src/i18n/id.json` exactly once and **does not match** any other source file; `pnpm exec ripgrep "Sorry, I don't have confident enough"` matches `frontend/src/i18n/en.json` exactly once.

6. **Accessibility audit + Lighthouse a11y ≥ 90**
   - Add `aria-label` to every icon-only button (`MoreVertical`, hamburger, theme toggle, send). Add `role="status"` to the optimistic-bubble spinner; add `aria-live="polite"` to the composer-error region.
   - Verify focus order on both pages: skip-link (`<a href="#main" className="sr-only focus:not-sr-only">Skip to main content</a>` at the top of `<body>`), Tab order is logical, every interactive element has a visible focus ring (Tailwind `focus-visible:ring-2 ring-ring`).
   - Run `pnpm build && pnpm preview`, then audit with the Chrome DevTools Lighthouse panel on `/chats` and `/ai-chat`.
   - **Acceptance**: Lighthouse a11y score is `>= 90` on both pages; the audit report contains zero "Buttons do not have an accessible name" and zero "Form elements do not have associated labels" findings.

7. **Final build + lint + typecheck + dev preview run**
   - Run `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm build`. All must exit 0.
   - Boot `pnpm preview` and click through every page in dark and light modes; screenshot the sidebar (5–6 chats), Pak Hendro's thread (with one optimistic → replaced bubble), and the AI Chat answered + fallback paths.
   - **Acceptance**: `pnpm build` exits 0; the preview build serves the production bundle; both pages render correctly with the production bundle; the optimistic-bubble round-trip is visible end-to-end in the preview.

## Cross-References
- Spec: `docs/frontend/features/chats/spec.md` §6 (all state machines), §7 (auth banner contrast); `docs/frontend/features/ai-chat/spec.md` §6 (badge colors), §7 (no-hallucination guard is already in Plan 04 — Plan 08 does not weaken it), §8.1 (English fallback), §10 (state machine).
- PRD: `docs/frontend/features/chats/prd.md` §5 (UX, keyboard, dark-mode parity), §7 (out of scope); `docs/frontend/features/ai-chat/prd.md` §7 (UX, keyboard).
- Module overview: `docs/frontend/general/MODULE_OVERVIEW.md` §3 (locked stack — no new deps), §5 (mock-vs-real — Plan 08 introduces no real network calls).
- Stack: `docs/tech/frontend-stack.md` §3 (Tailwind + shadcn theming), §7 (Node/pnpm pins).
- i18n hooks (id.json from day one): `docs/frontend/features/chats/prd.md` §5 (i18n hooks), `docs/frontend/features/ai-chat/prd.md` §7 (i18n).

## Notes
- Plan 08 must **not** introduce new runtime dependencies — every tool used here (Tailwind, shadcn, lucide, dayjs) is already in the locked stack (`docs/tech/frontend-stack.md` §3).
- Plan 08 must **not** change the semantics of any prior plan: it is purely theming, skeletons, keyboard, responsive layout, i18n extraction, and a11y polish. If a refactor is needed, route it back through the Planner instead.
- The English i18n file ships but is not selectable; this prevents drift on the byte-identical fallback sentence across locales (per `docs/frontend/features/ai-chat/prd.md` §9 — locale drift mitigation).
- Skeletons must use shadcn's `<Skeleton />` so they automatically inherit the theme tokens; do not introduce raw `animate-pulse` divs.
- The hamburger button is the **only** new icon-only button introduced by Plan 08; everything else was either labeled in its owning plan or is labeled here.