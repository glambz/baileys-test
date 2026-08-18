/**
 * SSE helper unit tests (no DB required).
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * The helper is a thin wrapper around Express `res` that emits
 * `event: <name>\ndata: <json>\n\n` frames and tracks state so callers
 * can't double-close the stream.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

function fakeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString('utf8'));
      cb();
    },
  });
  res.headers = {};
  res._chunks = chunks;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.flushHeaders = () => {};
  res.end = (chunk) => {
    if (chunk) chunks.push(chunk.toString('utf8'));
    res._ended = true;
  };
  res.on = EventEmitter.prototype.on.bind(res);
  res.once = EventEmitter.prototype.once.bind(res);
  res.emit = EventEmitter.prototype.emit.bind(res);
  return res;
}

describe('ai/stream helper', () => {
  it('is exported from src/api/stream.js', async () => {
    const mod = await import('../src/api/stream.js');
    expect(typeof mod.attachSse).toBe('function');
  });
});

describe('attachSse', () => {
  it('sets the right SSE headers and flushHeaders', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res);
    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.headers['Cache-Control']).toMatch(/no-cache/);
    expect(res.headers['Connection']).toBe('keep-alive');
    expect(res.headers['X-Accel-Buffering']).toBe('no');
    sse.end();
  });

  it('writes event: name + data: json + terminating blank line', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res);
    sse.send('chunk', { delta: 'hello' });
    const out = res._chunks.join('');
    expect(out).toContain('event: chunk\n');
    expect(out).toContain('data: {"delta":"hello"}\n');
    expect(out.endsWith('\n\n')).toBe(true);
    sse.end();
  });

  it('send(done) writes a done event and closes the stream', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res);
    sse.send('done', { answer: 'ok', confidence: 0.9 });
    const out = res._chunks.join('');
    expect(out).toContain('event: done');
    expect(out).toContain('"answer":"ok"');
    expect(res._ended).toBe(true);
  });

  it('send() after end() is a no-op (no crash, no extra write)', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res);
    sse.end();
    const lenBefore = res._chunks.length;
    sse.send('chunk', { delta: 'too late' });
    expect(res._chunks.length).toBe(lenBefore);
  });

  it('send(error) writes an error event and closes the stream', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res);
    sse.send('error', { message: 'boom' });
    const out = res._chunks.join('');
    expect(out).toContain('event: error');
    expect(out).toContain('"message":"boom"');
    expect(res._ended).toBe(true);
  });

  it('startHeartbeat schedules a heartbeat that can be cleared by end()', async () => {
    const { attachSse } = await import('../src/api/stream.js');
    const res = fakeRes();
    const sse = attachSse(res, { heartbeatMs: 5 });
    // Don't await — just allow the timer to fire at least once.
    await new Promise((r) => setTimeout(r, 25));
    sse.end();
    const out = res._chunks.join('');
    expect(out).toMatch(/^: heartbeat/m);
  });
});
