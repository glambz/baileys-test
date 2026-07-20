# Plan 06: Chats Page — Thread Pane

**Goal**: Replace the Chats-page right-pane placeholder with the message thread: header (label + sub-phone + kebab), auto-scrolling message list with `in`/`out` bubble styling, and the composer that submits via `useSendMessage` with optimistic insert → server replacement within ~300–500 ms. Cover the empty/loading/error states from `docs/frontend/features/chats/spec.md` §6.2 and §6.3.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (shadcn scaffold).
- Plan 02 (mock messages, types).
- Plan 03 (ChatsPage route param wiring).
- Plan 04 (`useMessages`, `useSendMessage`, interceptor).
- Plan 05 (`ChatsPage` two-pane layout; `contactLabel()`; sidebar navigation produces the `:chatId` param).

## Micro-Tasks

1. **Build `ThreadHeader`**
   - Create `frontend/src/components/chats/ThreadHeader.tsx` that receives the focused `Chat` and renders: the primary label (via `contactLabel()`), a sub-line of `formatPhone(chat.phone)` shown only when no `Contact.displayName` exists and `chat.jid` is not a status broadcast, and a kebab menu button (`<Button variant="ghost" size="icon"><MoreVertical /></Button>`) that opens a shadcn `DropdownMenu` with placeholder items `"Lihat kontak"` and `"Arsipkan"` (both no-op for Phase 2; keep the menu, fill in actions in a future plan).
   - **Acceptance**: the header shows `"Pak Hendro"` with sub-line `"+62 851-7965-2486"` for Pak Hendro's chat; for the anonymous 1:1 chat the header shows `"+62 812-3456-7890"` with no sub-line; the kebab opens a menu; no JID/LID is rendered anywhere in the header JSX text.

2. **Build `MessageBubble` and `MessageList`**
   - Create `frontend/src/components/chats/MessageBubble.tsx` rendering a single `Message`:
     - `direction === "out"` → right-aligned, primary background (`bg-primary text-primary-foreground`), label `"Anda"`.
     - `direction === "in"` → left-aligned, muted background (`bg-muted`), label `Message.senderName ?? formatPhone(message.key.senderPn)`.
     - Body text via `Message.body`; timestamp via `dayjs(message.timestamp * 1000).format("HH:mm")` at the bubble's bottom-right.
     - When `message.id.startsWith("optimistic-")` → render a tiny shadcn `Loader2` spinner instead of the timestamp and a `data-testid="message-pending"` attribute.
   - Create `frontend/src/components/chats/MessageList.tsx` rendering the array from `useMessages(chatId)`:
     - Auto-scroll to the bottom on first render (and on new messages, gated by a "user is at bottom" check so it does not yank the scroll when reading history).
     - Reverse the order so the newest is at the bottom (or use `flex-col-reverse`).
     - State machine per `docs/frontend/features/chats/spec.md` §6.2: Loading skeleton (5 in/out placeholders, max-width 60%), Empty (`"Belum ada pesan di percakapan ini"`), Error (red card + `"Coba lagi"`), Loading-older (top spinner when `hasOlder === true` and the user scrolled to the top — the mock returns `nextBefore` when more messages exist).
   - **Acceptance**: opening `/chats/<pak-hendro-id>` shows Pak Hendro's ~7 seeded turns newest at the bottom; typing in the composer (step 3) appends a bubble at the bottom.

3. **Build `Composer` with optimistic send**
   - Create `frontend/src/components/chats/Composer.tsx` rendering a sticky-bottom bar with:
     - A `<Textarea>` (auto-resize, single line growing to 6 rows) bound to a `react-hook-form` controller with `useForm` default `{ body: "" }` and `zod` resolver for `{ body: z.string().trim().min(1).max(4096) }`.
     - A `<Button type="submit">` labeled `"Kirim"` (lucide `Send` icon), disabled when `body.trim().length === 0` or `mutation.isPending`.
     - Keyboard: **Enter** submits, **Shift+Enter** inserts a newline.
     - On submit: call `useSendMessage(chatId).mutate({ body })`. The optimistic insert in `useSendMessage` (Plan 04) produces a `"optimistic-<uuid>"` bubble immediately; on success the server-returned id (`mock-msg-<ulid>`) replaces it; on error the bubble is rolled back and a shadcn `Toast` (sonner) appears with `error.message`.
     - After a successful send: clear the textarea and refocus it.
   - **Acceptance**: pressing Enter in the composer of Pak Hendro's chat inserts an optimistic bubble (spinner instead of timestamp) within one frame; within ~400 ms the bubble is replaced by a server message with `id` starting `mock-msg-` and a `"09:42"`-style timestamp; the textarea is cleared and focused; the mock network tab shows zero activity.

4. **Wire the thread pane into `ChatsPage`**
   - Update `frontend/src/pages/ChatsPage.tsx` so that when `useParams().chatId` is present, the right pane renders `<ThreadHeader chat={chat} />`, `<MessageList messages={messages} />`, and `<Composer chatId={chat.id} />`.
   - When `:chatId` is **absent** (URL is `/chats`), the right pane renders the empty-state card `"Pilih percakapan untuk mulai"` with a chevron icon and a hint `"Gunakan sidebar di sebelah kiri."`.
   - When `:chatId` is present but `useMessages` returns `404 ChatNotFound`, show the `"Chat tidak ditemukan"` toast and clear the URL via `navigate("/chats", { replace: true })`.
   - **Acceptance**: navigating from the sidebar (Plan 05) to `/chats/<id>` shows the thread; back-navigating to `/chats` shows the empty-state; an unknown id redirects with the toast.

5. **Polish pass + acceptance run**
   - Verify keyboard: `Tab` reaches the composer; `Shift+Tab` reaches the message list; `Enter` in the composer sends; `Shift+Enter` inserts a newline.
   - Verify dark/light parity: toggle `.dark` on `<html>`; bubble colors remain AA-contrast in both modes.
   - Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`; all must pass.
   - **Acceptance**: end-to-end manual click-through on the seeded data shows the Chats page with sidebar + thread working as described in `docs/frontend/features/chats/spec.md` §1–§6; `pnpm build` exits 0.

## Cross-References
- Spec: `docs/frontend/features/chats/spec.md` §1 (thread bullets 2–4), §2 (`/chats/:chatId` routing), §3 (data flow table — `useMessages`, `useSendMessage`), §5 (send behavior + optimistic insert + replace + rollback), §6.2 (message list states), §6.3 (send-action states), §7 (auth banner — already present from Plan 04).
- PRD: `docs/frontend/features/chats/prd.md` §5 (composer stickiness, keyboard shortcuts), §6 (A2, A3, A5).
- Data shapes: `docs/tech/chat-data-model.md` §2.2 (`Message`, `key.senderPn`), §3 (display rule, applied in bubble label fallback).
- API: `docs/frontend/api/api-spec.md` §2.2 (response shape), §2.3 (request/response), §3 (mock-only fields like `mock-msg-` ids).
- Stack: `docs/tech/frontend-stack.md` §3 (lucide icons, dayjs), §4 (react-hook-form + zod resolver).

## Notes
- Do **not** implement media (image/video/audio/document) rendering — the mock only carries `kind: "text"`. Plan 08's polish pass will leave a `<MessageBubble>` extension point for media.
- The optimistic id prefix (`optimistic-<uuid>`) must match what `useSendMessage` (Plan 04) generates. If Plan 04's prefix ever changes, this plan breaks.
- The `MessageList` auto-scroll behavior must **not** trigger on initial render if there are zero messages (avoid a useless `scrollTop` mutation).
- Plan 06 is the **last** plan that touches the Chats page. Plan 08 is a cross-cutting polish pass only — it must not change thread semantics.