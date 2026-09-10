/**
 * Single-instance lock staleness detection.
 *
 * Regression guard for a Docker-fatal bug: the predicate used to return
 * `true` (holder alive) when the lock's pid matched our own. Inside a
 * container the app is always pid 1, so the lock written by the previous
 * container always matched, and every restart refused to boot with
 * "Another instance of this server is already running (pid 1)".
 */
import { describe, it, expect } from 'vitest';
import os from 'os';

const { isLockHolderAlive } = await import('../src/utils/instanceLock.js');

const HERE = os.hostname();

describe('isLockHolderAlive', () => {
  it('treats a lock recording our own pid as stale', () => {
    // We are in acquire() — we cannot already be running as ourselves.
    // This is the container-restart case (pid 1 both times).
    expect(isLockHolderAlive({ pid: process.pid, hostname: HERE })).toBe(false);
  });

  it('treats pid 1 from a different container as stale', () => {
    expect(isLockHolderAlive({ pid: 1, hostname: 'b18f48496032' })).toBe(false);
  });

  it('treats a lock from another host as stale', () => {
    // Its pid is meaningless in our namespace, so it cannot be probed.
    expect(isLockHolderAlive({ pid: 4242, hostname: `${HERE}-somewhere-else` })).toBe(false);
  });

  it('reports a genuinely running process as alive', () => {
    expect(isLockHolderAlive({ pid: process.ppid, hostname: HERE })).toBe(true);
  });

  it('reports a dead pid as stale', () => {
    expect(isLockHolderAlive({ pid: 999999, hostname: HERE })).toBe(false);
  });

  it('handles missing or malformed locks without throwing', () => {
    expect(isLockHolderAlive(null)).toBe(false);
    expect(isLockHolderAlive(undefined)).toBe(false);
    expect(isLockHolderAlive({})).toBe(false);
    expect(isLockHolderAlive({ pid: 0, hostname: HERE })).toBe(false);
  });

  it('still probes by pid when the lock predates the hostname field', () => {
    // Older locks had no hostname; fall back to a pid probe rather than
    // assuming stale, so a real second process on this host is still caught.
    expect(isLockHolderAlive({ pid: process.ppid })).toBe(true);
    expect(isLockHolderAlive({ pid: 999999 })).toBe(false);
  });
});
