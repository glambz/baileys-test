/**
 * Message data model — interface source: `docs/tech/chat-data-model.md` §2.2.
 */

/** Direction flag: `in` for contact → operator, `out` for operator → contact. */
export type MessageDirection = 'in' | 'out';

/** Discriminator for the message body. The mock only emits `text`. */
export type MessageKind = 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'unknown';

/**
 * A single message in a chat thread.
 *
 * The `key` field mirrors `@whiskeysockets/baileys`'s `proto.IMessageKey`
 * and is the **display source** for the contact label: `key.senderPn` is
 * the 1:1 phone used by `contactLabel()`.
 */
export interface Message {
  /** WhatsApp message id (`key.id`). Stable across renames. */
  id: string;
  /** Owning chat — same value as `Chat.id`. */
  chatId: string;
  /** Whether the operator sent it or received it. */
  direction: MessageDirection;
  /**
   * Baileys message key. `senderPn` is the display-source phone for 1:1
   * chats and is **always present on every inbound `messages.upsert`**.
   */
  key: {
    /** Chat JID. Internal only. */
    remoteJid: string;
    /** `true` for operator-sent messages. */
    fromMe: boolean;
    /** Phone JID of the sender for 1:1 chats. */
    senderPn?: string;
    /** Phone JID of the group participant for `@g.us` messages. */
    participantPn?: string;
  };
  /** Display name of the sender at the time the message was received. */
  senderName: string | null;
  /** Body text for `kind === "text"`; `null` for media messages. */
  body: string | null;
  /** Discriminator for the message body. */
  kind: MessageKind;
  /** For media kinds, a placeholder caption; `null` if there is no caption. */
  caption?: string | null;
  /** For media kinds, the MIME type; `null` for text. */
  mime?: string | null;
  /** Unix seconds; matches Baileys `messageTimestamp`. */
  timestamp: number;
  /** Outbound message that flagged the chat as needing human help. */
  isFallback?: boolean;
}