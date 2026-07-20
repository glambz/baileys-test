# Plan 05: Chats Page — List (Sidebar)

**Goal**: Build the left sidebar of the Chats page: sort by `lastMessageAt DESC` with pinned-first ordering, render each row with the contact display label produced by `contactLabel()` (replacing the Plan 02 stub with the real implementation), implement the empty/loading/error states from `docs/frontend/features/chats/spec.md` §6.1, and wire `useNavigate()` so a row click navigates to `/chats/:chatId`.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (Vite + shadcn scaffold).
- Plan 02 (types, mock chats/messages/contacts; the `contactLabel()` stub).
- Plan 03 (`AppShell` + `ChatsPage` route placeholder).
- Plan 04 (`useChats()`, `useAuthStatus()`).

## Micro-Tasks

1. **Implement the real `contactLabel()`**
   - Replace the throwing stub in `frontend/src/lib/contactLabel.ts` with a pure function that follows `docs/tech/chat-data-model.md` §3 and `docs/frontend/general/MODULE_OVERVIEW.md` §7 exactly:
     - If `chat.jid === "status@broadcast"` → return the literal `"Status"`.
     - Else if `chat.jid.endsWith("@g.us")`:
       - if `groupName` (passed in or from `contact?.groupName`) is truthy → return `groupName`;
       - else if `groupMetadata.creatorPn` or any `groupMetadata.participantPns[i]` is extractable → look up the contact for that phone and recurse with `chat` re-typed as 1:1 (rules 1 or 2);
       - else → return the Indonesian placeholder `"Grup belum dinamai"` (byte-identical).
     - Else (1:1): if `contact?.displayName` is truthy → return `contact.displayName`; else return `formatPhone(senderPn)` → `+<CC> <first-3>-<next-4>-<last-4>` (e.g. `"6281234567890"` → `"+62 812-3456-7890"`).
   - The function must **never** read `chat.jid` as a displayable string and must never return a substring of `chat.jid` (no `@s.whatsapp.net`, no `@lid`).
   - **Acceptance**: a small dev probe renders the worked examples table from `docs/frontend/features/chats/spec.md` §4.1 verbatim (Pak Hendro, `+62 812-3456-7890`, Tim Marketing Q3, `Grup belum dinamai`, `Status`).

2. **Build `ChatListItem`**
   - Create `frontend/src/components/chats/ChatListItem.tsx` rendering a 56 px tall row with: avatar (initial letter in a colored circle), primary label from `contactLabel()`, sub-line (`Chat.phone` formatted, when no `Contact.displayName`), `lastMessagePreview` truncated to one line with ellipsis, `lastMessageAt` formatted via dayjs as `"HH:mm"` for today or `"DD/MM"` otherwise, and an unread badge (`Chat.unreadCount`) when `> 0`.
   - The row is a `<NavLink to={`/chats/${chat.id}`}>` (or a button that calls `navigate(`/chats/${chat.id}`)`); active state styled via `aria-current="page"`.
   - **Acceptance**: hovering a row shows a hover background; clicking navigates to `/chats/:chatId`; the unread badge has `aria-label={`${unread} pesan belum dibaca`}`.

3. **Build `ChatSidebar`**
   - Create `frontend/src/components/chats/ChatSidebar.tsx` that:
     - Calls `useChats()` and renders the state machine from `docs/frontend/features/chats/spec.md` §6.1:
       - **Loading** → 6 shadcn `Skeleton` rows.
       - **Empty** → centered illustration + caption `"Belum ada percakapan"`.
       - **Error** → red card with `error.message` and a `"Coba lagi"` button calling `refetch()`.
       - **Refreshing** → keeps the existing list and renders a 2 px shadcn `Progress` bar across the top of the sidebar.
       - **Offline** → yellow banner at top: `"Tidak ada koneksi — menampilkan data terakhir yang di-cache"` (driven by `navigator.onLine`).
     - Sorts the chats: `pinned === true` first, then `unreadCount > 0`, then `lastMessageAt DESC`. Archived chats hidden unless `useUiStore().showArchived === true` (default `false`; add the toggle in a future plan, not here).
   - **Acceptance**: toggling `import.meta.env.VITE_MOCK_ERROR` to `"chats"` in the mock handler makes the sidebar render the red error card with a working `"Coba lagi"` button that re-fetches and recovers.

4. **Wire the sidebar into `ChatsPage`**
   - Replace the `ChatsPage` placeholder body with a two-pane flex container (sidebar 320 px fixed on `md`+; thread panel fills the rest). On `< md` the sidebar collapses to a hamburger drawer (placeholder drawer toggle for now; Plan 06 will integrate with the thread panel).
   - The sidebar is the `<ChatSidebar />`; the right pane is a placeholder that reads `useParams().chatId` and shows either the focused chat's first message snippet (when present) or an empty state `"Pilih percakapan untuk mulai"`.
   - **Acceptance**: visiting `/chats` with seeded data shows 5–6 rows in the sidebar sorted correctly (Pak Hendro pinned first if marked `pinned: true`); clicking Pak Hendro navigates to `/chats/<pak-hendro-id>`; the URL is the source of truth (no in-memory-only selection state).

5. **Lint + manual review against the contact display rule**
   - Run `pnpm lint` and `pnpm typecheck`; both must pass with `--max-warnings 0`.
   - Open the dev page, screenshot the sidebar, and manually verify that **no row contains** a `@s.whatsapp.net`, `@g.us`, `@lid`, or `~` fragment — the rendered text is one of `{group name, contact name, formatted phone, "Grup belum dinamai", "Status"}` only.
   - **Acceptance**: a `pnpm exec ripgrep` over `frontend/src/components/chats/ChatSidebar.tsx` and `ChatListItem.tsx` for `chat.jid`, `remoteJid`, `@lid`, `senderPn` matches only in comments or in code paths that pass the value to `contactLabel()` (never in JSX text).

## Cross-References
- Spec: `docs/frontend/features/chats/spec.md` §1 (sidebar bullet 1), §2 (routing), §3 (data flow table), §4 (contact display rule, worked-examples table), §6.1 (state machine), §7 (auth banner; banner is owned by Plan 04, this plan just confirms the sidebar does not occlude it).
- PRD: `docs/frontend/features/chats/prd.md` §3 (user-facing copy table), §4 (US-1, US-2, US-4, US-6, US-7), §5 (two-pane layout, sidebar order).
- Data shapes: `docs/tech/chat-data-model.md` §2.1 (`Chat`), §2.3 (`Contact`), §2.2 (`Message.key.senderPn`), §3 (`contactLabel()` signature).
- Module overview: `docs/frontend/general/MODULE_OVERVIEW.md` §5 (mock-vs-real — sidebar reads from `useChats()`, never directly from `frontend/src/mock/*`).
- Stack: `docs/tech/frontend-stack.md` §3 (lucide-react icons, dayjs timestamps), §2 (Zustand for `showArchived` toggle, even if the toggle is added later).

## Notes
- The sidebar must **not** import anything from `frontend/src/mock/*` directly; it consumes only `useChats()` (which is the abstraction Plan 04 created). This keeps the future swap to a real backend a one-file change.
- `formatPhone` lives in `frontend/src/lib/phoneFormat.ts` (export it from there so Plan 06 can reuse it).
- The unread badge background color follows shadcn's `destructive` token when `unreadCount > 0`; do not hardcode red.
- Plan 05 ships the **list** half of the Chats page only; the thread panel is Plan 06.