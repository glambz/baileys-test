'use strict';

/**
 * SSE (Server-Sent Events) endpoint for live chat updates.
 *
 * GET /api/chats/:id/events -> text/event-stream
 *
 * Events emitted by the in-process pub/sub (apps/backend/src/api/events.js):
 *   - message.created      new inbound or outbound message persisted
 *   - chat.mode.changed    chat's ai_mode transitions
 *   - chat.handoff         trigger flips to human_pending_flag
 *
 * Replay on reconnect (BUG-PUSH-EVENTS-REPLAY, 2026-08-03):
 *   - Each SSE frame includes an `id:` line (a monotonic per-topic counter).
 *   - When the client reconnects with the `Last-Event-ID` header set, we
 *     replay every event since that id from the per-topic circular buffer
 *     BEFORE starting the live stream. The browser's EventSource API
 *     handles the replay + live stream seamlessly — it sees the replay
 *     as a continuation of the same stream.
 *
 * Auto-reconnect: the FE's EventSource reconnects with no extra logic.
 * Each subscriber adds a 15s heartbeat to keep proxies from closing
 * idle connections.
 */
const events = require('./events');
const logger = require('../utils/logger');

const HEARTBEAT_MS = 15_000;

function formatFrame(env) {
  return (
    `id: ${env.id}\n` +
    `event: ${env.event}\n` +
    `data: ${JSON.stringify({ event: env.event, data: env.data, topic: env.topic })}\n\n`
  );
}

function sseHandler(req, res) {
  const chatId = decodeURIComponent(req.params.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable response buffering on common proxies (nginx + cloudflare).
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // Tell the browser how long to wait before reconnecting.
  res.write(`retry: 3000\n\n`);

  // BUG-PUSH-EVENTS-REPLAY fix (2026-08-03): the browser sends the id
  // of the last received event as `Last-Event-ID` on reconnect. We
  // replay every event since that id from the per-topic circular buffer
  // before subscribing to live events, so the client never misses
  // anything that happened while disconnected.
  const lastEventIdHeader = req.headers['last-event-id'];
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : undefined;
  if (Number.isFinite(lastEventId)) {
    const replayed = events.replaySince(chatId, lastEventId);
    for (const env of replayed) {
      try {
        res.write(formatFrame(env));
      } catch (_) { /* dead writer */ }
    }
    if (replayed.length > 0) {
      logger.info(
        { chatId, lastEventId, replayed: replayed.length },
        'SSE replayed missed events on reconnect',
      );
    }
  }

  const writer = {
    write: (chunk) => res.write(chunk),
    end: () => res.end(),
  };
  const unsubscribe = events.subscribe(chatId, writer);

  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { /* dead writer */ }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch { /* already closed */ }
  });
}

module.exports = { sseHandler };
