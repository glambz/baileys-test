'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const wa = require('./client');
const inbox = require('../inbox/writer');
const { AntiBan, sleep } = require('./antiBan');
const { startTyping } = require('./typing');

const TRANSIENT_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  521, // Cloudflare: Web Server Is Down
  522, // Cloudflare: Connection Timed Out
  524, // Cloudflare: A Timeout Occurred
]);

const TERMINAL_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized / loggedOut
  403, // Forbidden
  404, // Not Found (number not on WhatsApp)
  405, // Method Not Allowed
  410, // Gone
]);

function isJid(phone) {
  return typeof phone === 'string' && phone.endsWith('@s.whatsapp.net');
}

function toJid(phone) {
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.length < 8 || cleaned.length > 15) {
    const err = new Error(
      `Invalid phone number "${phone}". Expected 8-15 digits, optionally prefixed with country code.`
    );
    err.statusCode = 400;
    throw err;
  }
  return `${cleaned}@s.whatsapp.net`;
}

async function waitForConnection(timeoutMs, signal) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal && signal.aborted) throw new Error('cancelled');
    if (wa.isConnected()) return;
    await sleep(500, signal);
  }
  const err = new Error('WhatsApp is not connected');
  err.code = 'NOT_CONNECTED';
  throw err;
}

async function sendOnce(jid, text) {
  if (!wa.sock) {
    const err = new Error('No active WhatsApp socket');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  // Hard per-send timeout. If the underlying WS hangs (or a recipient
  // number doesn't exist on WhatsApp and the server never responds),
  // we must not freeze the worker loop.
  const SEND_TIMEOUT_MS = 30_000;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`sendMessage timed out after ${SEND_TIMEOUT_MS}ms`);
      err.code = 'SEND_TIMEOUT';
      reject(err);
    }, SEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([wa.sock.sendMessage(jid, { text }), timeout]);
  } catch (err) {
    const statusCode =
      err?.output?.statusCode || err?.statusCode || err?.status;
    err.statusCode = statusCode;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

class Broadcaster {
  constructor() {
    this.antiBan = new AntiBan();
    this.jobs = new Map();
    this._tickScheduled = false;
  }

  _scheduleTick(delayMs = 0) {
    if (this._tickScheduled) return;
    this._tickScheduled = true;
    setTimeout(() => {
      this._tickScheduled = false;
      this._tick().catch((err) =>
        logger.error({ err }, 'Broadcaster tick error')
      );
    }, Math.max(0, delayMs));
  }

  async _tick() {
    const active = [...this.jobs.values()].find(
      (j) => j.status === 'running' && !j._paused
    );
    if (!active) {
      logger.debug('Broadcaster tick: no active job');
      return;
    }
    if (active._nextAt && Date.now() < active._nextAt) {
      logger.debug(
        { jobId: active.id, in: active._nextAt - Date.now() },
        'Broadcaster tick: waiting'
      );
      this._scheduleTick(active._nextAt - Date.now());
      return;
    }
    logger.debug({ jobId: active.id }, 'Broadcaster tick: processing');
    while (true) {
      const recipient = active._queue.shift();
      if (!recipient) {
        active.status = 'completed';
        active.completedAt = Date.now();
        logger.info(
          {
            jobId: active.id,
            sent: active.sent,
            failed: active.failed,
            skipped: active.skipped,
          },
          'Broadcast job completed'
        );
        return;
      }
      if (active.signal.aborted) {
        recipient.status = 'skipped';
        recipient.skipReason = 'cancelled';
        active.skipped += 1;
        active._finalizeRecipient(recipient);
        continue;
      }

      const check = this.antiBan.check(recipient.jid, active.contentHash);
      logger.debug(
        { jobId: active.id, jid: recipient.jid, check: check.kind, checkDetail: check },
        'AntiBan check'
      );
      if (check.kind === 'skip') {
        recipient.status = 'skipped';
        recipient.skipReason = check.reason;
        active.skipped += 1;
        active._finalizeRecipient(recipient);
        continue;
      }
      if (check.kind === 'wait') {
        active._nextAt = Date.now() + check.delayMs;
        active._queue.unshift(recipient);
        logger.debug(
          { jobId: active.id, delayMs: check.delayMs },
          'AntiBan: scheduling wait'
        );
        this._scheduleTick(check.delayMs);
        return;
      }

      logger.debug(
        { jobId: active.id, jid: recipient.jid },
        'Broadcaster: sending'
      );
      // Per-recipient typing indicator. Scoped to this single send so
      // the indicator is on only for the actual message, not across
      // the inter-recipient throttle wait.
      const stopTyping = startTyping(wa.sock, recipient.jid);
      let shouldReturnAfterCatch = false;
      try {
        try {
          const sent = await this._sendWithRetry(
            active,
            recipient.jid,
            active.message
          );
          logger.info(
            { jobId: active.id, jid: recipient.jid, messageId: sent?.key?.id },
            'Broadcaster: sent'
          );
          recipient.status = 'sent';
          recipient.messageId = sent?.key?.id || null;
          recipient.sentAt = Date.now();
          active.sent += 1;
          this.antiBan.recordSent(recipient.jid, active.message);
          // Mark the id first so any echoed messages.upsert event is skipped.
          inbox.markLogged(sent?.key?.id);
          // Outbound is logged explicitly so phone-sent messages are also
          // captured (some Baileys versions do not echo self-sent messages
          // through messages.upsert at all).
          try {
            const ts = sent?.messageTimestamp
              ? Number(sent.messageTimestamp)
              : Math.floor(Date.now() / 1000);
            await inbox.record(recipient.jid, {
              direction: 'out',
              pushName: null,
              ts,
              body: active.message,
              kind: 'text',
            });
          } catch (err) {
            logger.warn(
              { jobId: active.id, jid: recipient.jid, err: err.message },
              'Inbox record (broadcast outbound) failed'
            );
          }
        } catch (err) {
          logger.error(
            { jobId: active.id, jid: recipient.jid, err: { message: err.message, code: err.code, statusCode: err.statusCode } },
            'Broadcaster: send failed'
          );
          const code = err.statusCode;
          if (code && TERMINAL_STATUS_CODES.has(code)) {
            recipient.status = 'failed';
            recipient.error = `terminal_${code}: ${err.message}`;
            active.failed += 1;
          } else if (code && TRANSIENT_STATUS_CODES.has(code)) {
            active._queue.unshift(recipient);
            active._nextAt = Date.now() + 60_000;
            this._scheduleTick(60_000);
            shouldReturnAfterCatch = true;
          } else if (err.code === 'NOT_CONNECTED') {
            recipient.status = 'failed';
            recipient.error = 'not_connected';
            active.failed += 1;
          } else {
            recipient.status = 'failed';
            recipient.error = err.message;
            active.failed += 1;
          }
          this.antiBan.recordFailure(recipient.jid);
        }
      } finally {
        stopTyping();
      }
      if (shouldReturnAfterCatch) {
        return;
      }
      active._finalizeRecipient(recipient);
      active._nextAt = Date.now() + 1_000;
      this._scheduleTick(1_000);
      return;
    }
  }

  async _sendWithRetry(job, jid, text) {
    const maxRetries = Math.max(0, config.antiBan.maxSendRetries);
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (job.signal.aborted) throw new Error('cancelled');
      try {
        await waitForConnection(
          config.antiBan.connectionWaitTimeoutMs,
          job.signal
        );
        logger.debug({ jid, attempt }, 'sendOnce attempt');
        return await sendOnce(jid, text);
      } catch (err) {
        lastErr = err;
        logger.debug(
          { jid, attempt, code: err.code, statusCode: err.statusCode, msg: err.message },
          'sendOnce attempt failed'
        );
        if (err.message === 'cancelled') throw err;
        if (err.code === 'NOT_CONNECTED') throw err;
        const code = err.statusCode;
        if (code && TERMINAL_STATUS_CODES.has(code)) throw err;
        if (attempt < maxRetries) {
          const delay = Math.min(30_000, 2_000 * Math.pow(2, attempt));
          logger.debug({ jid, delay }, 'sendOnce retrying');
          await sleep(delay, job.signal);
        }
      }
    }
    throw lastErr;
  }

  createJob({ phones, message }) {
    if (!Array.isArray(phones) || phones.length === 0) {
      const err = new Error('"phones" must be a non-empty array');
      err.statusCode = 400;
      throw err;
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      const err = new Error('"message" must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }
    if (phones.length > 10_000) {
      const err = new Error(
        '"phones" length exceeds maximum of 10,000 per job'
      );
      err.statusCode = 413;
      throw err;
    }

    const seen = new Set();
    const recipients = [];
    const errors = [];
    for (const raw of phones) {
      try {
        const phone = isJid(raw) ? raw : toJid(raw);
        if (seen.has(phone)) {
          errors.push({ phone: String(raw), error: 'duplicate_in_payload' });
          continue;
        }
        seen.add(phone);
        recipients.push({
          phone: String(raw),
          jid: phone,
          status: 'pending',
        });
      } catch (err) {
        errors.push({ phone: String(raw), error: err.message });
      }
    }
    if (recipients.length === 0) {
      const err = new Error('No valid phone numbers in payload');
      err.statusCode = 400;
      err.details = errors;
      throw err;
    }

    const id = crypto.randomBytes(8).toString('hex');
    const contentHash = crypto
      .createHash('sha256')
      .update(message)
      .digest('hex');
    const job = {
      id,
      message,
      contentHash,
      status: 'running',
      total: recipients.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      pending: recipients.length,
      recipients,
      errors,
      createdAt: Date.now(),
      completedAt: null,
      _queue: [...recipients],
      _nextAt: Date.now(),
      signal: new AbortController(),
      _finalizeRecipient(r) {
        r.finishedAt = Date.now();
        this.pending = Math.max(0, this.pending - 1);
        if (this.pending === 0 && this.status === 'running') {
          // _tick will mark it completed once queue is empty
        }
      },
    };
    this.jobs.set(id, job);
    logger.info(
      { jobId: id, total: job.total, invalid: errors.length },
      'Broadcast job created'
    );
    this._scheduleTick();
    return this.summarize(job);
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) {
      const err = new Error(`Job ${id} not found`);
      err.statusCode = 404;
      throw err;
    }
    if (job.status !== 'running') {
      return this.summarize(job);
    }
    job.signal.abort();
    for (const r of job.recipients) {
      if (r.status === 'pending') {
        r.status = 'skipped';
        r.skipReason = 'cancelled';
        job.skipped += 1;
        r.finishedAt = Date.now();
      }
    }
    job.pending = 0;
    job.status = 'cancelled';
    job.completedAt = Date.now();
    logger.info({ jobId: id }, 'Broadcast job cancelled');
    return this.summarize(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    return this.summarize(job);
  }

  list() {
    return [...this.jobs.values()].map((j) => this.summarize(j));
  }

  summarize(job) {
    return {
      jobId: job.id,
      status: job.status,
      total: job.total,
      sent: job.sent,
      failed: job.failed,
      skipped: job.skipped,
      pending: job.pending,
      results: job.recipients.map((r) => ({
        phone: r.phone,
        jid: r.jid,
        status: r.status,
        messageId: r.messageId || null,
        sentAt: r.sentAt || null,
        finishedAt: r.finishedAt || null,
        skipReason: r.skipReason || null,
        error: r.error || null,
      })),
      errors: job.errors,
      antiBan: this.antiBan.getStats(),
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }
}

module.exports = new Broadcaster();
