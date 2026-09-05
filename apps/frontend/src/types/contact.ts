/**
 * Contact data model — interface source: `docs/tech/chat-data-model.md` §2.3.
 */

/**
 * A row in the address book.
 */
export interface Contact {
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
  /**
   * WhatsApp JID — internal lookup key. For group rows this is the
   * `@g.us` JID so the sidebar can resolve a Contact for a group chat
   * (which has no `phone`). Optional; absent on rows that are only ever
   * looked up by phone. Never rendered to the user.
   */
  jid?: string | null;
  /** Tags the operator has applied (e.g. `"lead"`, `"vip"`). */
  tags?: string[];
  /** Free-form notes. */
  notes?: string;
  /** Unix seconds; timestamp of the last edit to this row. */
  updatedAt: number;
}