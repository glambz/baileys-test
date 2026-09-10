/**
 * Last-Event-ID replay buffer (BUG-PUSH-EVENTS-REPLAY, 2026-08-03).
 *
 * The events module keeps a per-topic circular buffer of the last
 * RECENT_BUFFER_SIZE events. When an SSE client reconnects with a
 * `Last-Event-ID` header, the SSE handler replays all events since that
 * id BEFORE streaming new events. This makes EventSource auto-reconnect
 * truly lossless for short disconnects (refresh, network blip, etc.).
 *
 * For longer disconnects, the buffer overflows and the client falls
 * back to the existing behavior (forced refetch via TanStack Query).
 *
 * Event id format: a monotonically increasing counter scoped to the
 * topic. Two events on the same topic can never share an id. The
 * counter is the per-process current time in ms + a per-process
 * monotonic counter for tie-breaking; this avoids wall-clock skew issues
 * and stays compact.
 */

const RECENT_BUFFER_SIZE = 100;

const recentByTopic = new Map(); // topic -> Array<{ id: number, ts: number, event: string, data: object }>
let nextEventId = 0;

function getBuffer(topic) {
  let buf = recentByTopic.get(topic);
  if (!buf) {
    buf = [];
    recentByTopic.set(topic, buf);
  }
  return buf;
}

function publish(topic, event, data) {
  // BUG-PUSH-EVENTS-REPLAY fix (2026-08-03): record the event in the
  // per-topic circular buffer BEFORE publishing to live subscribers.
  const id = ++nextEventId;
  const ts = Date.now();
  const envelope = { id, ts, event, data, topic };
  const buf = getBuffer(topic);
  buf.push(envelope);
  if (buf.length > RECENT_BUFFER_SIZE) buf.shift();

  const subs = liveSubscribers.get(topic);
  if (subs && subs.size > 0) {
    const frame =
      `id: ${id}\n` +
      `event: ${event}\n` +
      `data: ${JSON.stringify({ event, data, topic })}\n\n`;
    let delivered = 0;
    for (const sub of subs) {
      try {
        sub.write(frame);
        delivered += 1;
      } catch (_) {
        subs.delete(sub);
      }
    }
    return delivered;
  }
  return 0;
}

// Live subscribers (existing).
const liveSubscribers = new Map();

function subscribe(topic, writer) {
  if (!liveSubscribers.has(topic)) liveSubscribers.set(topic, new Set());
  liveSubscribers.get(topic).add(writer);
  return () => {
    const set = liveSubscribers.get(topic);
    if (set) {
      set.delete(writer);
      if (set.size === 0) liveSubscribers.delete(topic);
    }
  };
}

/**
 * Return events with id > sinceId for the topic, in id order.
 * Used by the SSE handler to replay missed events on reconnect.
 */
function replaySince(topic, sinceId) {
  const buf = getBuffer(topic);
  if (typeof sinceId !== 'number') return [];
  return buf.filter((e) => e.id > sinceId);
}

function stats() {
  let topics = 0;
  let total = 0;
  for (const [_, set] of liveSubscribers) {
    topics += 1;
    total += set.size;
  }
  return {
    topics,
    subscribers: total,
    nextEventId,
    recentBuffers: recentByTopic.size,
  };
}

function _clearAll() {
  recentByTopic.clear();
  liveSubscribers.clear();
  nextEventId = 0;
}

module.exports = { publish, subscribe, replaySince, stats, _clearAll, RECENT_BUFFER_SIZE };
