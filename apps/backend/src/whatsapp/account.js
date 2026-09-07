'use strict';
/**
 * Which WhatsApp account is this deployment currently acting as?
 *
 * Every row in `chats` and `messages` is stamped with the answer, and every
 * read is filtered by it. Before that existed, nothing recorded which account
 * a chat belonged to: `chats.id` is the CONTACT's JID and was the whole
 * primary key, so logging out of account A and pairing account B merged both
 * accounts' history into one set of rows — account B's operator saw account
 * A's chats, and a contact both accounts had messaged showed a single
 * interleaved thread.
 *
 * Resolution order:
 *   1. the live socket's own JID, when connected — authoritative
 *   2. the persisted `selfPn` from the inbox writer's mapping file
 *
 * Step 2 matters: the socket drops routinely, and without a persisted
 * fallback every scoped read would return nothing and the UI would blank out
 * whenever the connection blipped. The mapping file is cleared on logout, so
 * "unpaired" still resolves to null rather than to the previous account.
 */
const inbox = require('../inbox/writer');

/**
 * Reduce a JID or phone to bare digits: `6285179652486:2@s.whatsapp.net`
 * and `+62 851-7965-2486` both become `6285179652486`.
 *
 * @returns {string|null} null when the input cannot be a phone number
 */
function normalizeAccountId(pnOrJid) {
  if (!pnOrJid) return null;
  const withoutDomain = String(pnOrJid).split('@')[0];
  const withoutDevice = withoutDomain.split(':')[0];
  const bare = withoutDevice.replace(/[^0-9]/g, '');
  return /^\d{8,15}$/.test(bare) ? bare : null;
}

/**
 * The active account id, or null when no account has ever been paired.
 *
 * Callers that read or write chat data MUST handle null by refusing rather
 * than by falling back to "all accounts" — that fallback is the data leak
 * this module exists to prevent.
 */
function currentAccountId() {
  // Required lazily: client.js requires this module's siblings, and a
  // top-level require here would close a cycle through whatsapp/client.
  let fromSocket = null;
  try {
    const wa = require('./client');
    fromSocket = wa && wa.user ? normalizeAccountId(wa.user.id) : null;
  } catch (_) {
    fromSocket = null;
  }
  if (fromSocket) return fromSocket;

  try {
    return normalizeAccountId(inbox.getSelfPn());
  } catch (_) {
    return null;
  }
}

/**
 * Placeholder stamped on rows that predate account scoping, and on rows
 * written while no account is resolvable.
 *
 * Deliberately not NULL: `account_jid = $1` never matches NULL, so a NULL
 * would make those rows permanently invisible and look like data loss. An
 * empty string is matchable, and migration 014 backfills historic rows with
 * the real account where one is known.
 */
const UNKNOWN_ACCOUNT = '';

module.exports = { currentAccountId, normalizeAccountId, UNKNOWN_ACCOUNT };
