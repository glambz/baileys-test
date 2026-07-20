'use strict';

const wa = require('../whatsapp/client');
const inbox = require('../inbox/writer');
const { AntiBan } = require('../whatsapp/antiBan');
const { startTyping } = require('../whatsapp/typing');
const logger = require('../utils/logger');

const antiBan = new AntiBan();

function validateSendPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('Request body must be a JSON object');
    return errors;
  }
  if (!body.phone) {
    errors.push('"phone" is required');
  } else if (typeof body.phone !== 'string') {
    errors.push('"phone" must be a string (e.g. "628123456789")');
  }
  if (!body.message) {
    errors.push('"message" is required');
  } else if (typeof body.message !== 'string') {
    errors.push('"message" must be a string');
  }
  return errors;
}

async function send(req, res, next) {
  try {
    const errors = validateSendPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'ValidationError', details: errors });
    }
    const { phone, message } = req.body;

    if (!wa.isConnected()) {
      const err = new Error(
        'WhatsApp is not connected. Initialize auth and scan the QR code first.'
      );
      err.statusCode = 503;
      throw err;
    }

    const jid = wa.phoneToJid(phone);
    const contentHash = require('crypto')
      .createHash('sha256')
      .update(message)
      .digest('hex');

    // Show "typing…" for the whole send window. startTyping refreshes
    // every 4s so the indicator survives the anti-ban throttle wait.
    // stopTyping is wired via try/finally so it always fires.
    const stopTyping = startTyping(wa.sock, jid);

    try {
      const check = antiBan.check(jid, contentHash);
      if (check.kind === 'skip') {
        return res.status(429).json({
          error: 'AntiBanBlocked',
          reason: check.reason,
          message:
            'Send was blocked by anti-ban policy. Adjust ANTI_BAN_* env vars or disable ANTI_BAN_ENABLED.',
          antiBan: antiBan.getStats(),
        });
      }
      if (check.kind === 'wait') {
        logger.info(
          { jid, delayMs: check.delayMs },
          'Anti-ban: throttling single send'
        );
        await new Promise((r) => setTimeout(r, Math.min(check.delayMs, 60_000)));
        if (!wa.isConnected()) {
          const err = new Error('Connection lost while waiting');
          err.statusCode = 503;
          throw err;
        }
      }

      const sent = await wa.sock.sendMessage(jid, { text: message });
      antiBan.recordSent(jid, message);
      logger.info({ jid, messageId: sent?.key?.id }, 'Message sent');
      // Mark the id first so any echoed messages.upsert event is skipped.
      inbox.markLogged(sent?.key?.id);
      // Outbound is logged explicitly so phone-sent messages are also
      // captured (some Baileys versions do not echo self-sent messages
      // through messages.upsert at all).
      try {
        const ts = sent?.messageTimestamp
          ? Number(sent.messageTimestamp)
          : Math.floor(Date.now() / 1000);
        await inbox.record(jid, {
          direction: 'out',
          pushName: null,
          ts,
          body: message,
          kind: 'text',
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'Inbox record (single send) failed');
      }
      return res.json({
        success: true,
        data: {
          messageId: sent?.key?.id || null,
          to: jid,
          text: message,
          timestamp: sent?.messageTimestamp
            ? Number(sent.messageTimestamp)
            : Date.now(),
        },
      });
    } finally {
      stopTyping();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { send, antiBan };
