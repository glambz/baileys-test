'use strict';

const inbox = require('../inbox/writer');

function list(req, res) {
  return res.json({ contacts: inbox.listLidMappings() });
}

function register(req, res) {
  const { lid, pn } = req.body || {};
  if (typeof lid !== 'string' || typeof pn !== 'string') {
    return res.status(400).json({
      error: 'ValidationError',
      details: ['"lid" and "pn" must be strings'],
    });
  }
  if (!lid.endsWith('@lid')) {
    return res.status(400).json({
      error: 'ValidationError',
      details: ['"lid" must end with @lid'],
    });
  }
  const before = inbox.listLidMappings().length;
  inbox.registerLid(lid, pn);
  const after = inbox.listLidMappings().length;
  const registered = after > before;
  return res.json({
    registered,
    mappings: inbox.listLidMappings(),
  });
}

module.exports = { list, register };
