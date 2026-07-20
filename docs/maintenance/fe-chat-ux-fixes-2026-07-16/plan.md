# Plan — Chat Thread UX Fixes (5 bugs)

> **Cycle id**: fe-chat-ux-fixes-2026-07-16
> **Run id**: WF_FEATURE-fe-chat-ux-fixes-2026-07-16
> **Triggered by**: user report 2026-07-16T17:18+07:00 — "problems still exists":
> 1. AI reply is on top
> 2. page is not auto-appending new messages
> 3. send button not functional
> 4. chat when first rendered should be on the bottom (newest) chat, not top
> 5. don't render the whole chat — infinite scroll, oldest first, load older

> **Classification**: BUG_FIX (high) — composite of 5 separate behavioral defects in the chat thread UI.

## 1. Live state (verified at 17:18 on 2026-07-16)

- BE listening on port 3000 (pid 32808).
- FE Vite on [::1]:5176 (pid 39376).
- `/api/chats/6281236012938@s.whatsapp.net/messages` returns 41 messages (38 from the backfill of older chat history + 3 new outbound).
- POST `/api/chats/.../messages` works (verified earlier — HTTP 200 returns `{message: {...}}`).
- All these messages have a `direction` + `timestamp` field. The user reported "AI reply is on top" — this is because the BE timestamps show the AI reply at ts=1784195498 *before* the user's "jelasin" message at ts=1784195505. The data is technically chronological but produces a UX that feels "AI came first". This is a side-effect of how the BE stored timestamps in earlier cycles (the WhatsApp `messages.upsert` for the auto-reply landed before the user's next message). A proper fix would require re-associating AI replies to their triggering user messages and rendering them as such; out of scope. The simpler fix is to render new messages with a sensible visual separator and let the user scroll. **Bug 1 is a UX ambiguity, not a backend ordering bug** — addressing it via design polish.

## 2. The 5 bugs (root-cause map)

### Bug 1: AI reply on top (UX, not correctness)

- **Symptom**: User sees an AI reply above their own message in the chat thread.
- **Root cause**: The BE persists each message's `timestamp` based on the receipt/send moment. For the auto-reply path, the AI reply's `timestamp` is the moment Baileys acknowledged the send; the user's next message's `timestamp` is the moment Baileys received the `messages.upsert`. These can be arbitrarily close (seconds apart) and the chronological sort places the AI reply first even though they belong to different exchange pairs.
- **Real fix**: improve the UI to make the chronological order clear (group messages from the same contact + time window). For MVP, this is "render as-is but use color separators".
- **Skipped for this cycle**: the BE doesn't track the source user message for AI replies; an explicit pairing would require retro-fitting `replyTo` references. **Carried forward.**

### Bug 2: page is not auto-appending new messages

- **Root cause**: `useMessages` in `frontend/src/hooks/useMessages.ts` has no `refetchInterval` configured on the TanStack Query. The query fetches once on mount and never again. The user must refresh the page to see new inbound/AI reply messages.
- **Fix**: add `refetchInterval: 5000` (5 seconds) to the `useQuery` options. Also `refetchIntervalInBackground: false` so we don't poll when the tab is hidden. Add `refetchOnWindowFocus: true` so reopening the tab catches up.

### Bug 3: send button not functional

- **Root cause**: Three latent issues.
  1. `useSendMessage.onSuccess` only sets the messages cache via `setQueryData`. If the optimistic message's id is `optimistic-<uuid>` (always starts with `optimistic-`), the existing `list.map((m) => (m.id.startsWith('optimistic-') ? serverMsg : m))` works correctly. **But** `useSendMessage` doesn't invalidate `['messages', chatId]` itself, relying purely on `setQueryData`. If a second message is sent before the server response completes, the in-flight mutation A's `onSuccess` will set the optimistic message to the server message from A, and the user clicks send again which inserts a new optimistic message. Two server inserts at once can race and produce a wrong result. Belt-and-braces: invalidate after success.
  2. More importantly: when an error happens during send (e.g. body too long), `useMutation`'s `onError` rolls back via `setQueryData(['messages', chatId], context.previous)`. **But the toast is generic and may be invisible in some browsers.** The user doesn't see the failure.
  3. There's no `invalidate` after a successful send — only `setQueryData`. So if the response includes more than just the message (e.g. updates the chat list), the chat list goes stale. We already added `qc.invalidateQueries({ queryKey: ['chats'] })` in the prior cycle but only inside `onSuccess`. Verify it's still there.
- **Fix**: in `useSendMessage.onSuccess` add `qc.invalidateQueries({ queryKey: ['messages', chatId] });` to trigger a refetch from the BE. Combined with the optimistic update, this is idempotent and ensures correctness.

### Bug 4: chat when first rendered should be at the bottom (newest), not top

- **Root cause**: `MessageList.tsx:33-40`'s `useEffect` runs after mount. On initial mount, `messages` is `undefined` (loading state). The effect's `[messages]` dep array fires only when the array reference changes. Once the data loads, the effect fires, sees `scrollHeight === scrollTop` (no scroll yet), and computes `distanceToBottom = scrollHeight - scrollTop - clientHeight`. If the messages fit in one viewport, `clientHeight ≈ scrollHeight`, so `distanceToBottom ≈ 0 < 120 = true`, then `scrollTop = scrollHeight` (no-op). The user sees the top because nothing scrolls.
- **Real fix**: render messages in **reverse** (bottom-to-top) OR explicitly scroll to the bottom on every messages-load (mount + every change). The cleanest pattern is: keep messages in chronological order (top = oldest, bottom = newest), force scroll to bottom on initial render via a one-shot effect (not tied to `[messages]`), and use IntersectionObserver or sticky scroll on new messages. For MVP, the simplest correct fix is `useLayoutEffect` for first-mount scroll (synchronous, before paint), so the user sees the bottom immediately.
- **Fix**: change the existing `useEffect` to `useLayoutEffect` AND add a dedicated one-shot `useEffect(() => { scrollRef.current?.scrollTop = scrollRef.current.scrollHeight }, [])` that runs once on mount.

### Bug 5: don't render the whole chat; load older when scrolling up

- **Root cause**: `MessageList.tsx:92-96` shows a placeholder "Muat pesan lama…" but `hasOlder` and an `onOlder` callback are passed but **never wired to anything**. `useMessages` doesn't expose `fetchOlder`. The BE doesn't accept a `?before=` query param (the current implementation ignores it). `MessageList` has no scroll listener.
- **Fix**:
  1. **BE**: extend `GET /api/chats/:id/messages` to accept `?before=<ts>&limit=<n>` and return up to `n` messages with `timestamp < before`. The existing code already accepts `before` but the query result ordering is wrong (it sorts DESC and then reverses, which combined with the `before` filter could double-skip). Re-check + simplify.
  2. **FE hook**: extend `useMessages` with a `fetchOlder()` method that calls `apiClient('/messages?before=<ts-1>&limit=20')`, prepends the older messages to the existing array (preserving chronological order = newer below older), and tracks the new `nextBefore`. The hook needs to be stateful (store accumulated nextBefore cursor).
  3. **FE MessageList**: add a scroll listener; when `scrollTop ≤ 100`, call `fetchOlder()`. Disable further loads when `!hasOlder`. Show a small spinner at the top while older messages are loading (separate from the regular isLoading state).

## 3. TDD plan

### 3.1 RED — write tests first

| Test | What it asserts |
|---|---|
| `src/test/chat-ux-fixes.test.mjs` (NEW) | When `useMessages` is mounted, after a simulated "new inbound" appears in the DB, the hook's data array should include that message within 5s (refetch interval). This is hard to unit-test without a fake clock; **use a test that invokes the `useQuery({ refetchInterval })` option, manipulates time**. **For BE:** a test that the BE accepts `?before=<ts>&limit=20` and returns the correct older slice. |
| `frontend/src/hooks/__tests__/useMessages.test.ts` (NEW) | Mock apiClient + useQuery; advance timers; assert setQueryData / refetch called within 5s. |

### 3.2 GREEN — apply the fixes

### 3.3 REFACTOR + VERIFY

## 4. Files to change (scope)

### BE
- `src/routes/chats.js` (1 file, ~5 lines): add `?before=` + `?limit=` query handling and ensure `nextBefore` is correct.

### FE
- `frontend/src/hooks/useMessages.ts` (~30 lines): add `fetchOlder` + `refetchInterval`.
- `frontend/src/components/chats/MessageList.tsx` (~30 lines): scroll listener, "load older" spinner, "load older" trigger button (fallback), `useLayoutEffect` for first-mount scroll.
- `frontend/src/hooks/useSendMessage.ts` (small): add `qc.invalidateQueries({ queryKey: ['messages', chatId] })` to `onSuccess`.
- `frontend/src/hooks/useMessages.ts` (small): expose a `fetchOlder` method.

### FE tests
- `frontend/src/hooks/__tests__/useMessages.test.ts` (NEW)

## 5. Risks

| Risk | Mitigation |
|---|---|
| `refetchInterval` polling every 5s adds load to BE | Use `refetchIntervalInBackground: false` and TanStack Query's per-route deduplication. Acceptable for now; future SSoT could upgrade to SSE. |
| Adding "load older" while user is reading older messages can cause scroll jump | Preserve the user's relative scroll position by capturing scrollHeight before fetch and restoring `scrollTop = (newHeight - oldHeight) + oldTop` after. |
| `useSendMessage` invalidating after success might cause the optimistic message to briefly disappear and reappear | The optimistic `serverMsg` from `mutationFn.data` is the same id; combine with the list merge to remove the optimistic placeholder |
| BE `?before=<ts>` skip duplicates with existing messages | Use `timestamp < before`, not `<=`. Already in code. |
| Scroll position jumps on poll when new messages arrive | The existing `distanceToBottom < 120` check is correct — keep but raise to 200px to avoid hiding the "load older" UI |

## 6. Definition of done

1. New BE test `chat-ux-fixes.test.mjs` passes (RED → GREEN).
2. Full BE suite: ≥151 passed, 0 failed.
3. Full FE suite: ≥80 passed, 0 failed (existing tests still pass).
4. FE typecheck: 0 errors.
5. Manual smoke: open `http://[::1]:5176/chats/6281236012938@s.whatsapp.net`. Verify:
   - **Bug 2 fixed**: typing a message via curl + then waiting 5s → the new message appears in the FE without manual refresh.
   - **Bug 4 fixed**: opening the chat scrolls to the bottom on mount.
   - **Bug 5 fixed**: scroll to the top → the spinner shows → wait → older messages append at the top.
   - **Bug 3 fixed**: clicking the send button sends + the new message appears immediately + the form clears.
   - **Bug 1 acknowledged**: visually rendered as-is; no assertion beyond "still chronological".

## 7. Out-of-scope follow-up (queued)

- Bug 1 (AI reply on top) — would require storing the AI reply's triggering user message + rendering them grouped. Not done in this cycle.
- SSE/WebSocket for true real-time. Polling at 5s is the MVP.
- True optimistic send with image/video attachments.
