'use strict';

const wa = require('../whatsapp/client');

async function init(req, res, next) {
  try {
    if (wa.isConnected()) {
      return res.status(200).json({
        message: 'Already connected to WhatsApp',
        status: wa.getStatus(),
      });
    }
    await wa.initialize();
    return res.status(202).json({
      message:
        'WhatsApp authentication initiated. Poll /api/auth/status or scan the QR returned by GET /api/auth/qr.',
      status: wa.getStatus(),
    });
  } catch (err) {
    next(err);
  }
}

async function qr(req, res, next) {
  try {
    if (wa.isConnected()) {
      return res.status(409).json({
        error: 'AlreadyAuthenticated',
        message: 'WhatsApp is already connected; no QR to scan.',
        status: wa.getStatus(),
      });
    }
    if (wa.state !== 'qr' || !wa.lastQRBuffer) {
      if (!wa._initializing && wa.state === 'close') {
        await wa.initialize();
      }
      res.set('X-WhatsApp-State', wa.state);
      return res.status(202).json({
        error: 'QRNotReady',
        message:
          'QR is not ready yet. The socket is still connecting. Retry shortly.',
        status: wa.getStatus(),
      });
    }
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(wa.lastQRBuffer.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-WhatsApp-State': wa.state,
    });
    return res.status(200).send(wa.lastQRBuffer);
  } catch (err) {
    next(err);
  }
}

async function qrJson(req, res, next) {
  try {
    if (wa.isConnected()) {
      return res.status(409).json({
        error: 'AlreadyAuthenticated',
        message: 'WhatsApp is already connected; no QR to scan.',
        status: wa.getStatus(),
      });
    }
    if (wa.state !== 'qr' || !wa.lastQR) {
      if (!wa._initializing && wa.state === 'close') {
        await wa.initialize();
      }
      return res.status(202).json({
        error: 'QRNotReady',
        message:
          'QR is not ready yet. The socket is still connecting. Retry shortly.',
        status: wa.getStatus(),
      });
    }
    return res.status(200).json({
      message:
        'Scan this QR with WhatsApp > Linked Devices > Link a Device. The QR refreshes periodically.',
      qr: wa.lastQR,
      mimeType: 'image/png',
      status: wa.getStatus(),
    });
  } catch (err) {
    next(err);
  }
}

async function status(req, res) {
  return res.json({
    status: wa.getStatus(),
  });
}

async function logout(req, res, next) {
  try {
    const result = await wa.logout();
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { init, qr, qrJson, status, logout };