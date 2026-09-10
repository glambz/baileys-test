/**
 * SSE endpoint tests (BUG-PUSH-EVENTS feature, 2026-08-03).
 *
 * BE exposes GET /api/chats/:id/events as text/event-stream. It streams
 * events emitted by the in-process pub/sub on the chatId topic.
 * Events: message.created, chat.mode.changed, chat.handoff.
 *
 * This is the RED phase. The test will fail because the endpoint does
 * not exist yet.
 */
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { Readable } from 'node:stream';

const HAS_DB = !!process.env.DATABASE_URL;

async function getSse(port, chatId) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/chats/${encodeURIComponent(chatId)}/events`,
      headers: {},
      method: 'GET',
    });
    req.on('response', (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
      const chunks = [];
      const finish = () => resolve(Buffer.concat(chunks).toString('utf8'));
      res.on('data', (c) => chunks.push(c));
      res.on('end', finish);
      // An SSE response never ends on its own, so the 1.5s destroy below IS
      // this test's cancellation. That surfaces as `Error: aborted` on the
      // response stream, which was wired straight into reject() — so the
      // test failed on its own cancellation, every run, no matter how the
      // endpoint behaved. Deliberate cancellation resolves with what we
      // collected; anything else is still a real error.
      res.on('aborted', finish);
      res.on('close', finish);
      res.on('error', (err) => (err && err.code === 'ECONNRESET' ? finish() : reject(err)));
    });
    req.on('error', (err) => (err && err.code === 'ECONNRESET' ? undefined : reject(err)));
    req.end();
    // Cancel after 1.5s — we'll have enough chunks by then.
    setTimeout(() => req.destroy(), 1500);
  });
}

async function startBe(port) {
  // The BE is expected to be running already at port 3000 in dev. These
  // tests assume the BE's buildApp() is exposed at /api/chats/:id/events.
  // If the BE is up, listening at ${port}, this is a no-op.
  // We don't actually start the BE here — we just verify the endpoint responds.
  return { port, reachable: true };
}

describe('SSE chat endpoint (BUG-PUSH-EVENTS feature)', () => {
  it('GET /api/chats/:id/events returns text/event-stream with Content-Type', async () => {
    if (!HAS_DB) return; // skip the live-HTTP test when DB isn't available
    const port = 3000;
    const chatId = '6281236012938@s.whatsapp.net';
    // Stream the SSE for 1s; capture the headers and the retry line.
    const text = await getSse(port, chatId);
    expect(text).toContain('retry:');
  });

  it('subscribers receive message.created events for the chatId topic', async () => {
    // Direct test of the in-process pub/sub (no BE needed).
    const events = (await import('../src/api/events.js')).default ?? (await import('../src/api/events.js'));
    const chatId = 'TEST-CHAT-1';
    const cs = [];
    const sub = events.subscribe(chatId, {
      write: (c) => cs.push(c),
      end: () => {},
    });
    events.publish(chatId, 'message.created', { id: 'm1', text: 'hello' });
    // The subscriber should have received an SSE frame.
    expect(cs.join('')).toContain('event: message.created');
    expect(cs.join('')).toContain('"id":"m1"');
    sub();
  });

  it('different chatIds do not cross-pollinate', async () => {
    const events = (await import('../src/api/events.js')).default ?? (await import('../src/api/events.js'));
    const csA = [];
    const csB = [];
    events.subscribe('chat-A', { write: (c) => csA.push(c), end: () => {} });
    events.subscribe('chat-B', { write: (c) => csB.push(c), end: () => {} });
    events.publish('chat-A', 'message.created', { id: 'mA' });
    expect(csA.join('')).toContain('"id":"mA"');
    expect(csB.join('')).toBe('');
  });

  it('unsubscribe stops delivery', async () => {
    const events = (await import('../src/api/events.js')).default ?? (await import('../src/api/events.js'));
    const cs = [];
    const sub = events.subscribe('chat-X', { write: (c) => cs.push(c), end: () => {} });
    events.publish('chat-X', 'message.created', { id: 'm1' });
    expect(cs.length).toBeGreaterThan(0);
    sub();
    cs.length = 0;
    events.publish('chat-X', 'message.created', { id: 'm2' });
    expect(cs.length).toBe(0);
  });
});
