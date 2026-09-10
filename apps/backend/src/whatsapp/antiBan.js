'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function trimToWindow(timestamps, windowMs, now) {
  const cutoff = now - windowMs;
  while (timestamps.length && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  return timestamps;
}

function jitter(amount, factor) {
  const delta = amount * factor;
  return amount + (Math.random() * 2 - 1) * delta;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new Error('cancelled'));
    }
    const t = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('cancelled'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

class AntiBan {
  constructor(opts = {}) {
    this.opts = { ...config.antiBan, ...opts };
    this._hourTimestamps = [];
    this._dayTimestamps = [];
    this._lastSentPerPhone = new Map();
    this._contentHashesPerPhone = new Map();
    this._lastSendAt = 0;
    this._lastCleanup = Date.now();
  }

  isEnabled() {
    return this.opts.enabled !== false;
  }

  _inActiveHours(now = new Date()) {
    const start = this.opts.activeHoursStart;
    const end = this.opts.activeHoursEnd;
    if (start === end) return true;
    const h = now.getHours();
    if (start < end) return h >= start && h < end;
    return h >= start || h < end;
  }

  _maybeCleanup(now) {
    if (now - this._lastCleanup < 60_000) return;
    this._lastCleanup = now;
    trimToWindow(this._hourTimestamps, HOUR_MS, now);
    trimToWindow(this._dayTimestamps, DAY_MS, now);
    const dedupeCutoff = now - this.opts.dedupeWindowMs;
    const coCutoff = now - this.opts.skipIfMessagedWithinMs;
    for (const [phone, ts] of this._lastSentPerPhone) {
      if (ts < coCutoff) this._lastSentPerPhone.delete(phone);
    }
    for (const [phone, hashes] of this._contentHashesPerPhone) {
      for (const [hash, ts] of hashes) {
        if (ts < dedupeCutoff) hashes.delete(hash);
      }
      if (hashes.size === 0) this._contentHashesPerPhone.delete(phone);
    }
  }

  _withinQuotas(now) {
    trimToWindow(this._hourTimestamps, HOUR_MS, now);
    trimToWindow(this._dayTimestamps, DAY_MS, now);
    return (
      this._hourTimestamps.length < this.opts.maxPerHour &&
      this._dayTimestamps.length < this.opts.maxPerDay
    );
  }

  _isDuplicate(phone, contentHash, now) {
    if (!this.opts.dedupeWindowMs) return false;
    const map = this._contentHashesPerPhone.get(phone);
    if (!map) return false;
    const ts = map.get(contentHash);
    return ts != null && now - ts < this.opts.dedupeWindowMs;
  }

  _skipIfRecentlyMessaged(phone, now) {
    if (!this.opts.skipIfMessagedWithinMs) return false;
    const ts = this._lastSentPerPhone.get(phone);
    return ts != null && now - ts < this.opts.skipIfMessagedWithinMs;
  }

  /**
   * Decide whether a send is allowed right now, and what (if any) delay
   * should be applied before the next send. Returns one of:
   *   { kind: 'ok' }                      — proceed immediately
   *   { kind: 'skip', reason }            — do not send
   *   { kind: 'wait', delayMs }           — wait delayMs then re-check
   * Pure: no side effects. Callers invoke `recordSent`/`recordFailure`
   * to mutate state.
   */
  check(phone, contentHash, now = Date.now()) {
    if (!this.isEnabled()) return { kind: 'ok' };
    this._maybeCleanup(now);

    if (!this._inActiveHours(new Date(now))) {
      return { kind: 'skip', reason: 'outside_active_hours' };
    }
    if (this._skipIfRecentlyMessaged(phone, now)) {
      return { kind: 'skip', reason: 'recipient_cooldown' };
    }
    if (this._isDuplicate(phone, contentHash, now)) {
      return { kind: 'skip', reason: 'duplicate_content' };
    }
    if (!this._withinQuotas(now)) {
      return { kind: 'skip', reason: 'quota_exceeded' };
    }

    // We are within quotas and not skipping. Decide whether we need to
    // wait for a natural pacing gap since the last send.
    const desiredGap = this._desiredGap(now);
    if (this._lastSendAt > 0) {
      const elapsed = now - this._lastSendAt;
      if (elapsed < desiredGap) {
        return { kind: 'wait', delayMs: desiredGap - elapsed };
      }
    }
    return { kind: 'ok' };
  }

  _desiredGap(now) {
    const {
      minDelayMs,
      maxDelayMs,
      jitterFactor,
      batchSize,
      batchPauseMs,
    } = this.opts;
    const sendsSoFar = this._hourTimestamps.length;
    // If we are about to start a new batch, take a longer pause.
    if (
      batchSize > 0 &&
      batchPauseMs > 0 &&
      sendsSoFar > 0 &&
      sendsSoFar % batchSize === 0
    ) {
      return Math.max(0, jitter(batchPauseMs, jitterFactor));
    }
    const span = Math.max(minDelayMs, maxDelayMs) - minDelayMs;
    const base = minDelayMs + Math.random() * span;
    return Math.max(0, jitter(base, jitterFactor));
  }

  recordSent(phone, content, now = Date.now()) {
    if (!this.isEnabled()) return;
    this._hourTimestamps.push(now);
    this._dayTimestamps.push(now);
    this._lastSentPerPhone.set(phone, now);
    this._lastSendAt = now;
    if (this.opts.dedupeWindowMs) {
      const hash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');
      let map = this._contentHashesPerPhone.get(phone);
      if (!map) {
        map = new Map();
        this._contentHashesPerPhone.set(phone, map);
      }
      map.set(hash, now);
    }
  }

  recordFailure(phone) {
    // We don't consume quota on a hard failure (a failure is already a
    // signal that we should not push the same payload again soon). The
    // per-recipient cooldown still applies on the next attempt.
  }

  getStats() {
    const now = Date.now();
    trimToWindow(this._hourTimestamps, HOUR_MS, now);
    trimToWindow(this._dayTimestamps, DAY_MS, now);
    return {
      enabled: this.isEnabled(),
      messagesLastHour: this._hourTimestamps.length,
      messagesLastDay: this._dayTimestamps.length,
      limits: {
        maxPerHour: this.opts.maxPerHour,
        maxPerDay: this.opts.maxPerDay,
        minDelayMs: this.opts.minDelayMs,
        maxDelayMs: this.opts.maxDelayMs,
        batchSize: this.opts.batchSize,
        batchPauseMs: this.opts.batchPauseMs,
        dedupeWindowMs: this.opts.dedupeWindowMs,
        skipIfMessagedWithinMs: this.opts.skipIfMessagedWithinMs,
        activeHours: {
          start: this.opts.activeHoursStart,
          end: this.opts.activeHoursEnd,
        },
      },
    };
  }
}

module.exports = { AntiBan, sleep };
