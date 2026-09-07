'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { getPool } = require('../db/client');

const writeQueues = new Map();
const meta = new Map();
const writtenIds = new Set();
const lidToPn = new Map();
const seenLidInbound = new Set();
let selfPnBare = null;
const MAPPINGS_FILE = path.join(config.inbox.dir, '.lid-mappings.json');
const SEEN_LID_INBOUND_FILE = path.join(
  config.inbox.dir,
  '.lid-seen-inbound.json'
);

const RECENT_TTL_MS = 10 * 60 * 1000;

function ensureDir() {
  if (!fs.existsSync(config.inbox.dir)) {
    fs.mkdirSync(config.inbox.dir, { recursive: true });
  }
}

function sanitizeForFile(remoteJid) {
  const bare = String(remoteJid || '').split('@')[0] || 'unknown';
  return bare.replace(/[^0-9]/g, '') || 'unknown';
}

function isGroup(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

function isStatus(jid) {
  return jid === 'status@broadcast';
}

function isNewsletter(jid) {
  return typeof jid === 'string' && jid.endsWith('@newsletter');
}

function isLid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

/**
 * Resolve a remoteJid by replacing a @lid JID with its known @s.whatsapp.net
 * equivalent, if a mapping has been registered. Returns the input
 * unchanged when there is no mapping or the input is already a PN / group.
 *
 * Without this, Baileys' messages.upsert events for chats that WhatsApp
 * internally tracks by LID land in a `wa-chat-<lid>.md` file, while
 * sends via the API (which use the PN) land in `wa-chat-<pn>.md`. The
 * two files never meet, so the "full chat history per contact" goal is
 * broken. Resolving here gives one file per contact regardless of
 * whether Baileys reports the chat as a PN or a LID.
 */
function resolveJid(jid) {
  if (!isLid(jid)) return jid;
  const bare = jid.split('@')[0];
  const pn = lidToPn.get(bare);
  if (pn) return pn;
  return jid;
}

function persistMappings() {
  try {
    ensureDir();
    const obj = { selfPn: selfPnBare, mappings: [...lidToPn.entries()] };
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: err.message }, 'Inbox: failed to persist LID mappings');
  }
}

function persistSeenInbound() {
  try {
    ensureDir();
    fs.writeFileSync(
      SEEN_LID_INBOUND_FILE,
      JSON.stringify([...seenLidInbound]),
      'utf8'
    );
  } catch (err) {
    logger.warn(
      { err: err.message },
      'Inbox: failed to persist seenLidInbound'
    );
  }
}

function loadMappings() {
  try {
    if (!fs.existsSync(MAPPINGS_FILE)) return;
    const raw = fs.readFileSync(MAPPINGS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (obj.selfPn) {
      const bare = String(obj.selfPn).replace(/[^0-9]/g, '');
      if (/^\d{8,15}$/.test(bare)) selfPnBare = bare;
    }
    if (Array.isArray(obj.mappings)) {
      for (const [lid, pn] of obj.mappings) {
        if (typeof lid === 'string' && typeof pn === 'string') {
          const lidBare = lid.split('@')[0];
          if (/^\d{8,15}$/.test(lidBare)) lidToPn.set(lidBare, pn);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Inbox: failed to load LID mappings');
  }
}

function loadSeenInbound() {
  try {
    if (!fs.existsSync(SEEN_LID_INBOUND_FILE)) return;
    const raw = fs.readFileSync(SEEN_LID_INBOUND_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const lid of arr) {
        if (typeof lid === 'string' && /^\d{8,15}$/.test(lid)) {
          seenLidInbound.add(lid);
        }
      }
    }
  } catch (err) {
    logger.warn(
      { err: err.message },
      'Inbox: failed to load seenLidInbound'
    );
  }
}

// Seed seenLidInbound from the existing inbox_logs/ on first boot, so
// the safer auto-learner doesn't misregister a contact LID as your own
// just because the server restarted. We treat any file that already
// contains an inbound line as evidence that its LID is a contact.
function seedSeenInboundFromLogs() {
  try {
    if (!fs.existsSync(config.inbox.dir)) return;
    if (seenLidInbound.size > 0) return; // already loaded from disk
    const files = fs.readdirSync(config.inbox.dir);
    for (const f of files) {
      const m = f.match(/^wa-chat-(\d{8,15})\.md$/);
      if (!m) continue;
      const content = fs.readFileSync(path.join(config.inbox.dir, f), 'utf8');
      if (/\[in \]/.test(content)) {
        seenLidInbound.add(m[1]);
      }
    }
    if (seenLidInbound.size > 0) {
      persistSeenInbound();
      logger.info(
        { count: seenLidInbound.size },
        'Inbox: seeded seenLidInbound from existing logs'
      );
    }
  } catch (err) {
    logger.warn(
      { err: err.message },
      'Inbox: failed to seed seenLidInbound'
    );
  }
}
// Load on require so the writer is ready before the first event.
loadMappings();
loadSeenInbound();
seedSeenInboundFromLogs();

/**
 * Register a LID -> phone-number mapping. After this, any file or
 * write keyed by the LID will instead use the phone number.
 * No-op if the inputs are malformed.
 */
function registerLid(lid, pn) {
  if (typeof lid !== 'string' || typeof pn !== 'string') return false;
  const lidBare = lid.split('@')[0];
  if (!/^\d{8,15}$/.test(lidBare)) return false;
  const pnBare = pn.replace(/[^0-9]/g, '');
  if (!/^\d{8,15}$/.test(pnBare)) return false;
  lidToPn.set(lidBare, `${pnBare}@s.whatsapp.net`);
  logger.info({ lid: `${lidBare}@lid`, pn: `${pnBare}@s.whatsapp.net` }, 'Inbox: registered LID->PN mapping');
  persistMappings();
  return true;
}

function listLidMappings() {
  return [...lidToPn.entries()].map(([lid, pn]) => ({
    lid: `${lid}@lid`,
    pn,
  }));
}

/**
 * Set the user's own phone number. Accepts either a bare PN
 * ("6285179652486") or a JID ("6285179652486:10@s.whatsapp.net") —
 * the device ID and the @s.whatsapp.net suffix are stripped before
 * storing. Used by the auto-self-LID learning in recordFromBaileys.
 * Pass null to clear.
 */
function setSelfPn(pnOrJid) {
  if (!pnOrJid) {
    if (selfPnBare !== null) {
      selfPnBare = null;
      persistMappings();
    }
    return;
  }
  // Strip @s.whatsapp.net then the :deviceId, then non-digits.
  const withoutDomain = String(pnOrJid).split('@')[0];
  const withoutDevice = withoutDomain.split(':')[0];
  const bare = withoutDevice.replace(/[^0-9]/g, '');
  if (!/^\d{8,15}$/.test(bare)) {
    if (selfPnBare !== null) {
      selfPnBare = null;
      persistMappings();
    }
    return;
  }
  if (selfPnBare !== bare) {
    selfPnBare = bare;
    persistMappings();
  }
}

/**
 * The operator's own number, bare digits, or null when unpaired.
 *
 * Persisted alongside the LID mappings, so it survives a process restart and
 * a dropped socket — which is what lets account-scoped DB reads keep working
 * while the socket is briefly down.
 */
/**
 * The active account id, resolved lazily.
 *
 * `whatsapp/account.js` requires this module (for the persisted self number),
 * so requiring it back at the top would close a require cycle and one of the
 * two would see a half-initialised exports object. Resolving inside the call
 * avoids that. Falls back to the persisted self number, which is what
 * account.js would have returned anyway.
 */
function activeAccountId() {
  try {
    // eslint-disable-next-line global-require
    return require('../whatsapp/account').currentAccountId() || '';
  } catch (_) {
    return selfPnBare || '';
  }
}

function getSelfPn() {
  return selfPnBare;
}

/**
 * Forget everything learned about the previous pairing.
 *
 * The LID->PN map is account-specific: it translates a contact's @lid into a
 * phone number as seen by ONE linked account. Carrying it across a logout let
 * the old account's mappings keep rewriting the new account's inbound JIDs.
 * Called from the WhatsApp client's logout path.
 */
function clearIdentity() {
  lidToPn.clear();
  selfPnBare = null;
  persistMappings();
}

function fileNameFor(remoteJid) {
  const resolved = resolveJid(remoteJid);
  if (isGroup(resolved)) {
    return `wa-chat-group-${sanitizeForFile(resolved)}.md`;
  }
  if (isStatus(resolved)) {
    return 'wa-chat-status.md';
  }
  return `wa-chat-${sanitizeForFile(resolved)}.md`;
}

function pathFor(remoteJid) {
  return path.join(config.inbox.dir, fileNameFor(remoteJid));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTs(ts) {
  const n = Number(ts) || Math.floor(Date.now() / 1000);
  const d = new Date(n * 1000);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function unwrapMessage(m) {
  let safety = 0;
  while (m && safety++ < 5) {
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
      continue;
    }
    if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
      continue;
    }
    if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
      continue;
    }
    if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return m;
}

function extractText(msgContent) {
  const m = unwrapMessage(msgContent);
  if (!m) return { body: '', kind: 'empty' };
  if (m.conversation) return { body: m.conversation, kind: 'text' };
  if (m.extendedTextMessage?.text) {
    return { body: m.extendedTextMessage.text, kind: 'text' };
  }
  if (m.imageMessage) {
    return {
      body: m.imageMessage.caption || '',
      kind: 'image',
      mime: m.imageMessage.mimetype || 'image/jpeg',
    };
  }
  if (m.videoMessage) {
    return {
      body: m.videoMessage.caption || '',
      kind: 'video',
      mime: m.videoMessage.mimetype || 'video/mp4',
    };
  }
  if (m.documentMessage) {
    return {
      body:
        m.documentMessage.caption ||
        m.documentMessage.fileName ||
        '',
      kind: 'document',
      mime: m.documentMessage.mimetype || 'application/octet-stream',
    };
  }
  if (m.audioMessage) {
    return {
      body: m.audioMessage.ptt ? '(voice note)' : '(audio)',
      kind: 'audio',
      mime: m.audioMessage.mimetype || 'audio/ogg',
    };
  }
  if (m.stickerMessage) {
    return {
      body: m.stickerMessage.isAnimated ? '(animated sticker)' : '(sticker)',
      kind: 'sticker',
    };
  }
  if (m.contactMessage) {
    return {
      body: m.contactMessage.displayName || '(contact)',
      kind: 'contact',
    };
  }
  if (m.locationMessage) {
    return {
      body: `(${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude})`,
      kind: 'location',
    };
  }
  if (m.liveLocationMessage) return { body: '(live location)', kind: 'live_location' };
  if (m.reactionMessage) return { body: '', kind: 'reaction' };
  if (m.protocolMessage) return { body: '', kind: 'protocol' };
  if (m.pollCreationMessage) {
    return { body: m.pollCreationMessage.name || '(poll)', kind: 'poll' };
  }
  return { body: '', kind: 'unknown' };
}

function formatEntry({ remoteJid, pushName, direction, ts, body, kind, mime }) {
  const speaker =
    direction === 'in'
      ? pushName || sanitizeForFile(remoteJid)
      : 'me';
  const dirLabel = direction === 'in' ? 'in ' : 'out';
  const header = `**[${formatTs(ts)}] [${dirLabel}] ${speaker}**`;
  const label =
    kind && kind !== 'text' ? `[${kind}${mime ? `:${mime.split('/')[1] || mime}` : ''}]` : '';
  const raw = `${label} ${body || ''}`.trim();
  const lines = raw.split('\n');
  const bodyText = lines
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n');
  return `${header}\n${bodyText}\n\n`;
}

function makeHeader(remoteJid, pushName, firstTs) {
  const resolved = resolveJid(remoteJid);
  let title;
  if (isGroup(resolved)) {
    title = `WhatsApp group chat — ${sanitizeForFile(resolved)}`;
  } else if (isStatus(resolved)) {
    title = 'WhatsApp status updates';
  } else {
    title = `WhatsApp chat with ${sanitizeForFile(resolved)}`;
  }
  if (pushName) title += ` (${pushName})`;
  return `# ${title}\n\n> Created: ${formatTs(firstTs)}\n\n---\n\n`;
}

function writeHeaderIfMissing(filePath, remoteJid, pushName, ts) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, makeHeader(remoteJid, pushName, ts), 'utf8');
  }
}

function appendToFile(remoteJid, pushName, ts, formatted) {
  const filePath = pathFor(remoteJid);
  ensureDir();
  writeHeaderIfMissing(filePath, remoteJid, pushName, ts);
  fs.appendFileSync(filePath, formatted, 'utf8');
  return filePath;
}

function record(remoteJid, opts) {
  if (!config.inbox.enabled) return Promise.resolve();
  if (!remoteJid) return Promise.resolve();
  if (isNewsletter(remoteJid)) return Promise.resolve();
  if (isStatus(remoteJid) && !config.inbox.includeStatus) return Promise.resolve();
  // Resolve @lid -> @s.whatsapp.net BEFORE any other check or filename
  // computation, so a single contact ends up in one file regardless of
  // which JID format Baileys reports the chat under.
  remoteJid = resolveJid(remoteJid);
  const { direction, pushName, ts, body, kind, mime, msgId } = opts;
  if (msgId && writtenIds.has(msgId)) {
    // Already written by an earlier path (explicit outbound or event).
    return Promise.resolve();
  }
  if (!kind || kind === 'empty' || kind === 'reaction' || kind === 'protocol') {
    return Promise.resolve();
  }
  if (kind === 'unknown') {
    logger.debug({ remoteJid }, 'Inbox: skipping unknown message type');
    return Promise.resolve();
  }
  const formatted = formatEntry({
    remoteJid,
    pushName,
    direction,
    ts,
    body,
    kind,
    mime,
  });

  const task = () => {
    try {
      const fp = appendToFile(remoteJid, pushName, ts, formatted);
      if (msgId) {
        writtenIds.add(msgId);
        setTimeout(() => writtenIds.delete(msgId), RECENT_TTL_MS).unref();
      }
      const m = meta.get(remoteJid) || { count: 0 };
      meta.set(remoteJid, {
        count: m.count + 1,
        firstSeen: m.firstSeen || ts,
        lastSeen: ts,
        pushName: pushName || m.pushName,
        kind: isGroup(remoteJid)
          ? 'group'
          : isStatus(remoteJid)
            ? 'status'
            : 'contact',
      });
      logger.debug(
        { remoteJid, direction, kind, msgId, file: fp },
        'Inbox message recorded'
      );
      // BUG-INBOUND-NOT-IN-MESSAGES fix (2026-07-16): also persist to the
      // messages DB table so the FE /api/chats/:id/messages endpoint can
      // surface inbound messages (previously the inbox only wrote to
      // markdown files, which the API never reads).
      // Best-effort: skip silently if the DB is unavailable.
      // BUG-NEW-MSG-NOT-VISIBLE-STALE-CHAT fix (2026-07-22): also
      // upsert the chats row's last_message_at + ai_mode default so the
      // sidebar reflects the newest inbound and the trigger can find the
      // chat on its first step. Without this, the chats row goes stale
      // and the FE's "load older" cursor never picks up the new ts.
      try {
        const id = msgId || `srv-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const pool = getPool();
        pool.query(
          `INSERT INTO messages (id, chat_id, direction, body, sender_name, timestamp, is_fallback, account_jid)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            id,
            remoteJid,
            direction,
            body || '',
            pushName || null,
            ts,
            activeAccountId(),
          ]
        ).catch((dbErr) => {
          logger.debug({ err: dbErr.message, msgId: id }, 'Inbox messages-table upsert failed (non-fatal)');
        });
        // Upsert the chat row. We use the canonical id (remoteJid is
        // already resolved to PN form by the caller). ON CONFLICT only
        // updates last_message_at (preserves ai_mode, jid, phone so the
        // operator's per-chat toggle survives).
        pool.query(
          `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, account_jid)
           VALUES ($1, $1, '', '', $2, 0, $3)
           ON CONFLICT (account_jid, id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at`,
          [remoteJid, ts, activeAccountId()]
        ).catch((dbErr) => {
          logger.debug({ err: dbErr.message, chatId: remoteJid }, 'Inbox chats-row upsert failed (non-fatal)');
        });
      } catch (_) {
        // DB not available; markdown file write still succeeded.
      }
    } catch (err) {
      logger.error(
        { remoteJid, err: { message: err.message, code: err.code } },
        'Failed to write inbox log'
      );
    }
  };

  const prev = writeQueues.get(remoteJid) || Promise.resolve();
  const next = prev.then(task);
  writeQueues.set(remoteJid, next.catch(() => {}));
  return next;
}

function recordFromBaileys(msg) {
  if (!msg || !msg.message) return Promise.resolve();
  const rawJid = msg.key && msg.key.remoteJid;
  if (!rawJid) return Promise.resolve();
  const direction = msg.key.fromMe ? 'out' : 'in';
  const ts =
    Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
  const pushName = msg.pushName || null;
  const { body, kind, mime } = extractText(msg.message);

  // ---- auto-learn LID -> PN from senderPn / participantPn -------------
  // Baileys decodes the WhatsApp protocol attrs.sender_pn and
  // attrs.participant_pn straight into msg.key.senderPn /
  // msg.key.participantPn. These are populated whenever the
  // corresponding LID is present. So for any incoming message where
  // the remote party is LID-routed, the PN is sitting right there on
  // msg.key. For group messages, participantPn / participantLid hold
  // the sender's pair. We register both — cheap, safe (only ever
  // from messages that have just arrived), persistent.
  //
  // In the wild we've seen both forms:
  //   { senderLid: "123...", senderPn: "628..." }   (both fields set)
  //   { senderLid: null,    senderPn: "628..." }   (only senderPn set,
  //                                                LID is in remoteJid)
  // Both should map the chat LID to the PN.
  const k = msg.key || {};
  if (k.senderPn) {
    const lidBare = k.senderLid
      ? String(k.senderLid)
      : isLid(rawJid)
        ? rawJid.split('@')[0]
        : null;
    if (lidBare) {
      registerLid(`${lidBare}@lid`, `${k.senderPn}@s.whatsapp.net`);
    }
  }
  if (k.participantPn && k.participantLid) {
    registerLid(
      `${k.participantLid}@lid`,
      `${k.participantPn}@s.whatsapp.net`
    );
  } else if (k.participantPn && k.participant) {
    const partLidBare = isLid(k.participant)
      ? k.participant.split('@')[0]
      : null;
    if (partLidBare) {
      registerLid(
        `${partLidBare}@lid`,
        `${k.participantPn}@s.whatsapp.net`
      );
    }
  }

  // Track which LIDs have appeared as the *destination* of an inbound
  // message — those are contact LIDs, never the user's own.
  if (!msg.key.fromMe && isLid(rawJid)) {
    const lidBare = rawJid.split('@')[0];
    if (!seenLidInbound.has(lidBare)) {
      seenLidInbound.add(lidBare);
      persistSeenInbound();
    }
  }
  // Auto-learn the self-LID, BUT only for LIDs we have never seen as
  // an inbound recipient. This rule is what makes the auto-learner
  // safe: a chat where someone else (not you) is the recipient will
  // always have at least one inbound event, so the LID is never
  // misregistered as your own. True self-chats (you sending to
  // yourself) never have an inbound from the contact side, so the
  // LID gets auto-mapped to your PN.
  if (msg.key.fromMe && isLid(rawJid) && selfPnBare) {
    const lidBare = rawJid.split('@')[0];
    if (!seenLidInbound.has(lidBare) && !lidToPn.has(lidBare)) {
      registerLid(`${lidBare}@lid`, selfPnBare);
    }
  }
  return record(rawJid, {
    direction,
    pushName,
    ts,
    body,
    kind,
    mime,
    msgId: msg.key && msg.key.id,
  });
}

function getStats() {
  return [...meta.entries()].map(([jid, s]) => ({ jid, ...s }));
}

async function flush() {
  const all = [...writeQueues.values()];
  if (all.length === 0) return;
  await Promise.allSettled(all);
}

/**
 * Mark a message id as already-logged. Called by the explicit outbound
 * paths (sendTextMessage, /api/messages/send, broadcaster) AFTER they
 * write, so that if Baileys also fires messages.upsert for the same
 * id, the event handler will skip it instead of writing a duplicate.
 * The id auto-expires after RECENT_TTL_MS so the Set can't grow
 * forever. The writer's own `record` also auto-adds to this set on
 * every write, so this is only needed for the early-skip optimisation
 * in the event handler.
 */
function markLogged(msgId) {
  if (!msgId) return;
  writtenIds.add(msgId);
  setTimeout(() => writtenIds.delete(msgId), RECENT_TTL_MS).unref();
}

/**
 * Returns true if the id was previously written. Used by the
 * messages.upsert handler as an early-skip optimisation.
 */
function wasLogged(msgId) {
  if (!msgId) return false;
  return writtenIds.has(msgId);
}

function reset() {
  writeQueues.clear();
  meta.clear();
}

/**
 * Read the most recent N messages from a contact's chat markdown file and
 * return them as { role, content, ts } objects suitable for buildUserPrompt's
 * `chatHistory` parameter. The latest message is excluded (it's the inbound
 * that the trigger is currently processing — already in the user prompt's
 * <QUESTION> block).
 *
 * Parses the canonical inbox format:
 *   **[2026-07-08 19:21:11] [out] me**
 *   <body, possibly multi-line, until the next **[ or EOF>
 *
 * Returns [] if the file doesn't exist (first message with this contact) or
 * the chat is for status/group/empty. `limit` defaults to 6.
 */
function getRecentHistory(chatId, limit) {
  if (!chatId) return [];
  if (isStatus(chatId) || isGroup(chatId) || isNewsletter(chatId) || isLid(chatId)) return [];
  const p = pathFor(chatId);
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (_) {
    return [];
  }
  const lim = Number.isFinite(limit) ? limit : 6;
  // Match the header line + capture the body up to the next header or EOF.
  // The header pattern: **[YYYY-MM-DD HH:MM:SS] [direction] name**
  const blocks = [];
  const re = /\*\*\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(in |out)\] (.+?)\*\*\n([\s\S]*?)(?=\n\*\*\[|\n*$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const ts = m[1];
    const direction = m[2].trim(); // "in" or "out"
    const content = (m[4] || '').replace(/\s+$/, '');
    if (!content) continue;
    blocks.push({ role: direction === 'in' ? 'user' : 'assistant', content, ts });
  }
  if (blocks.length === 0) return [];
  // Drop the last (most recent) entry — the trigger is processing it now.
  // Then take the previous `lim` messages.
  const previous = blocks.slice(0, -1);
  return previous.slice(-lim);
}

module.exports = {
  record,
  recordFromBaileys,
  getStats,
  flush,
  markLogged,
  wasLogged,
  fileNameFor,
  pathFor,
  reset,
  registerLid,
  listLidMappings,
  resolveJid,
  setSelfPn,
  getSelfPn,
  clearIdentity,
  getRecentHistory,
  // NEW (BUG-DISPATCHER-EPHEMERAL fix, 2026-07-14): exported so the dispatcher
  // at src/index.js can unwrap ephemeralMessage / viewOnce / viewOnceV2 /
  // documentWithCaption wrappers identically to how the inbox writer does.
  // Without this, chats with disappearing messages enabled produce a body
  // of '' and the AI trigger bails on empty_body.
  extractText,
};
