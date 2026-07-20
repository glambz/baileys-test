# Feature Spec — Chats

> The Chats page (`/chats`) is the operator's inbox view. Two panes — a
> sidebar of recent conversations and a thread panel for the focused chat.
> This spec is authoritative for the feature; the product framing lives in
> [`prd.md`](prd.md); the data shapes live in
> [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).

## 1. Scope

The Chats page renders four things:

1. **Sidebar** — list of chats sorted by `lastMessageAt DESC`, with
   pinned chats on top, then unread chats, then everything else.
2. **Thread header** — name (per the contact display rule; see §4), the
   contact phone shown as a sub-line when no `Contact.displayName` is
   known, and a kebab menu (`…`) stub for future actions. No JID or LID
   identifier is rendered here — routing identifiers stay internal.
3. **Message list** — paginated history of the focused chat, newest at
   the bottom. Auto-scrolls to the latest message on first open.
4. **Composer** — single-line input at the bottom; pressing **Enter**
   sends, **Shift+Enter** inserts a newline, **Send** button is disabled
   while empty.

## 2. Routing

| URL | State |
|---|---|
| `/chats` | Sidebar visible, thread panel shows the most-recent chat (or empty-state if there is none). |
| `/chats/:chatId` | Sidebar visible, thread panel focused on `Chat.id === :chatId`. URL is updated on sidebar click (uses React Router's `useNavigate`). |

## 3. Data flow

| UI element | Hook | Endpoint (see [`../../api/api-spec.md`](../../api/api-spec.md)) |
|---|---|---|
| Sidebar | `useChats()` (TanStack Query) | `GET /api/chats` |
| Thread | `useMessages(chatId)` | `GET /api/chats/:id/messages` |
| Send | `useSendMessage(chatId)` (mutation) | `POST /api/chats/:id/messages` |
| Auth banner | `useAuthStatus()` | `GET /api/auth/status` |

All hooks live in `frontend/src/hooks/`. Mock responses match the shapes
declared in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).

## 4. Contact display rule (authoritative)

Restated identically from
[`../../../docs/frontend/general/MODULE_OVERVIEW.md`](../../../docs/frontend/general/MODULE_OVERVIEW.md),
[`prd.md`](prd.md), and
[`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §3,
and enforced by the helper at `frontend/src/lib/contactLabel.ts`.

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

### 4.1 Worked examples

| Chat | Contact? | Displayed label |
|---|---|---|
| 1:1 chat, `phone=6285179652486` | yes, `displayName="Pak Hendro"` | **Pak Hendro** |
| 1:1 chat, `phone=6281234567890`, `senderPn="6281234567890"` | no | **+62 812-3456-7890** |
| Group chat, named | yes, `groupName="Tim Marketing Q3"` | **Tim Marketing Q3** |
| Group chat, unnamed, no extractable phone in group metadata | no `groupName` | **Grup belum dinamai** |
| Status broadcast | n/a | **Status** |

The contact-label helper signature is `function contactLabel(chat: Chat, contact: Contact | null, groupName?: string, senderPn: string): string` — see [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §3.

## 5. Send behavior

1. User types in the composer; the Send button enables when the trimmed
   value has length ≥ 1.
2. On submit:
   - The mock POSTs `POST /api/chats/:id/messages` with `{ body }`.
   - TanStack Query optimistically inserts an `out` message at the bottom
     of the thread with `id: "optimistic-<uuid>"` and `senderName: null`.
   - On success, the optimistic message is replaced with the server-returned
     record (which carries a stable id from the mock).
   - On error, the optimistic message is rolled back and an inline error
     toast appears at the bottom of the composer.
3. Enter sends; Shift+Enter inserts a newline. While the mutation is
   in-flight the composer is disabled and shows a spinner inside the Send
   button.
4. After a successful send the composer is cleared and focused.

## 6. Empty / Loading / Error states

The behavior for every list-bearing view is specified precisely below. The
test suite (planned per
[`../../tech/frontend-stack.md`](../../tech/frontend-stack.md) §5) asserts
on each.

### 6.1 Chat list (`GET /api/chats`)

| State | Trigger | UI |
|---|---|---|
| **Loading** | `isLoading === true` and `isFetching === true` | Skeleton rows × 6. Each skeleton is a 56 px tall row with two grey blocks. |
| **Empty** | `chats.length === 0` after success | Centered illustration + caption "Belum ada percakapan". Subtitle hints at `/api/auth/init` (mock info only). No retry button. |
| **Error** | `isError === true` | Centered red card with `error.message` and a **Coba lagi** button that calls `refetch()`. |
| **Refreshing** | `isFetching === true && isLoading === false` | No overlay; the existing list stays visible and a thin progress bar appears across the top of the sidebar. |
| **Offline** | `navigator.onLine === false` (best-effort) | Yellow banner at the top: "Tidak ada koneksi — menampilkan data terakhir yang di-cache". |

#### 6.1.1 Browser audit of every state above

Every state in this state machine is subject to the Auditor's
`a-audit-ui` browser audit (see
[`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md)
§11 and
[`.kilo/skills/a-audit-ui/SKILL.md`](../../../.kilo/skills/a-audit-ui/SKILL.md)).
The Auditor drives `browser-use` against the running Vite dev server
and verifies each state at render time, not just in source.

A state that renders correctly in source but breaks at render time
(blank screen, missing skeleton, leaked JID substring in error
fallback text, "Coba lagi" button not calling `refetch()`, etc.) is a
**blocker** (severity: blocker). Error codes from
`a-audit-ui` apply — see `.kilo/skills/a-audit-ui/SKILL.md` §"Error
Reference" for the full list (E001 dev-server down, E003 5xx, E004
console error, E006 contact-display leak, E007 acceptance unmet).

### 6.2 Message list (`GET /api/chats/:id/messages`)

| State | Trigger | UI |
|---|---|---|
| **Loading (first open)** | `isLoading === true` and `messages === undefined` | Skeleton bubbles: 5 in/out placeholders with `max-width: 60%`. |
| **Empty** | `messages.length === 0` after success | Centered caption "Belum ada pesan di percakapan ini". |
| **Error** | `isError === true` | Centered red card with `error.message` and a **Coba lagi** button. |
| **Loading older** | User clicked "Muat pesan lama" or scrolled to top while `hasOlder === true` | Top spinner (8 px) + a second skeleton row. |
| **Send optimistic** | Send in flight | Grey "pending" bubble at the bottom with a tiny spinner instead of a timestamp. |

### 6.3 Send action (`POST /api/chats/:id/messages`)

| State | Trigger | UI |
|---|---|---|
| **Idle** | Mutation not running | Send button enabled when composer non-empty. |
| **Submitting** | `isPending === true` | Send button disabled, shows spinner; composer disabled. |
| **Success** | mutation resolved | Composer cleared and refocused; thread panel receives the new server message. |
| **Validation error** | `error.code === "ValidationError"` | Inline message under composer in red; composer retains text. |
| **Not-found** | `error.code === "ChatNotFound"` | Toast: "Chat tidak ditemukan"; sidebar opens the empty-list state. |
| **Anti-ban / rate limit** (future only) | `error.code === "AntiBanBlocked"` or HTTP 429 | Toast: "Pengiriman ditahan oleh aturan anti-ban. Coba lagi sebentar." |
| **Backend unreachable** (future only) | HTTP 503 | Toast: "Layanan WhatsApp tidak tersedia". |

## 7. Auth-status banner

A small banner is rendered at the top-right of the page for both `/chats`
and `/ai-chat`, driven by `useAuthStatus()`. Colors:

| `state` | Color | Icon |
|---|---|---|
| `open` | green | ● |
| `qr` | yellow | ▢ |
| `connecting` | yellow | … |
| `close` | red | ✕ |

Hovering the banner shows the full `lastUpdatedAt` timestamp. The banner is
not a blocker; sending still works against the mock regardless of the
state.

## 8. Mock Indonesian chat samples

These are seeded by the mock layer to mirror the style of the existing
`inbox_logs/wa-chat-6285179652486.md` (business chat: campaign
confirmation, mockup delivery, pricing, schedule, follow-up). All original
content.

### 8.1 Pak Hendro — `+62 851-7965-2486` (`6285179652486`)

```
[2026-06-29 09:12] in   Pak Hendro
Halo kak, saya Hendro dari Toko Makmur. Mau konfirmasi campaign Senin ya?

[2026-06-29 09:14] out  me
Siap kak, saya kirim draft konsepnya siang ini sebelum jam 2.

[2026-06-29 13:42] in   Pak Hendro
[image:jpeg] Ini mockup banner yang kemarin kita bahas. Tolong dicek dulu ya.

[2026-06-29 13:50] out  me
Noted kak. Headline-nya sudah disesuaikan, warna sudah masuk brand guide.

[2026-06-29 16:05] in   Pak Hendro
Berapa sih kak total untuk 1 minggu running? Sama desainnya.

[2026-06-29 16:08] out  me
Paket Mingguan Rp 1.500.000 include 3 posting + 1 desain kak. Saya kirim invoice-nya sekarang.

[2026-06-30 10:11] in   Pak Hendro
Oke kak, deal. Kita mulai Senin 1 Juli. Thanks ya.
```

### 8.2 Bu Sinta — `+62 812-3456-7891` (`6281234567891`)

```
[2026-06-28 19:45] in   Bu Sinta
Mbak, untuk paket Bulanan sudah termasuk report mingguan juga?

[2026-06-28 19:50] out  me
Iya kak, setiap Jumat kami kirim ringkasan performa via WhatsApp & email.

[2026-06-29 08:15] in   Bu Sinta
Kalau saya tambah 1 campaign dadakan di tengah bulan, kena biaya berapa?

[2026-06-29 08:20] out  me
Tambahan Rp 750.000 per campaign kak, sudah termasuk desain + publishing.
```

### 8.3 Reza — `+62 813-9876-5432` (`6281398765432`)

```
[2026-06-27 14:02] in   Reza
Bro, follow-up meeting besok jadi jam berapa?

[2026-06-27 14:07] out  me
Jam 14:00 ya bro, saya share link Zoom 15 menit sebelum mulai.

[2026-06-28 11:33] in   Reza
Siap. Tolong siapin deck untuk klien baru ya, thank you.
```

### 8.4 Anonymous 1:1 — `senderPn = "6281234567890"` (no contact row)

```
[2026-06-30 09:00] in   +62 812-3456-7890
Halo, saya tertarik dengan paket kerja sama tahunan. Bisa info lengkap?

[2026-06-30 09:05] out  me
Halo kak, siap. Saya kirim pricelist & portofolio terbaru dalam 5 menit ya.
```

This sample exists specifically so the contact-missing 1:1 branch of the
contact display rule (render the formatted `senderPn`) can be exercised in
the UI.

## 9. Out of scope (Chats page)

- Media upload / preview (mock carries text only).
- Reactions, polls, location, contacts — not in scope for Phase 2.
- Multi-device sync.
- Search across chats (planned for a future phase).

## 10. Cross-references

- Product framing: [`prd.md`](prd.md).
- API contract: [`../../api/api-spec.md`](../../api/api-spec.md).
- Data shapes: [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).
- Module overview: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md).
- Future plans: [`../../plans/README.md`](../../plans/README.md).
