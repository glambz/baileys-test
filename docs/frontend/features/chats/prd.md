# PRD — Chats

> Product Requirements Document for the Chats page (`/chats`). Pairs with
> the technical feature spec in [`spec.md`](spec.md) and the API contract
> in [`../../api/api-spec.md`](../../api/api-spec.md). Mock-first — see
> [`../../../docs/frontend/general/MODULE_OVERVIEW.md`](../../../docs/frontend/general/MODULE_OVERVIEW.md) §5 for the mock-vs-real boundary.

## 1. Problem

The operator currently reads every WhatsApp conversation by opening
`inbox_logs/*.md` in a text editor and sending replies via curl. This is
fine for debugging, but it is far too slow to use as a daily inbox tool:
there is no contact grouping, no unread indicators, no in-place reply, and
no UI that hides WhatsApp's internal JID/LID routing identifiers from the
operator.

## 2. Goals

| # | Goal | Acceptance |
|---|---|---|
| G1 | The operator can see all chats in one screen. | Sidebar renders every entry from `GET /api/chats`. |
| G2 | Each chat is labeled with the contact name if known, or the phone number if not. | Implemented per the contact display rule (§3). |
| G3 | The operator can read a chat in-app and reply without leaving the page. | Composer at the bottom of the thread panel; Enter sends. |
| G4 | The operator can recognize groups and status posts at a glance, and never sees a JID or LID on the page. | The display label follows §3; no JID suffix, no `@lid` fragment, no `~` prefix is ever rendered. |
| G5 | Empty, loading, and failure states are predictable. | State machine in [`spec.md`](spec.md) §6. |

## 3. Contact display rule (authoritative)

The product behavior for the label is described in
[`spec.md`](spec.md) §4 and restated identically in
[`../../../docs/frontend/general/MODULE_OVERVIEW.md`](../../../docs/frontend/general/MODULE_OVERVIEW.md)
and [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).
This PRD only summarizes the user-facing outcome; the spec owns the
implementation.

> The contact display label is one of: group name, contact name, or phone number.
> JIDs (`@s.whatsapp.net`, `@g.us`, `@lid`, `status@broadcast`) and LID nodes are internal routing identifiers only and must never be rendered to the user.
> The display source for a 1:1 chat is `Message.key.senderPn` (always present on every `messages.upsert` from Baileys). The contact book is matched on phone, so the display chain is:
>
> 1. 1:1 chat, contact known — `Contact.displayName`. Example: chat with phone `6285179652486`, `Contact.displayName = "Pak Hendro"` → render "Pak Hendro".
> 2. 1:1 chat, contact unknown — `Message.key.senderPn` formatted as `+<CC> <first-3>-<next-4>-<last-4>`. Example: `senderPn = "6281234567890"` → render "+62 812-3456-7890".
> 3. Group chat (`@g.us`), group named — `Contact.groupName`. Example: "Tim Marketing Q3".
> 4. Group chat (`@g.us`), group unnamed — extract a phone from the group JID metadata when present (creator phone, participant phone, etc.) and apply rule 1 or 2. When no phone is extractable, render the Indonesian placeholder "Grup belum dinamai" — no JID digits, no number, no LID.
> 5. Status broadcast (`status@broadcast`) — render the literal "Status". (This is the one degenerate case where no phone is available; it is not a "number" but is a fixed, human-readable label.)
>
> The "unmappable LID" case is not reachable: every `Message` carries `key.senderPn`, so the display layer always has a phone for 1:1 chats. `@lid` JIDs are used internally for routing only and are stripped before any rendering.

### 3.1 User-facing copy

| Situation | What the user sees |
|---|---|
| Pak Hendro | The chip says **Pak Hendro**; the small sub-line under the chat shows `+62 851-7965-2486`. |
| Anonymous 1:1 | The chip says **+62 812-3456-7890**; no sub-line. |
| Named group | The chip says **Tim Marketing Q3**; no sub-line. |
| Unnamed group, no extractable phone | The chip says **Grup belum dinamai**; the tooltip explains "Nama grup belum diatur di kontak Anda". |
| Status | The chip says **Status**; no sub-line. |

## 4. User stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| US-1 | operator | see all recent chats in a sidebar sorted by recency. | I can pick up where I left off. |
| US-2 | operator | click a chat in the sidebar and see its history. | I don't have to `cat` a markdown file. |
| US-3 | operator | type a reply and hit Enter. | I can respond without leaving the page. |
| US-4 | operator | see whether a 1:1 is with a known person or just a phone number. | I don't greet "+62 812-…" by name. |
| US-5 | operator | see at a glance whether the backend WhatsApp session is up. | I know whether my next send will go through. |
| US-6 | operator | retry failed loads / sends from inside the page. | Network blips don't make me reload. |
| US-7 | operator | easily tell groups and status apart, and never see JID/LID fragments in the chat list. | I don't try to send a private message into a broadcast, and I'm never shown internal routing identifiers. |

## 5. UX requirements

- **Two-pane layout on ≥ md screens.** Sidebar = 320 px fixed; thread
  panel fills the rest. On smaller screens the sidebar collapses into a
  hamburger drawer.
- **Sidebar order**: pinned → unread → most-recently-active → archived.
  Archived chats hidden by default, behind a toggle.
- **Composer**: single-line input that grows to 6 rows; sticky to the
  bottom of the thread panel; never overlaps the message list.
- **Dark mode** parity with light mode on day one (shadcn/ui provides it
  out of the box; no theming work required).
- **Keyboard**:
  - `/` focuses the sidebar search box.
  - `↑`/`↓` move the sidebar selection.
  - `Enter` opens the focused chat.
  - `Esc` clears the composer selection.
- **i18n hooks**: all strings live in
  `frontend/src/i18n/id.json` (Indonesian, primary) and `en.json`
  (English, future). Phase 2 ships Indonesian only.

## 6. Acceptance criteria (Phase 2 — mock)

| # | Criterion | Verified by |
|---|---|---|
| A1 | Sidebar lists every seeded mock chat with the correct label per §3. | Manual visual review against the contact table. |
| A2 | Clicking a chat opens the corresponding thread panel and updates the URL to `/chats/:id`. | Manual click-through; routing test (planned). |
| A3 | Composer sends to the mock endpoint; the optimistic message is replaced by the server-returned message. | Code review; manual send. |
| A4 | Empty list shows the empty-state copy from [`spec.md`](spec.md) §6.1. | Manual; component test (planned). |
| A5 | A simulated `error` from the mock renders the red error card with a working **Coba lagi** button. | Manual toggle of the mock error flag. |
| A6 | Anonymous-contact sample (Pak Hendro, Bu Sinta, Reza, `+62 812-3456-7890` no-contact) renders with the expected label per §3.1; no JID, LID, or `~`-prefixed label is rendered for any seeded chat. | Manual review of the seeded chats. |
| A7 | Auth-status banner reflects the mock `AuthStatus` response (green dot when `connected: true`). | Manual; component test (planned). |

## 7. Out of scope (Phase 2 — Chats)

- Real backend wiring (Phase 3+).
- Real media (image/video/audio/document) upload and rendering.
- Search across chats (planned, future plan file).
- Reply quoting (no message-selection UX in this phase).
- Typing indicators, read receipts, presence (WhatsApp-side; not in mock).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The contact display rule drifts between docs and code. | Helper `contactLabel(chat, contact, senderPn, groupName?, groupMetadata?)` lives in a single file (`frontend/src/lib/contactLabel.ts`); §3 is encoded as a unit test fixture, and the signature is locked in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §3. |
| Mock-vs-real drift. | Mock responses validated by zod against the shared contract in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md). |
| Chat list grows large and ruins the sidebar. | Server-side pagination + infinite scroll is part of the future API contract (§2.1 of [`../../api/api-spec.md`](../../api/api-spec.md) will gain `limit` + `cursor`). |
| Indonesian-only copy blocks later locales. | All copy in i18n JSON files from day one. |

## 9. Cross-references

- Feature spec: [`spec.md`](spec.md).
- API contract: [`../../api/api-spec.md`](../../api/api-spec.md).
- Data shapes: [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).
- Module overview: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md).
- AI Chat (sister feature): [`../ai-chat/spec.md`](../ai-chat/spec.md).
- Future plans: [`../../plans/README.md`](../../plans/README.md).
