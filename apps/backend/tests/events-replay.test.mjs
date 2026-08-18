/**
 * BUG-PUSH-EVENTS-REPLAY fix (2026-08-03): the events module exposes a
 * per-topic circular buffer + replaySince() so SSE clients reconnecting
 * with Last-Event-ID get the events they missed.
 *
 * Pure in-process unit tests; no DB / network required.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const events = (await import('../src/api/events.js')).default
  ?? (await import('../src/api/events.js'));

describe('events circular buffer + replay (BUG-PUSH-EVENTS-REPLAY)', () => {
  beforeEach(() => {
    events._clearAll();
  });

  it('records events with a monotonic id per topic', () => {
    events.publish('chat-A', 'message.created', { id: 'm1' });
    events.publish('chat-A', 'message.created', { id: 'm2' });
    events.publish('chat-A', 'message.created', { id: 'm3' });
    const replayed = events.replaySince('chat-A', 0);
    expect(replayed.length).toBe(3);
    expect(replayed[0].id).toBeLessThan(replayed[1].id);
    expect(replayed[1].id).toBeLessThan(replayed[2].id);
    expect(replayed[2].data).toEqual({ id: 'm3' });
  });

  it('keeps separate per-topic ids', () => {
    events.publish('chat-A', 'message.created', { id: 'A1' });
    events.publish('chat-B', 'message.created', { id: 'B1' });
    events.publish('chat-A', 'message.created', { id: 'A2' });
    expect(events.replaySince('chat-A', 0).map((e) => e.data.id)).toEqual(['A1', 'A2']);
    expect(events.replaySince('chat-B', 0).map((e) => e.data.id)).toEqual(['B1']);
  });

  it('replaySince(sinceId) returns only events with id > sinceId', () => {
    events.publish('chat-A', 'message.created', { id: 'm1' });
    events.publish('chat-A', 'message.created', { id: 'm2' });
    events.publish('chat-A', 'message.created', { id: 'm3' });
    const all = events.replaySince('chat-A', 0);
    const secondId = all[1].id;
    const after = events.replaySince('chat-A', secondId);
    expect(after.length).toBe(1);
    expect(after[0].data.id).toBe('m3');
  });

  it('replaySince returns empty array for unknown sinceId (e.g. client never seen)', () => {
    events.publish('chat-A', 'message.created', { id: 'm1' });
    expect(events.replaySince('chat-A', 999999)).toEqual([]);
  });

  it('replaySince returns empty array when no sinceId given', () => {
    events.publish('chat-A', 'message.created', { id: 'm1' });
    expect(events.replaySince('chat-A', undefined)).toEqual([]);
    expect(events.replaySince('chat-A', NaN)).toEqual([]);
  });

  it('circular buffer caps at RECENT_BUFFER_SIZE', async () => {
    const RECENT_BUFFER_SIZE = events.RECENT_BUFFER_SIZE;
    for (let i = 0; i < RECENT_BUFFER_SIZE + 5; i++) {
      events.publish('chat-A', 'message.created', { id: `m${i}` });
    }
    const replayed = events.replaySince('chat-A', 0);
    expect(replayed.length).toBe(RECENT_BUFFER_SIZE);
    // The first 5 were dropped; the oldest kept is m5.
    expect(replayed[0].data.id).toBe(`m5`);
    expect(replayed[replayed.length - 1].data.id).toBe(`m${RECENT_BUFFER_SIZE + 4}`);
  });

  it('live subscribers receive new events but not historical', () => {
    events.publish('chat-A', 'message.created', { id: 'm1' });
    const received = [];
    events.subscribe('chat-A', { write: (c) => received.push(c), end: () => {} });
    events.publish('chat-A', 'message.created', { id: 'm2' });
    expect(received.length).toBe(1);
    // m1 was pre-subscription; only m2 is delivered to live subscriber.
    expect(received[0]).toContain('id:');
    expect(received[0]).toContain('"id":"m2"');
  });

  it('publishes events with id in the SSE frame format (id:event:data)', () => {
    let received;
    events.subscribe('chat-A', { write: (c) => { received = c; }, end: () => {} });
    events.publish('chat-A', 'message.created', { id: 'm1', text: 'hello' });
    expect(received).toMatch(/^id: \d+\n/);
    expect(received).toMatch(/\nevent: message\.created\n/);
    expect(received).toMatch(/\ndata: /);
    expect(received).toMatch(/\n\n$/);
  });
});
