# Chat Data Model — `frontend/`

> Authoritative TypeScript interfaces for everything the frontend handles
> today (mock) and the future Baileys backend will store (real).
> This file declares **shapes only** — no runtime code, no Zod, no classes.

## 1. Conventions

- All identifiers are `string`.
- All timestamps are `number` representing **Unix epoch seconds** (matches
  what the existing Baileys backend in `src/` produces — see the `timestamp`
  field returned by `src/controllers/messageController.js:96`).
- All ISO fields end with `At`.
- Optional fields use `?` and must be defensively read by the UI.
- JID suffixes carry meaning: `@s.whatsapp.net` (1:1), `@g.us` (group),
  `status@broadcast` (status), `@lid` (privacy-mapped). The frontend
  treats the JID as a free-form internal routing string — it is **never**
  rendered to the user. The contact label is derived from
  `Message.key.senderPn` and the matched `Contact` per the contact
  display rule in [`../frontend/general/MODULE_OVERVIEW.md`](../frontend/general/MODULE_OVERVIEW.md) §7 and §3 of this file.

## 2. Core interfaces

### 2.1 `Chat`

```ts
/**
 * A single conversation visible in the sidebar.
 *
 * For 1:1 chats: `jid` ends with `@s.whatsapp.net` or `@lid`.
 * For groups:   `jid` ends with `@g.us`.
 * For status:   `jid === "status@broadcast"`.
 *
 * `phone` is derived from the most recent inbound `Message.key.senderPn`
 * for the chat — **never** parsed from the JID. It is optional because
 * the status broadcast carries no phone, and a chat may have no inbound
 * messages yet. The display layer reads `phone` only via `contactLabel()`,
 * which already handles the absence (see §3 + §3.1).
 */
interface Chat {
  /** Stable id used as the React key and the URL param for `/chats/:chatId`. */
  id: string;
  /** WhatsApp JID; suffix encodes the chat kind (see §1). Internal only — never rendered. */
  jid: string;
  /**
   * E.164 digits without `+`. Derived from the most recent
   * `Message.key.senderPn` for this chat; absent for status broadcasts and
   * for chats with no inbound messages yet. Do not derive this from `jid`.
   */
  phone?: string;
  /** Last message preview shown in the sidebar; trimmed to ~80 chars. */
  lastMessagePreview: string;
  /** Unix seconds for the last activity on this chat (in or out). */
  lastMessageAt: number;
  /** Unread message count for the operator; `0` means the chat is read. */
  unreadCount: number;
  /** Whether the chat is pinned to the top of the sidebar. */
  pinned?: boolean;
  /** Whether the chat is muted; affects the badge but never the order. */
  muted?: boolean;
  /** Whether the chat is archived; archived chats hide from the default sidebar. */
  archived?: boolean;
}
```

### 2.2 `Message`

```ts
/** Direction flag: `in` for contact → operator, `out` for operator → contact. */
type MessageDirection = "in" | "out";

/** Discriminator for the message body. The mock only emits `text`; the
 *  future real backend may also emit `image`, `video`, `document`,
 *  `audio`, `sticker`, `unknown`. */
type MessageKind = "text" | "image" | "video" | "document" | "audio" | "sticker" | "unknown";

/**
 * A single message in a chat thread.
 *
 * The real WhatsApp echo for an outbound `Message` is suppressed by the
 * backend (see `src/controllers/messageController.js:77`), so a thread
 * never contains two records for the same `id`.
 *
 * The `key` field mirrors the shape of `@whiskeysockets/baileys`'s
 * `proto.IMessageKey` and is the **display source** for the contact
 * label: `key.senderPn` is the 1:1 phone used by `contactLabel()`
 * (see §3), and `key.participantPn` is the phone of the group participant
 * for `@g.us` messages. Both are PNs (phone-number JIDs), never LIDs.
 */
interface Message {
  /** WhatsApp message id (`key.id`). Stable across renames. */
  id: string;
  /** Owning chat — same value as `Chat.id`. */
  chatId: string;
  /** Whether the operator sent it or received it. */
  direction: MessageDirection;
  /**
   * Baileys message key — mirrors `@whiskeysockets/baileys`'s
   * `proto.IMessageKey`. `senderPn` is the display-source phone for 1:1
   * chats and is **always present on every inbound `messages.upsert`**.
   * `participantPn` is the phone of the group participant for `@g.us`
   * messages; absent for 1:1.
   */
  key: {
    /** Chat JID (`@s.whatsapp.net` / `@g.us` / `status@broadcast` / `@lid`). Internal only. */
    remoteJid: string;
    /** `true` for operator-sent messages. */
    fromMe: boolean;
    /** Phone JID of the sender for 1:1 chats (e.g. `"6281234567890@s.whatsapp.net"` node, or the bare digits). Always present on inbound `messages.upsert`. */
    senderPn?: string;
    /** Phone JID of the group participant for `@g.us` messages. */
    participantPn?: string;
  };
  /** Display name of the sender at the time the message was received.
   *  `null` for outbound messages, or when the contact's push name is
   *  not yet known (privacy mode). */
  senderName: string | null;
  /** Body text for `kind === "text"`; `null` for media messages. */
  body: string | null;
  /** Discriminator for the message body. */
  kind: MessageKind;
  /** For media kinds, a placeholder caption; `null` if there is no caption. */
  caption?: string | null;
  /** For media kinds, the MIME type (e.g. `"image/jpeg"`); `null` for text. */
  mime?: string | null;
  /** Unix seconds; matches Baileys `messageTimestamp`. */
  timestamp: number;
}
```

### 2.3 `Contact`

```ts
/**
 * A row in the address book. The mock seeds ~5 of these; the future
 * real backend reads from the contacts store wired in
 * `src/controllers/contactsController.js:1`.
 */
interface Contact {
  /** Backend-supplied stable id; not the WhatsApp JID. */
  id: string;
  /** E.164 digits, no `+`; matches `Chat.phone` for 1:1 chats. */
  phone: string;
  /** Human-friendly display label rendered in the sidebar and header. */
  displayName: string;
  /** Optional group label rendered for `@g.us` chats; `null` for 1:1. */
  groupName?: string | null;
  /** LID mapping for privacy-mode JIDs (`suffix === "@lid"`). */
  lid?: string | null;
  /** WhatsApp JID used to match `@g.us` group chats. Internal-only — never rendered.
   *  Set this field on Contact rows whose chat is a group; for 1:1 chats the
   *  display layer already routes via `phone`. Absent for `Contact` rows whose
   *  JID is unknown at registration time. Mock seed example: `jid: '120363012345@g.us'`
   *  (Tim Marketing Q3 group). */
  jid?: string | null;
  /** Tags the operator has applied (e.g. `"lead"`, `"vip"`). */
  tags?: string[];
  /** Free-form notes. */
  notes?: string;
  /** Unix seconds; timestamp of the last edit to this row. */
  updatedAt: number;
}
```

### 2.4 `KnowledgeEntry`

```ts
/**
 * One Q/A fact in the AI knowledge base. Mock data lives in
 * `frontend/src/mock/knowledge.ts`; future real backend reads from a
 * DB whose schema mirrors this interface 1:1 (see §4).
 */
interface KnowledgeEntry {
  /** Stable id; the frontend cites this in evidence items. */
  id: string;
  /** Canonical question / phrasing the operator is likely to use. */
  question: string;
  /** Authoritative answer to render in the AI Chat. */
  answer: string;
  /** Optional free-text tags used by the mock retrieval ranking. */
  tags?: string[];
  /** Human-readable source citation: title, page, URL — rendered in evidence. */
  source: string;
  /** Optional URL for the source; rendered as a clickable link. */
  sourceUrl?: string | null;
  /** Unix seconds; timestamp the entry was last verified by a human. */
  updatedAt: number;
}
```

### 2.5 `AiAnswer`

```ts
/**
 * A non-fallback response from POST /api/ai/ask. When confidence is below
 * the threshold the API returns `FallbackAiAnswer` instead (see §2.8).
 */
interface AiAnswer {
  kind: "answered";
  /** The matched `KnowledgeEntry.answer`. */
  answer: string;
  /** Normalized confidence in `[0, 1]`. Compared against the module threshold `0.65`. */
  confidence: number;
  /** List of evidence items supporting the answer. */
  evidence: Evidence[];
  /** Unix seconds; when the answer was produced. */
  generatedAt: number;
  /** Echo of the original user question, trimmed. */
  question: string;
}
```

### 2.6 `ConfidenceScore`

```ts
/**
 * Normalized confidence score in `[0, 1]`. Higher = more certain.
 *
 * The module-wide threshold is `0.65`. Below the threshold the system
 * falls back (see `FallbackAiAnswer`); at or above it the matched
 * `KnowledgeEntry.answer` is returned with evidence.
 *
 * UI color band (also used by [`chat-data-model.md`](../frontend/features/ai-chat/spec.md)):
 *   - `>= 0.85` → green badge ("high")
 *   - `[0.65, 0.85)` → yellow badge ("medium")
 *   - `<  0.65` → red badge ("low" — fallback only)
 */
interface ConfidenceScore {
  /** Raw confidence in `[0, 1]`. */
  value: number;
  /** Bucket label for the UI badge; derived from `value` and the threshold `0.65`. */
  bucket: "high" | "medium" | "low";
}
```

### 2.7 `Evidence`

```ts
/**
 * One citation rendered beside an `AiAnswer`. Always references a real
 * `KnowledgeEntry` — the UI must not show evidence for `FallbackAiAnswer`.
 */
interface Evidence {
  /** The `KnowledgeEntry.id` being cited. */
  entryId: string;
  /** One-line excerpt of the matched question or answer (≤120 chars). */
  excerpt: string;
  /** Verbatim `KnowledgeEntry.source` for the citation line. */
  source: string;
  /** Optional clickable URL copy of `KnowledgeEntry.sourceUrl`. */
  sourceUrl?: string | null;
  /** Per-evidence confidence in `[0, 1]`; informational, not part of the decision. */
  confidence: number;
}
```

### 2.8 `FallbackAiAnswer`

```ts
/**
 * The response from POST /api/ai/ask when no `KnowledgeEntry` meets the
 * confidence threshold `0.65`. The `message` field MUST be the fixed
 * Indonesian phrase declared in
 * [`../frontend/features/ai-chat/spec.md`](../frontend/features/ai-chat/spec.md)
 * — byte-identical — and the `suggestion` field, when present, is the
 * `KnowledgeEntry` with the highest score so the operator can decide
 * whether to rephrase.
 */
interface FallbackAiAnswer {
  kind: "fallback";
  /** Fixed Indonesian sentence. See spec for the exact bytes. */
  message: string;
  /** Optional `KnowledgeEntry` pointer for "maybe you meant this…". */
  suggestion?: {
    entryId: string;
    question: string;
    source: string;
  };
  /** Top-N candidate scores that failed the threshold, for transparency. */
  rejectedCandidates?: Array<{ entryId: string; confidence: number }>;
}
```

### 2.9 `AuthStatus`

```ts
/**
 * Response shape of GET /api/auth/status. Mirrors the backend payload
 * returned by `src/controllers/authController.js:90`.
 */
interface AuthStatus {
  /** `true` when the WhatsApp socket is in the `open` state. */
  connected: boolean;
  /** Backend connection state. One of `"open" | "qr" | "connecting" | "close"`. */
  state: "open" | "qr" | "connecting" | "close";
  /** Operator JID, when connected; `null` otherwise. */
  userJid?: string | null;
  /** Display name of the operator's own WhatsApp profile; `null` otherwise. */
  userName?: string | null;
  /** Unix seconds of the last state transition; `null` when unknown. */
  lastUpdatedAt?: number | null;
}
```

## 3. Contact display rule

Restated identically from
[`../frontend/general/MODULE_OVERVIEW.md`](../frontend/general/MODULE_OVERVIEW.md),
[`../frontend/features/chats/spec.md`](../frontend/features/chats/spec.md)
§4, and [`../frontend/features/chats/prd.md`](../frontend/features/chats/prd.md)
§3, and enforced by the helper signature below.

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

### 3.1 JID/LID boundary

JIDs (`@s.whatsapp.net`, `@g.us`, `@lid`) are internal routing identifiers.
The display layer **never** reads from `Chat.jid`, `Chat.lid`,
`Message.key.remoteJid`, or any `@lid` JID field. The display layer reads
from `Message.key.senderPn` and the matched `Contact`. The contact book
match is by phone only; LID-to-phone lookup tables are not consulted on the
display path.

The contact-label helper signature is locked to the rule above:

```ts
/**
 * Pure function — UI calls this everywhere a chat label is needed.
 * Implementation lives at `frontend/src/lib/contactLabel.ts`.
 *
 * @param chat            The chat being rendered. `chat.jid` is read only
 *                        to detect the chat kind (1:1 vs group vs status);
 *                        it is never displayed.
 * @param contact         The matched `Contact` for the chat's phone, or
 *                        `null` if no contact row exists for that phone.
 * @param senderPn        The display-source phone for 1:1 chats, taken
 *                        from `Message.key.senderPn`. Required.
 * @param groupName       The display name for a `@g.us` chat, taken from
 *                        `Contact.groupName`. Optional.
 * @param groupMetadata   Optional group metadata used to extract a phone
 *                        for unnamed groups (creator phone, participant
 *                        phone, etc.). When provided and a phone is
 *                        extractable, rules 1 or 2 are applied; otherwise
 *                        the placeholder "Grup belum dinamai" is rendered.
 * @returns               The label described in the rule above.
 */
function contactLabel(
  chat: Chat,
  contact: Contact | null,
  senderPn: string,
  groupName?: string,
  groupMetadata?: { creatorPn?: string; participantPns?: string[] }
): string;
```

## 4. Future DB mapping

When the real backend ships, every interface above maps onto a SQL/NoSQL
table of the same name. The mapping is:

| Interface | Table / collection | Notes |
|---|---|---|
| `Chat` | `chats` | PK = `id`; index on `phone` and `jid`. Aggregated from `inbox_logs/*.md` plus contact data. |
| `Message` | `messages` | PK = `id`; FK `chat_id` → `chats.id`; index on `(chat_id, timestamp DESC)` for thread page. |
| `Contact` | `contacts` | PK = `id`; unique index on `phone`; unique index on `lid` when present. Backed by `src/controllers/contactsController.js:1`. |
| `KnowledgeEntry` | `knowledge_entries` | PK = `id`; full-text index on `question` + `answer` + `tags` for retrieval. |
| `AiAnswer` | not stored | Stateless; only the audit log (`ai_answer_log`) records {question, answer, confidence, evidence, generatedAt}. |
| `ConfidenceScore` | not stored | Computed on the fly by the retrieval pipeline. |
| `Evidence` | not stored | Embedded in the `AiAnswer` returned to the frontend. |
| `FallbackAiAnswer` | not stored | Same as `AiAnswer`; logged to `ai_fallback_log` with the rejected candidates. |
| `AuthStatus` | not stored | Read-only snapshot of the Baileys socket state held by `src/whatsapp/client.js`. |

The boundary is enforced by a single zod schema in
`frontend/src/lib/contract.ts`; the schemas mirror these interfaces so the
mock layer and the future real backend cannot drift apart silently.
