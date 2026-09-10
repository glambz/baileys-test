import type { AIReplyMode } from './crm';

/**
 * Chat data model - interface source: `docs/tech/chat-data-model.md` section 2.1.
 *
 * A single conversation visible in the sidebar.
 *
 * For 1:1 chats: `jid` ends with `@s.whatsapp.net` or `@lid`.
 * For groups:   `jid` ends with `@g.us`.
 * For status:   `jid === "status@broadcast"`.
 *
 * `phone` is derived from the most recent inbound `Message.key.senderPn`
 * for the chat - **never** parsed from the JID.
 */
export interface Chat {
  /** Stable id used as the React key and the URL param for `/chats/:chatId`. */
  id: string;
  /** WhatsApp JID; suffix encodes the chat kind. Internal only - never rendered. */
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
  /**
   * AI reply mode. Imported from `@/types/crm` per SSoT contract
   * (`docs/tech/crm-data-model.md` §2 and
   * `docs/tech/ai-reply-state-machine.md` §1: "No other file is allowed
   * to spell this type any differently."). Default is `'ai'`.
   */
  aiMode?: AIReplyMode;
}