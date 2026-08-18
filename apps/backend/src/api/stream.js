'use strict';
/**
 * SSE helper for the AI chat stream endpoint.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * Wraps an Express `res` so the controller can write `event: name` /
 * `data: json` frames without juggling raw strings. Tracks an `ended`
 * flag so duplicate sends after `end()` are silently dropped — this
 * matters because the LLM stream can resolve mid-flight while the
 * client also disconnects, and we must not crash on `write after end`.
 */

function attachSse(res, opts = {}) {
  const heartbeatMs = opts.heartbeatMs || 0; // 0 = disabled
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable response buffering on common proxies (nginx + cloudflare).
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let ended = false;
  let heartbeat = null;

  function writeRaw(s) {
    if (ended) return;
    try {
      res.write(s);
    } catch (_) {
      // Sink may be closed; drop the write silently.
    }
  }

  function send(event, data) {
    if (ended) return;
    const payload = JSON.stringify(data ?? {});
    writeRaw(`event: ${event}\ndata: ${payload}\n\n`);
    if (event === 'done' || event === 'error') {
      end();
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    try { res.end(); } catch (_) { /* already closed */ }
  }

  if (heartbeatMs > 0) {
    heartbeat = setInterval(() => writeRaw(`: heartbeat\n\n`), heartbeatMs);
  }

  // If the client disconnects, mark ended so subsequent sends are no-ops.
  res.on?.('close', () => { end(); });

  return { send, end };
}

module.exports = { attachSse };
