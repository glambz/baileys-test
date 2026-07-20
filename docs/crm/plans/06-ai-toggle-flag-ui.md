# Plan 06: AI Toggle / Flag UI (WhatsApp Thread Header)

**Goal**: Add the AI/Human toggle pill and the `human_pending_flag` banner to the WhatsApp thread header so operators can take over a chat, hand it back to the AI, or triage a held draft — implementing the state-machine UI surface in `docs/crm/features/ai-autoreply/spec.md` §6 and `docs/tech/ai-reply-state-machine.md`, without touching `src/` (backend) and without breaking the existing WhatsApp module's locked values.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — the chat list is reused via the new three-pane shell; nothing else from Plan 02 is required for this plan's UI.
- Plan 02 (`02-crm-workspace-and-mock-layer.md`) — the `POST /api/crm/ai/toggle-mode` mock endpoint, the `useToggleAiMode()` hook, and the `AIReplyMode` literal-union type are prerequisites.

## Micro-Tasks

1. **Add the secondary-sidebar "human needed" badge on the chat list row**
   - Create `frontend/src/components/chats/AiModeBadge.tsx` (TSX) that renders a small red chip reading `Butuh manusia` when `chat.aiMode === 'human_pending_flag'`. The chip is hidden for the other two states.
   - Wire it into the existing `ChatListItem` (`frontend/src/components/chats/ChatListItem.tsx`) so the chip appears to the right of the contact label. Do NOT modify `ChatListItem`'s public API; the addition is local to that file and reads `chat.aiMode` from the existing chat shape (extended in task 5 below).
   - **Acceptance**: with a seeded chat whose `aiMode === 'human_pending_flag'` (the mock seeds at least one), the chat list row shows the red chip; for `ai` and `human` no chip is rendered; the locked `contactLabel()` formatter and the `senderPn` display rule are untouched (`grep -R "contactLabel" frontend/src/components/chats/ChatListItem.tsx` returns the same call site as before); `pnpm typecheck` passes.

2. **Build the AI/Human toggle pill in the thread header**
   - Create `frontend/src/components/chats/AiModeToggle.tsx` (TSX) using a shadcn `<ToggleGroup>` with two options (`AI` / `Human`). The active option reflects `chat.aiMode` (mapped: `'ai'` → `AI`, `'human'` → `Human`, `'human_pending_flag'` → pinned to `Human` + red dot indicator).
   - On change, call `useToggleAiMode({ chatId, mode })`. The hook returns a typed `ApiError` on failure; surface a toast `Gagal mengubah mode` and revert the optimistic toggle.
   - Hide the toggle while `aiMode === 'human_pending_flag'` is the only state where the held-draft banner (task 3) is the surface — the spec §6.2 hides the kebab menu in that case.
   - **Acceptance**: clicking `Human` from `ai` calls the mock endpoint and the chat's `aiMode` becomes `human`; clicking `AI` from `human` calls the mock endpoint and reverts to `ai`; the toggle is `disabled` while the request is in flight (no double-click); `pnpm typecheck` passes.

3. **Build the held-draft banner (`human_pending_flag`)**
   - Create `frontend/src/components/chats/HeldDraftBanner.tsx` (TSX) rendered at the top of the thread panel when `chat.aiMode === 'human_pending_flag'`. The banner copy is the verbatim Indonesian sentence from `docs/crm/features/ai-autoreply/spec.md` §6.1: `AI menyusun draf jawaban, tetapi tingkat keyakinannya rendah (confidence: X.XX). Tinjau dulu sebelum mengirim.` where `X.XX` is the held draft's `confidence` (formatted to two decimals).
   - Three actions:
     - `Kirim apa adanya` → `useSendHeldDraft({ chatId, action: 'send-as-is' })` (mock transitions `human_pending_flag → ai` and posts the held draft as an `out` message).
     - `Edit & kirim` → `useSendHeldDraft({ chatId, action: 'edit-and-send' })` (transitions `human_pending_flag → human`; the existing `Composer` is pre-filled with the held draft text).
     - `Buang draf` → `useSendHeldDraft({ chatId, action: 'discard' })` (transitions `human_pending_flag → ai`; no message is sent).
   - **Acceptance**: with a seeded chat in `human_pending_flag`, the banner is visible with the confidence value formatted to two decimals; each action transitions the chat's `aiMode` per `docs/crm/features/ai-autoreply/spec.md` §6.1's table; `Edit & kirim` pre-fills the composer; `pnpm typecheck` passes.

4. **Render a "Test reply" surface in the kebab menu (reply-preview)**
   - In the existing thread header kebab menu (`frontend/src/components/chats/ThreadHeader.tsx`), add a menu item `Test reply` that opens a `<Dialog>` showing `useReplyPreview({ chatId, message: '<free text>' })`'s response: `{ answer, confidence, evidence, would_send, reason }` — per `docs/frontend/api/api-spec.md` §6.
   - Render each evidence item with its `contactId` (per `docs/crm/features/ai-autoreply/spec.md` §5.1) so the operator can audit the scope at a glance. When `would_send === false`, render a yellow warning chip with `reason` (e.g., `confidence < 0.7`).
   - **Acceptance**: with the Plan 02-seeded contacts `C-A` and `C-B` and the cross-contact seed records, the preview for a chat with `C-A` whose question matches `R-B`'s chunks returns `evidence[*].contactId === C-A` and the `answer` body contains no `R-B` values; `pnpm typecheck` passes.

5. **Extend the `Chat` type with `aiMode` and seed the mock store**
   - In `frontend/src/types/chat.ts`, add `aiMode: AIReplyMode` (imported from `frontend/src/types/crm.ts`) to the `Chat` interface. The literal union is `'ai' | 'human' | 'human_pending_flag'` — byte-identical to `docs/tech/crm-data-model.md` §2 / `docs/tech/ai-reply-state-machine.md` §1 / `docs/crm/features/ai-autoreply/spec.md` §2. Do NOT redefine it locally.
   - Update the mock chat seed in `frontend/src/mock/chats.ts` to include one chat per state (`ai`, `human`, `human_pending_flag`) so the UI is demonstrable.
   - **Acceptance**: `grep -R "AIReplyMode" frontend/src/types/` returns exactly one definition (in `crm.ts`); every chat in the seed has an `aiMode` field; `pnpm typecheck` passes.

6. **Wire the toggle/banner/badge into the thread header without changing its public API**
   - In `frontend/src/components/chats/ThreadHeader.tsx`, mount `<AiModeToggle />` to the right of the contact label and `<HeldDraftBanner />` at the top of the thread panel (the banner lives in `ThreadHeader`'s slot — it is part of the thread surface, not a separate layout).
   - Do NOT change `ThreadHeader`'s exported props or its sibling components; the changes are internal. The kebab-menu item from task 4 is added inside the existing `<DropdownMenu>`.
   - **Acceptance**: opening a chat in `ai` shows the `AI` pill active; opening a chat in `human_pending_flag` shows the banner + the red dot on the toggle (which is pinned to `Human`); opening a chat in `human` shows the `Human` pill active; `pnpm typecheck` passes.

## Cross-References
- State machine (transitions and actors): `docs/tech/ai-reply-state-machine.md` §2 (byte-identical to `docs/crm/features/ai-autoreply/spec.md` §3)
- UI surfaces (banner copy, kebab menu, toggle pill): `docs/crm/features/ai-autoreply/spec.md` §6, §6.1, §6.2
- Hard contact filter + evidence trail: `docs/crm/features/ai-autoreply/spec.md` §5, §5.1
- AIReplyMode literal union: `docs/tech/crm-data-model.md` §2; `docs/tech/ai-reply-state-machine.md` §1; `docs/crm/features/ai-autoreply/spec.md` §2
- CRM/RAG threshold (`0.7`): `docs/tech/crm-data-model.md` §3; legacy WhatsApp-module threshold (`0.65`) is preserved byte-identical
- Locked values preserved: `docs/tech/chat-data-model.md` §2.6, §2.8; `docs/frontend/features/chats/spec.md` (contact-display rule, "Grup belum dinamai", Indonesian fallback)
- Mock endpoints consumed: `docs/frontend/api/api-spec.md` §6 (`/api/crm/ai/toggle-mode`, `/api/crm/ai/reply-preview`)

## Notes
- `human_pending_flag` is **system-set only** — the toggle pill MUST NOT let the operator set it directly. `useToggleAiMode({ mode: 'human_pending_flag' })` returns `400` from the mock (per `docs/tech/ai-reply-state-machine.md` and Plan 02 task 3).
- The held-draft banner is the **only** surface that resolves `human_pending_flag`; the kebab menu items "Take over" / "Hand back to AI" are hidden in that state per `docs/crm/features/ai-autoreply/spec.md` §6.2.
- `Edit & kirim` pre-fills the existing `Composer` (no new composer) — keep the WhatsApp module's composer as the single composer.
- The locked WhatsApp-module threshold `0.65` and the locked Indonesian fallback sentence are preserved byte-identical; this plan does not introduce a second fallback and does not change `0.65`.
- Do NOT touch `src/`; this is a UI-only plan against the mock layer.