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

// Upper bound on the remove-companion-device round trip. Baileys' own
// defaultQueryTimeoutMs is 60s, which is far too long to hold an HTTP
// request open on a socket that may be half-open.
const UNLINK_TIMEOUT_MS = 15_000;

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
    this._reconnectPending = false;
    this._wasEverOpen = false;
    this._sockGen = 0;
  }

  isConnected() {
    if (this.state !== CONNECTION_STATES.OPEN) return false;
    if (!this.sock) return false;
    // Baileys wraps the socket: `sock.ws` is a WebSocketClient exposing
    // isOpen/isClosed/isClosing getters, and the raw ws lives at `sock.ws.socket`.
    // The old check read `ws.readyState`, which the wrapper does not define, so
    // `typeof undefined === 'number'` was false and this fell straight through
    // to `return true` — the liveness test has never actually run, and every
    // caller (sendTextMessage included) treated a half-dead socket as usable.
    const ws = this.sock.ws;
    if (!ws) return true;
    if (typeof ws.isOpen === 'boolean') return ws.isOpen;
    if (typeof ws.readyState === 'number') return ws.readyState === 1; // OPEN
    return true;
  }

  getStatus() {
    return {
      state: this.state,
      connected: this.isConnected(),
      user: this.user,
      lastError: this.lastError,
      reconnectAttempts: this._reconnectAttempts,
      // Without these, a client stuck mid-initialize looks identical to an
      // idle one: state 'close', no error, nothing pending. That ambiguity is
      // what made a latched _initializing invisible until the logs were read.
      initializing: this._initializing,
      reconnectPending: this._reconnectPending,
    };
  }

  getSocket() {
    return this.sock;
  }

  async initialize() {
    if (this._tearingDown) {
      logger.warn('Tear-down in progress, refusing new initialize()');
      return { started: false, reason: 'tearing-down' };
    }
    if (this._initializing) {
      logger.warn('Initialize already in progress');
      return { started: false, reason: 'already-initializing' };
    }
    if (this.sock) {
      logger.info(
        { state: this.state },
        'Socket already exists, skipping initialize()'
      );
      return { started: false, reason: 'socket-exists' };
    }

    this._initializing = true;
    this.state = CONNECTION_STATES.CONNECTING;
    this.lastError = null;
    this._sockGen += 1;
    const myGen = this._sockGen;
    let started = false;

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

      // A teardown that lands between _sockGen++ above and this assignment
      // would otherwise be undone here, publishing an already-dead socket as
      // the live one. Until now the _initializing latch hid this by refusing
      // any overlapping initialize(); clearing that latch correctly (above)
      // makes the overlap reachable, so the generation is checked directly.
      if (this._sockGen !== myGen) {
        logger.warn({ myGen, currentGen: this._sockGen }, 'Discarding socket from a superseded initialize()');
        try {
          sock.end();
        } catch (_) {
          /* nothing to salvage */
        }
        this._initializing = false;
        return;
      }
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

      // Reported so a caller can tell "a connect attempt is now under way"
      // from "I declined to start one". All three guards above used to bare
      // return, exactly like success, so POST /api/auth/init answered
      // "authentication initiated" while doing nothing at all — which is how
      // a wedged client stayed invisible through repeated init attempts.
      started = true;

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
    return { started, reason: started ? null : 'superseded' };
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
        // Two awaits happened above; a teardown in that window means this QR
        // belongs to a socket that no longer exists, and publishing it would
        // show the operator a code that can never complete.
        if (this._sockGen !== gen) return;
        this.lastQR = dataUrl;
        this.lastQRBuffer = buffer;
        this.state = CONNECTION_STATES.QR;
        logger.info('New QR code generated. Scan with WhatsApp > Linked Devices.');
      } catch (err) {
        // Rendering failed, but the socket is still alive and will emit
        // another qr event. Releasing the latch here matters because it used
        // to sit inside this try, after the awaits, so a qrcode failure
        // latched initialize() shut for good.
        logger.error({ err }, 'Failed to generate QR code');
      } finally {
        this._initializing = false;
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
      // `user` described a live pairing; it was only ever nulled by
      // _clearSession(), so a plain disconnect left /api/auth/status naming
      // the account as though it were still attached.
      this.user = null;
      // This connect attempt is over. Without this the latch set by
      // initialize() survives forever whenever a socket dies BEFORE it ever
      // emits a qr event or reaches 'open' — which is exactly what a
      // WebSocket-level failure (ECONNREFUSED, DNS, TLS) does. It was only
      // cleared in the 'qr' and 'open' branches, so after one refused
      // connection every later initialize() returned at "Initialize already
      // in progress", the scheduled reconnect below cancelled itself on the
      // same flag, and the service sat closed until the container restarted.
      this._initializing = false;
      this.lastError =
        lastDisconnect?.error?.message || 'Connection closed';
      logger.warn(
        { statusCode, isLoggedOut, lastError: this.lastError },
        'WhatsApp connection closed'
      );

      // Tear down the dead socket so the next initialize() is clean.
      await this._teardownSocket();

      // A 401 is WhatsApp explicitly rejecting these credentials, which is
      // categorically different from a network blip (no statusCode) — so the
      // statusCode alone is the right test. The extra `_wasEverOpen` conjunct
      // made the wipe process-local: after a container restart the flag is
      // false again, so invalidated credentials were kept and the client
      // reconnect-looped on them forever without ever issuing a QR.
      if (isLoggedOut) {
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
      // Snapshot the generation AS OF SCHEDULING, not the dead socket's.
      // _teardownSocket() above increments _sockGen, so the old check
      // `this._sockGen !== gen` compared against the generation that had
      // just been superseded and was therefore ALWAYS true — every
      // scheduled reconnect returned at that line and auto-reconnect never
      // ran once, for any disconnect. The intent was "abort if something
      // newer has happened since we scheduled", which is what this does.
      const genAtSchedule = this._sockGen;
      this._reconnectPending = true;
      setTimeout(() => {
        this._reconnectPending = false;
        // Guard against stale generation and overlapping re-init
        if (this._sockGen !== genAtSchedule) return;
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
    this._reconnectPending = false;
    this._wasEverOpen = false;
    return files;
  }

  /**
   * True while creds.json is on disk. That file is the only thing that can
   * authenticate a `remove-companion-device`, so "are the credentials gone?"
   * is the question the operator actually needs answered — not "did our
   * delete loop throw?", which is what sessionCleared used to report.
   */
  _credsExist() {
    try {
      return fs.existsSync(path.join(config.whatsapp.sessionDir, 'creds.json'));
    } catch (_) {
      return false;
    }
  }

  /**
   * Log out: unlink this device from WhatsApp, wipe the local session, and
   * forget the account's learned identity.
   *
   * Order matters. Baileys' sock.logout() sends `remove-companion-device`
   * over the live socket, so it has to run BEFORE the socket is torn down —
   * otherwise the device stays listed under Linked Devices on the phone and
   * only the local copy is discarded.
   *
   * The unlink used to be gated on isConnected(). When the socket was down
   * the whole block was skipped: no request, no error, and a reply of
   * deviceUnlinked:false / unlinkError:null that is indistinguishable from
   * success. The local wipe then ran anyway and deleted creds.json — the one
   * credential that can ever send the unlink — so the device was stranded on
   * the operator's phone permanently, consuming a linked-device slot with no
   * way back short of removing it by hand. Connectivity is now a diagnostic,
   * not a precondition, and the wipe is gated on the outcome of the thing
   * that was actually requested.
   *
   * @param {{unlinkDevice?: boolean, force?: boolean}} [opts]
   *   unlinkDevice:false — keep the device paired, drop only the local session.
   *   force:true — wipe locally even though the unlink failed, accepting that
   *     the device stays listed on the phone until removed there by hand.
   */
  async logout(opts) {
    const unlinkDevice = !opts || opts.unlinkDevice !== false;
    const force = Boolean(opts && opts.force);
    let deviceUnlinked = false;
    let unlinkError = null;

    // NOTE ON WHAT deviceUnlinked CAN MEAN. Baileys' logout() sends the
    // remove-companion-device iq via sendNode() and then ends the socket
    // itself; it never waits for WhatsApp to acknowledge the removal. So a
    // resolved call means "the unlink request left this machine", which is
    // the strongest fact available here — not "the phone has dropped the
    // device". The gate below is still correct (a request that was never
    // even sent must not cost us the credentials), but the wording of the
    // result deliberately stops short of claiming confirmed removal.
    if (unlinkDevice) {
      if (!this.sock) {
        unlinkError =
          'Not connected to WhatsApp, so the unlink was never sent. Reconnect and log out again, ' +
          'or repeat with force to discard the local session and remove the device from your phone by hand.';
        logger.warn('Logout requested with no socket; unlink not attempted');
      } else {
        try {
          // Bounded deliberately. Baileys' logout() writes the
          // remove-companion-device iq with sendNode(), whose write is capped
          // by connectTimeoutMs — 60s here — and a half-open TCP connection
          // still reports ws.readyState === 1, so an unbounded await can hang
          // this HTTP request for a full minute and 504 behind a proxy before
          // the operator ever sees the result. On an already-closed socket it
          // throws 'Connection Closed' immediately instead, which is why
          // attempting the unlink unconditionally is safe.
          await Promise.race([
            this.sock.logout(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('unlink timed out after 15s')), UNLINK_TIMEOUT_MS)
            ),
          ]);
          deviceUnlinked = true;
        } catch (err) {
          unlinkError = String((err && err.message) || err);
          logger.warn({ err }, 'WhatsApp device unlink failed');
        }
      }
    }

    // Keep the credentials when the caller asked for an unlink that did not
    // happen: destroying them is irreversible and strands the device.
    const keepCreds = unlinkDevice && !deviceUnlinked && !force;

    await this._teardownSocket();
    // Every path here ends any in-flight connect attempt. Leaving the latch
    // set left the client unable to re-pair at all: no credentials, and
    // initialize() refusing with "Initialize already in progress".
    this._initializing = false;

    if (keepCreds) {
      this.state = CONNECTION_STATES.CLOSE;
      this.user = null;
      this.lastQR = null;
      this.lastQRBuffer = null;
      // Reported as the reason this logout stopped short, rather than
      // whatever killed the previous socket.
      this.lastError = unlinkError;
      return {
        message:
          'Logout stopped: the device could not be unlinked, so the local session was kept. ' +
          'Reconnect and log out again to unlink it properly, or retry with force to wipe locally anyway.',
        deviceUnlinked: false,
        sessionCleared: false,
        credentialsKept: true,
        filesRemoved: 0,
        filesFailed: [],
        unlinkError,
      };
    }

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
    // A stale error from the socket that just died was being served by
    // /api/auth/status long after the session it belonged to was gone.
    this.lastError = null;

    // "No credentials remain" rather than "our delete loop did not throw".
    // A successful sock.logout() makes Baileys emit close(401), whose handler
    // already wipes the directory, so the old check reported filesRemoved:0
    // with sessionCleared:true on the happy path and could not distinguish
    // that from having had nothing to clear.
    const sessionCleared = files.failed.length === 0 && !this._credsExist();
    return {
      message: sessionCleared
        ? (deviceUnlinked
          ? 'Logged out and the unlink request was sent, so the device should drop off Linked Devices. Local session cleared.'
          : 'Local session cleared. The device may still appear under Linked Devices.')
        : 'Logout incomplete: some session files could not be removed.',
      deviceUnlinked,
      sessionCleared,
      credentialsKept: false,
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
// The app uses the singleton; the class is exported so the connection
// lifecycle can be driven in tests without opening a real socket.
module.exports.WhatsAppClient = WhatsAppClient;
