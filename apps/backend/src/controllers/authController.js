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
    const outcome = (await wa.initialize()) || {};
    // initialize() declines in several situations (a connect attempt already
    // under way, a socket already present, a tear-down in flight). Those used
    // to be indistinguishable from success, so this endpoint kept answering
    // "authentication initiated" while doing nothing — which is precisely how
    // a client wedged mid-initialize stayed invisible through repeated init
    // attempts. Say which of the two happened.
    if (outcome.started === false) {
      return res.status(409).json({
        error: 'InitNotStarted',
        message:
          outcome.reason === 'already-initializing'
            ? 'A connection attempt is already under way; poll /api/auth/status instead of starting another.'
            : outcome.reason === 'socket-exists'
              ? 'A socket already exists for this client; check /api/auth/status.'
              : 'Could not start a connection attempt right now; retry shortly.',
        reason: outcome.reason,
        status: wa.getStatus(),
      });
    }
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

/**
 * POST /api/auth/logout
 *
 * Body (both optional):
 *   unlinkDevice:false - keep the device paired on the phone, drop only the
 *     local session.
 *   force:true - wipe the local session even though the unlink failed. The
 *     device then stays under Linked Devices until removed there by hand,
 *     so this is opt-in rather than the default.
 *
 * The options existed on wa.logout() but were unreachable: this handler
 * called it with no arguments and the route parsed nothing, so the one code
 * path that destroys credentials offered no control over whether it did.
 *
 * Always 200, with the outcome in the body. This endpoint's contract is to
 * report what actually happened rather than a fixed success string, and a
 * 4xx would defeat that: the frontend's apiClient turns non-2xx into an
 * ApiError carrying only error/message/details, so credentialsKept,
 * deviceUnlinked and unlinkError - the fields the operator needs in order to
 * choose between reconnecting and forcing - would be dropped on the floor.
 */
async function logout(req, res, next) {
  try {
    const body = req.body || {};
    const result = await wa.logout({
      unlinkDevice: body.unlinkDevice,
      force: body.force,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { init, qr, qrJson, status, logout };