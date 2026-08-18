'use strict';
/**
 * WhatsApp "typing…" indicator helper.
 *
 * Wraps `sock.sendPresenceUpdate('composing', jid)` with a periodic refresh.
 * Baileys sends the composing state once, but the WhatsApp server
 * auto-clears the indicator after ~5-6 s if it is not refreshed. For long
 * operations (LLM call, anti-ban throttle, broadcast delay), we re-emit
 * the presence on a fixed cadence so the recipient keeps seeing "typing…"
 * for the whole duration of the in-flight send.
 *
 * Usage:
 *   const stop = startTyping(sock, jid);
 *   try {
 *     await doLongSend(...);
 *   } finally {
 *     stop();
 *   }
 *
 * The returned `stop()` function is idempotent and safe to call from a
 * finally block. All socket errors are swallowed at debug level — a
 * typing indicator must never break a real send. If the socket is
 * disconnected (no `sendPresenceUpdate` function), the helper is a no-op
 * and the returned `stop()` is also a no-op.
 */

const logger = require('../utils/logger');

const COMPOSING_PRESENCE = 'composing';
const PAUSED_PRESENCE = 'paused';
const REFRESH_MS = 4_000;

function safeSend(sock, jid, type) {
  if (!sock || typeof sock.sendPresenceUpdate !== 'function') return;
  if (!jid) return;
  // Fire-and-forget. The send layer must not block on a presence packet.
  Promise.resolve()
    .then(() => sock.sendPresenceUpdate(type, jid))
    .catch((err) => {
      logger.debug(
        { err: err && err.message, jid, type },
        'sendPresenceUpdate failed (ignored)'
      );
    });
}

function startTyping(sock, jid) {
  let stopped = false;
  // Fire the first composing state immediately so the user sees the
  // indicator as soon as we know we're going to send.
  safeSend(sock, jid, COMPOSING_PRESENCE);

  const interval = setInterval(() => {
    if (stopped) return;
    safeSend(sock, jid, COMPOSING_PRESENCE);
  }, REFRESH_MS);
  // Do not keep the event loop alive solely for the indicator.
  if (typeof interval.unref === 'function') interval.unref();

  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    safeSend(sock, jid, PAUSED_PRESENCE);
  };
}

module.exports = {
  startTyping,
  // Exported for tests.
  _internal: { safeSend, REFRESH_MS, COMPOSING_PRESENCE, PAUSED_PRESENCE },
};
