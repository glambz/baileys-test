'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const config = require('../config');
const logger = require('../utils/logger');
const inbox = require('../inbox/writer');

const CONNECTION_STATES = Object.freeze({
  CLOSE: 'close',
  CONNECTING: 'connecting',
  OPEN: 'open',
  QR: 'qr',
});

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.state = CONNECTION_STATES.CLOSE;
    this.lastQR = null;
    this.lastQRBuffer = null;
    this.lastError = null;
    this.user = null;
    this._initializing = false;
    this._tearingDown = false;
    this._reconnectAttempts = 0;
    this._wasEverOpen = false;
    this._sockGen = 0;
  }

  isConnected() {
    if (this.state !== CONNECTION_STATES.OPEN) return false;
    if (!this.sock) return false;
    // Baileys sockets expose the underlying WebSocket via `sock.ws`
    const ws = this.sock.ws;
    if (ws && typeof ws.readyState === 'number') {
      return ws.readyState === 1; // OPEN
    }
    return true;
  }

  getStatus() {
    return {
      state: this.state,
      connected: this.isConnected(),
      user: this.user,
      lastError: this.lastError,
      reconnectAttempts: this._reconnectAttempts,
    };
  }

  getSocket() {
    return this.sock;
  }

  async initialize() {
    if (this._tearingDown) {
      logger.warn('Tear-down in progress, refusing new initialize()');
      return;
    }
    if (this._initializing) {
      logger.warn('Initialize already in progress');
      return;
    }
    if (this.sock) {
      logger.info(
        { state: this.state },
        'Socket already exists, skipping initialize()'
      );
      return;
    }

    this._initializing = true;
    this.state = CONNECTION_STATES.CONNECTING;
    this.lastError = null;
    this._sockGen += 1;
    const myGen = this._sockGen;

    try {
      if (!fs.existsSync(config.whatsapp.sessionDir)) {
        fs.mkdirSync(config.whatsapp.sessionDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(
        config.whatsapp.sessionDir
      );

      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({ version, isLatest }, 'Using Baileys WhatsApp Web version');

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: config.whatsapp.printQRInTerminal,
        logger: pinoLogger(),
        browser: ['WhatsApp-API', 'Chrome', '120.0.0'],
        keepAliveIntervalMs: 25_000,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        fireInitQueries: true,
      });

      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      // Inbound + outbound (phone-sent) + outbound (echoed by some
      // Baileys versions). The explicit outbound paths (sendTextMessage,
      // /api/messages/send, broadcaster) call inbox.markLogged() before
      // they write, so the corresponding events that fire here are
      // skipped via wasLogged() — no duplicates, no losses.
      sock.ev.on('messages.upsert', ({ messages, type }) => {
        for (const msg of messages || []) {
          // Diagnostic file log so we can see exactly what events
          // arrive, even when the foreground log buffer scrolls off.
          try {
            const fs = require('fs');
            const path = require('path');
            const logFile = path.join(config.inbox.dir, 'events.log');
            const line = JSON.stringify({
              ts: new Date().toISOString(),
              ev: 'messages.upsert',
              type,
              fromMe: msg?.key?.fromMe,
              remoteJid: msg?.key?.remoteJid,
              id: msg?.key?.id,
              pushName: msg?.pushName,
              senderLid: msg?.key?.senderLid || null,
              senderPn: msg?.key?.senderPn || null,
              participant: msg?.key?.participant || null,
              participantLid: msg?.key?.participantLid || null,
              participantPn: msg?.key?.participantPn || null,
              hasMessage: !!msg?.message,
              hasConversation: !!msg?.message?.conversation,
              preview: (msg?.message?.conversation || '').slice(0, 80),
            }) + '\n';
            fs.appendFileSync(logFile, line, 'utf8');
          } catch (_) { /* never block on logging */ }

          if (inbox.wasLogged(msg?.key?.id)) continue;
          logger.warn(
            {
              fromMe: msg?.key?.fromMe,
              remoteJid: msg?.key?.remoteJid,
              id: msg?.key?.id,
              pushName: msg?.pushName,
              type,
              hasMessage: !!msg?.message,
            },
            'inbox.messages.upsert'
          );
          try {
            inbox.recordFromBaileys(msg);
          } catch (err) {
            logger.error({ err }, 'Inbox record failed');
          }

          // BUG-PUSH-EVENTS feature (2026-08-03): emit a message.created
          // event on the chat topic so any FE SSE subscribers see the new
          // message in real time. The publish is pub/sub (Map<chatId,
          // Set<writer>>) so a subscriber failure here never blocks the
          // Baileys event loop.
          try {
            const events = require('../api/events');
            const resolvedChatId = typeof inbox.resolveJid === 'function'
              ? inbox.resolveJid(msg?.key?.remoteJid)
              : msg?.key?.remoteJid;
            events.publish(resolvedChatId, 'message.created', {
              id: msg?.key?.id,
              chatId: resolvedChatId,
              direction: msg?.key?.fromMe ? 'out' : 'in',
              bodyLength: (msg?.message?.conversation || '').length,
              timestamp: msg?.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000),
              senderName: msg?.pushName || null,
            });
          } catch (_) { /* never block on logging */ }
        }
      });

      // Catch-all: log every other Baileys event that fires, so we
      // can see if phone-sent messages reach us via a different
      // channel than messages.upsert.
      const diagEvents = [
        'messages.update',
        'messages.delete',
        'message-receipt.update',
        'messaging-history.set',
        'messaging-history.set-message',
        'chats.upsert',
        'chats.update',
        'chats.delete',
        'contacts.upsert',
        'contacts.update',
        'groups.upsert',
        'group-participants.update',
        'presence.update',
        'blocklist.set',
        'blocklist.update',
      ];
      for (const ev of diagEvents) {
        sock.ev.on(ev, (...args) => {
          try {
            const fs = require('fs');
            const path = require('path');
            const logFile = path.join(config.inbox.dir, 'events.log');
            const line = JSON.stringify({
              ts: new Date().toISOString(),
              ev,
              argc: args.length,
              first: args[0] ? Object.keys(args[0]).slice(0, 20) : null,
            }) + '\n';
            fs.appendFileSync(logFile, line, 'utf8');
          } catch (_) { /* ignore */ }
        });
      }

      sock.ev.on('connection.update', (update) => {
        if (this._sockGen !== myGen) {
          logger.debug(
            { myGen, currentGen: this._sockGen },
            'Ignoring event from stale socket generation'
          );
          return;
        }
        this._handleConnectionUpdate(update, myGen).catch((err) =>
          logger.error({ err }, 'Error handling connection.update')
        );
      });
    } catch (err) {
      this._initializing = false;
      this.state = CONNECTION_STATES.CLOSE;
      this.lastError = err.message;
      logger.error({ err }, 'Failed to initialize WhatsApp client');
      throw err;
    }
  }

  async _handleConnectionUpdate(update, gen) {
    if (this._sockGen !== gen) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const [dataUrl, buffer] = await Promise.all([
          qrcode.toDataURL(qr),
          qrcode.toBuffer(qr, { type: 'png' }),
        ]);
        this.lastQR = dataUrl;
        this.lastQRBuffer = buffer;
        this.state = CONNECTION_STATES.QR;
        this._initializing = false;
        logger.info('New QR code generated. Scan with WhatsApp > Linked Devices.');
      } catch (err) {
        logger.error({ err }, 'Failed to generate QR code');
      }
      return;
    }

    if (connection === CONNECTION_STATES.OPEN) {
      this.state = CONNECTION_STATES.OPEN;
      this._initializing = false;
      this._reconnectAttempts = 0;
      this._wasEverOpen = true;
      this.lastQR = null;
      this.lastQRBuffer = null;
      this.user = {
        id: this.sock?.user?.id || null,
        name: this.sock?.user?.name || null,
      };
      // Tell the inbox writer what our own PN is so it can auto-map
      // self-chat LIDs to the PN-based file.
      if (this.sock?.user?.id) {
        inbox.setSelfPn(this.sock.user.id);
      }
      logger.info({ user: this.user }, 'WhatsApp connection established');
      return;
    }

    if (connection === CONNECTION_STATES.CONNECTING) {
      this.state = CONNECTION_STATES.CONNECTING;
      logger.info('WhatsApp connecting...');
      return;
    }

    if (connection === CONNECTION_STATES.CLOSE) {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      this.state = CONNECTION_STATES.CLOSE;
      this.lastError =
        lastDisconnect?.error?.message || 'Connection closed';
      logger.warn(
        { statusCode, isLoggedOut, lastError: this.lastError },
        'WhatsApp connection closed'
      );

      // Tear down the dead socket so the next initialize() is clean.
      await this._teardownSocket();

      // Only wipe credentials if we had previously been authenticated
      // and WhatsApp explicitly told us we're logged out. Don't wipe on
      // the very first connect failure (wrong creds, network blip, etc).
      if (isLoggedOut && this._wasEverOpen) {
        await this._clearSession();
        logger.info(
          'Logged out from WhatsApp. Session credentials cleared. Call /api/auth/init to re-authenticate.'
        );
        return;
      }

      // Reconnect with exponential backoff (cap 30s). Skip the very first
      // attempt if the user hasn't actually started the auth flow.
      this._reconnectAttempts += 1;
      const delay = Math.min(
        30_000,
        2_000 * Math.pow(2, Math.min(this._reconnectAttempts - 1, 4))
      );
      logger.info(
        { attempt: this._reconnectAttempts, delayMs: delay },
        'Scheduling WhatsApp reconnect'
      );
      setTimeout(() => {
        // Guard against stale generation and overlapping re-init
        if (this._sockGen !== gen) return;
        if (this.sock || this._initializing || this._tearingDown) return;
        this.initialize().catch((err) =>
          logger.error({ err }, 'Auto-reconnect failed')
        );
      }, delay);
    }
  }

  async _teardownSocket() {
    if (this._tearingDown) return;
    this._tearingDown = true;
    try {
      // Bump generation so any in-flight events from this socket are
      // ignored by the handler.
      this._sockGen += 1;
      const oldSock = this.sock;
      this.sock = null;
      if (oldSock) {
        try {
          oldSock.ev.removeAllListeners('connection.update');
          oldSock.ev.removeAllListeners('creds.update');
        } catch (_) {
          // ignore
        }
        try {
          if (typeof oldSock.end === 'function') {
            oldSock.end();
          }
        } catch (_) {
          // ignore
        }
      }
    } finally {
      this._tearingDown = false;
    }
  }

  /**
   * Delete the credential files, then reset in-memory session state.
   *
   * Removes the CONTENTS of sessionDir rather than the directory itself.
   * Under Docker sessionDir (/app/auth_info) is a volume mount point, and
   * `fs.rmSync(mountpoint, {recursive:true})` tries rmdir() first, gets
   * EBUSY, and throws WITHOUT descending into the children. So the old
   * version deleted nothing, the throw skipped the state resets below, and
   * logout() still answered "session cleared" — after which the next
   * initialize() found creds.json intact and silently re-paired the SAME
   * account, with no QR ever issued.
   *
   * @returns {{cleared: number, failed: string[]}} what was actually removed,
   *   so the caller can report honestly instead of assuming success.
   */
  _clearSessionFiles() {
    const dir = config.whatsapp.sessionDir;
    const result = { cleared: 0, failed: [] };
    let entries = [];
    try {
      if (!fs.existsSync(dir)) return result;
      entries = fs.readdirSync(dir);
    } catch (err) {
      logger.error({ err, dir }, 'Could not read session dir while clearing');
      result.failed.push(dir);
      return result;
    }
    for (const name of entries) {
      // Keep the instance lock: it belongs to this running process, and
      // deleting it would let a second instance start alongside us.
      if (name === 'server.lock') continue;
      try {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        result.cleared += 1;
      } catch (err) {
        logger.error({ err, name }, 'Could not remove session file');
        result.failed.push(name);
      }
    }
    return result;
  }

  async _clearSession() {
    const files = this._clearSessionFiles();
    // Reset unconditionally, and AFTER the file work rather than inside its
    // try block, so a filesystem failure can no longer leave this.user
    // reporting the account we just logged out of.
    this.user = null;
    this.lastQR = null;
    this.lastQRBuffer = null;
    this._reconnectAttempts = 0;
    this._wasEverOpen = false;
    return files;
  }

  /**
   * Log out: unlink this device from WhatsApp, wipe the local session, and
   * forget the account's learned identity.
   *
   * Order matters. Baileys' sock.logout() sends `remove-companion-device`
   * over the live socket, so it has to run BEFORE the socket is torn down —
   * otherwise the device stays listed under Linked Devices on the phone and
   * only the local copy is discarded. That was the previous behaviour: this
   * method never called Baileys' logout at all.
   *
   * @param {{unlinkDevice?: boolean}} [opts] pass unlinkDevice:false to keep
   *   the device paired and only drop the local session.
   */
  async logout(opts) {
    const unlinkDevice = !opts || opts.unlinkDevice !== false;
    let deviceUnlinked = false;
    let unlinkError = null;

    if (unlinkDevice && this.sock && this.isConnected()) {
      try {
        await this.sock.logout();
        deviceUnlinked = true;
      } catch (err) {
        // A failed unlink must not block the local wipe — otherwise a
        // network blip leaves the operator unable to switch accounts.
        unlinkError = String((err && err.message) || err);
        logger.warn({ err }, 'WhatsApp device unlink failed; clearing locally anyway');
      }
    }

    await this._teardownSocket();
    const files = await this._clearSession();

    // The LID->PN map and the stored self number describe the account that
    // just left. Keeping them let the old account's mappings rewrite the new
    // account's inbound JIDs after re-pairing.
    try {
      inbox.clearIdentity();
    } catch (err) {
      logger.warn({ err }, 'Could not clear inbox identity on logout');
    }

    this.state = CONNECTION_STATES.CLOSE;

    const sessionCleared = files.failed.length === 0;
    return {
      // Report what happened rather than a fixed success string. The old
      // hardcoded "Logged out and session cleared" was returned even when
      // nothing had been deleted.
      message: sessionCleared
        ? (deviceUnlinked
          ? 'Logged out, device unlinked, and local session cleared.'
          : 'Local session cleared. The device may still appear under Linked Devices.')
        : 'Logout incomplete: some session files could not be removed.',
      deviceUnlinked,
      sessionCleared,
      filesRemoved: files.cleared,
      filesFailed: files.failed,
      unlinkError,
    };
  }

  async shutdown() {
    await this._teardownSocket();
    this.state = CONNECTION_STATES.CLOSE;
  }

  async sendTextMessage(phone, text) {
    if (!this.isConnected() || !this.sock) {
      const err = new Error(
        'WhatsApp is not connected. Initialize auth and scan the QR code first.'
      );
      err.statusCode = 503;
      throw err;
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      const err = new Error('Message text must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }

    const jid = this._toJid(phone);
    const sent = await this.sock.sendMessage(jid, { text });
    logger.info({ jid, messageId: sent?.key?.id }, 'Message sent');

    // Mark the id as already-logged so that any messages.upsert event
    // Baileys later fires for this same message is skipped (avoids
    // duplicate entries on versions that do echo self-sent messages).
    inbox.markLogged(sent?.key?.id);

    // Outbound is logged explicitly here so phone-sent messages are
    // also captured (some Baileys versions do not echo self-sent
    // messages through messages.upsert at all).
    const ts = sent?.messageTimestamp
      ? Number(sent.messageTimestamp)
      : Math.floor(Date.now() / 1000);
    try {
      await inbox.record(jid, {
        direction: 'out',
        pushName: null,
        ts,
        body: text,
        kind: 'text',
      });
    } catch (err) {
      logger.warn({ err }, 'Inbox record (outbound) failed');
    }

    return {
      messageId: sent?.key?.id || null,
      to: jid,
      text,
      timestamp: ts,
    };
  }

  _toJid(phone) {
    const cleaned = String(phone).replace(/[^0-9]/g, '');
    if (cleaned.length < 8 || cleaned.length > 15) {
      const err = new Error(
        `Invalid phone number "${phone}". Expected 8-15 digits, optionally prefixed with country code.`
      );
      err.statusCode = 400;
      throw err;
    }
    return `${cleaned}@s.whatsapp.net`;
  }

  phoneToJid(phone) {
    return this._toJid(phone);
  }
}

function pinoLogger() {
  return require('pino')({ level: config.whatsapp.logLevel });
}

module.exports = new WhatsAppClient();
module.exports.CONNECTION_STATES = CONNECTION_STATES;
