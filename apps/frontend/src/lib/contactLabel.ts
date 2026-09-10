import type { Chat, Contact } from '@/types';
import { STATUS_LABEL_ID, UNNAMED_GROUP_LABEL_ID } from './ai/fallbackMessage';
import { formatPhone } from './config';

/**
 * Contact display rule — see
 * `docs/tech/chat-data-model.md` §3 and
 * `docs/frontend/general/MODULE_OVERVIEW.md` §7.
 *
 * Rules:
 *   1. `chat.jid === "status@broadcast"` → `"Status"`.
 *   2. Group (`@g.us`) with a `groupName` → that name.
 *   3. Group with an extractable phone (from `groupMetadata`) → recurse
 *      as 1:1 (rules 4 or 5).
 *   4. Group with no extractable phone → `"Grup belum dinamai"`.
 *   5. 1:1 with a contact → `contact.displayName`.
 *   6. 1:1 without a contact → `formatPhone(senderPn)`.
 *
 * The function **never** returns a substring of `chat.jid`, never
 * includes `@s.whatsapp.net` / `@g.us` / `@lid`, and only reads
 * `chat.jid` to detect the chat kind.
 */
export function contactLabel(
  chat: Chat,
  contact: Contact | null,
  senderPn: string,
  groupName?: string,
  groupMetadata?: { creatorPn?: string; participantPns?: string[] }
): string {
  // Rule 1 — status broadcast.
  if (chat.jid === 'status@broadcast') {
    return STATUS_LABEL_ID;
  }

  // Rules 2–4 — group chats.
  if (chat.jid.endsWith('@g.us')) {
    const name = groupName ?? contact?.groupName ?? undefined;
    if (name && name.trim().length > 0) {
      return name;
    }
    // Try to extract a phone from the group metadata.
    const extracted =
      groupMetadata?.creatorPn ??
      (groupMetadata?.participantPns && groupMetadata.participantPns[0]);
    if (extracted) {
      const extractedContact = lookupContactForPhone(extracted);
      return formatPhoneFallback(extracted, extractedContact);
    }
    return UNNAMED_GROUP_LABEL_ID;
  }

  // Rules 5–6 — 1:1 chats (also covers @lid JIDs).
  return formatPhoneFallback(senderPn, contact);
}

function formatPhoneFallback(senderPn: string, contact: Contact | null): string {
  if (contact?.displayName && contact.displayName.trim().length > 0) {
    return contact.displayName;
  }
  return formatPhone(senderPn);
}

/**
 * In-file lookup helper. The real `lookupContactForPhone` lives in
 * `frontend/src/hooks/useContacts.ts` (Plan N). Plan 05's sidebar
 * receives a `Contact[]` and resolves contacts via
 * `findContactForPhone(contacts, phone)` exported below.
 */
function lookupContactForPhone(_phone: string): Contact | null {
  // The full lookup uses the contacts cache populated by useContacts.
  // Returning null here keeps the helper signature symmetrical for
  // group fallback (the caller of contactLabel passes a Contact|null).
  return null;
}

/**
 * Helper used by the sidebar to find the `Contact` row for a given phone
 * in the cached contacts list.
 */
export function findContactForPhone(
  contacts: readonly Contact[],
  phone: string | undefined
): Contact | null {
  if (!phone) return null;
  return contacts.find((c) => c.phone === phone) ?? null;
}

/**
 * Helper used by the sidebar to find the `Contact` row for a given
 * WhatsApp JID in the cached contacts list. Used for group chats
 * (`@g.us`) and status broadcasts (`status@broadcast`) which have no
 * `phone`. The `jid` field on `Contact` is internal-only — it is never
 * rendered to the user.
 */
export function findContactForJid(
  contacts: readonly Contact[],
  jid: string | undefined
): Contact | null {
  if (!jid) return null;
  return contacts.find((c) => c.jid === jid) ?? null;
}