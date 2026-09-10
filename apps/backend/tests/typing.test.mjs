'use strict';
/**
 * Vitest spec for src/whatsapp/typing.js — the typing indicator helper.
 *
 * What we cover:
 *  - safeSend: calls sock.sendPresenceUpdate(type, jid) when a socket is
 *    present, silently no-ops when not.
 *  - startTyping: emits "composing" immediately, schedules a periodic
 *    refresh, and the returned stop() emits "paused" and clears the
 *    interval.
 *  - Errors from sendPresenceUpdate are caught (typing never breaks a
 *    real send).
 *  - stop() is idempotent and safe to call when the socket is null.
 *
 * Note: safeSend dispatches the actual call as a microtask
 * (Promise.resolve().then(...)). All assertions therefore await a
 * microtask drain before checking the spy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { startTyping, _internal } = await import('../src/whatsapp/typing.js');

function makeFakeSock() {
  return {
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
  };
}

async function drainMicrotasks() {
  // Two microtask hops to be safe: the dispatched call, and its .then
  // handler that resolves before any subsequent assertion runs.
  await Promise.resolve();
  await Promise.resolve();
}

describe('whatsapp/typing — safeSend', () => {
  it('calls sock.sendPresenceUpdate with the given type and jid', async () => {
    const sock = makeFakeSock();
    _internal.safeSend(sock, '12345@s.whatsapp.net', 'composing');
    await drainMicrotasks();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith(
      'composing',
      '12345@s.whatsapp.net'
    );
  });

  it('is a no-op when the socket is null', () => {
    expect(() => _internal.safeSend(null, 'x@s.whatsapp.net', 'composing')).not.toThrow();
  });

  it('is a no-op when sendPresenceUpdate is missing', () => {
    expect(() => _internal.safeSend({}, 'x@s.whatsapp.net', 'composing')).not.toThrow();
  });

  it('is a no-op when jid is missing', async () => {
    const sock = makeFakeSock();
    _internal.safeSend(sock, null, 'composing');
    await drainMicrotasks();
    expect(sock.sendPresenceUpdate).not.toHaveBeenCalled();
  });

  it('swallows rejections from sendPresenceUpdate', async () => {
    const sock = {
      sendPresenceUpdate: vi.fn().mockRejectedValue(new Error('boom')),
    };
    _internal.safeSend(sock, 'x@s.whatsapp.net', 'composing');
    // Give the catch handler time to run; should not throw.
    await new Promise((r) => setTimeout(r, 5));
    expect(sock.sendPresenceUpdate).toHaveBeenCalled();
  });
});

describe('whatsapp/typing — startTyping / stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits composing immediately on start', async () => {
    const sock = makeFakeSock();
    startTyping(sock, '12345@s.whatsapp.net');
    // safeSend dispatches the call as a microtask; vi.useFakeTimers does
    // not intercept microtasks, so a single await is enough.
    await Promise.resolve();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    expect(sock.sendPresenceUpdate).toHaveBeenLastCalledWith(
      'composing',
      '12345@s.whatsapp.net'
    );
  });

  it('refreshes composing on the REFRESH_MS cadence', async () => {
    const sock = makeFakeSock();
    startTyping(sock, '12345@s.whatsapp.net');
    // Initial call dispatched as a microtask.
    await Promise.resolve();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    // Just under one interval: no new call.
    vi.advanceTimersByTime(_internal.REFRESH_MS - 1);
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    // Cross the interval boundary: 1 more call.
    vi.advanceTimersByTime(1);
    // Drain the microtask from the interval's safeSend dispatch.
    await Promise.resolve();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(2);
    // Several more intervals.
    for (let i = 0; i < 3; i += 1) {
      vi.advanceTimersByTime(_internal.REFRESH_MS);
      await Promise.resolve();
    }
    expect(sock.sendPresenceUpdate.mock.calls.length).toBeGreaterThanOrEqual(4);
    for (const call of sock.sendPresenceUpdate.mock.calls) {
      expect(call[0]).toBe('composing');
    }
  });

  it('stop() emits paused and clears the interval', async () => {
    const sock = makeFakeSock();
    const stop = startTyping(sock, '12345@s.whatsapp.net');
    await Promise.resolve();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    stop();
    await Promise.resolve();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(2);
    expect(sock.sendPresenceUpdate).toHaveBeenLastCalledWith(
      'paused',
      '12345@s.whatsapp.net'
    );
    // Advance well past REFRESH_MS: no further calls.
    vi.advanceTimersByTime(_internal.REFRESH_MS * 5);
    await Promise.resolve();
    const composingAfterStop = sock.sendPresenceUpdate.mock.calls.filter(
      (c) => c[0] === 'composing'
    ).length;
    expect(composingAfterStop).toBe(1);
  });

  it('stop() is idempotent', async () => {
    const sock = makeFakeSock();
    const stop = startTyping(sock, '12345@s.whatsapp.net');
    await Promise.resolve();
    stop();
    await Promise.resolve();
    const callsBefore = sock.sendPresenceUpdate.mock.calls.length;
    stop();
    stop();
    expect(sock.sendPresenceUpdate.mock.calls.length).toBe(callsBefore);
  });

  it('returns a no-op when the socket is null', () => {
    const stop = startTyping(null, 'x@s.whatsapp.net');
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });
});
