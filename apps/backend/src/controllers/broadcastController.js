'use strict';

const broadcaster = require('../whatsapp/broadcaster');
const inbox = require('../inbox/writer');

async function create(req, res, next) {
  try {
    const job = broadcaster.createJob({
      phones: req.body?.phones,
      message: req.body?.message,
    });
    return res.status(202).json(job);
  } catch (err) {
    next(err);
  }
}

function get(req, res) {
  const job = broadcaster.get(req.params.jobId);
  if (!job) {
    return res
      .status(404)
      .json({ error: 'NotFound', message: `Job ${req.params.jobId} not found` });
  }
  return res.json(job);
}

function list(req, res) {
  return res.json({ jobs: broadcaster.list() });
}

function cancel(req, res, next) {
  try {
    const job = broadcaster.cancel(req.params.jobId);
    return res.json(job);
  } catch (err) {
    next(err);
  }
}

function stats(req, res) {
  return res.json({ antiBan: broadcaster.antiBan.getStats() });
}

module.exports = { create, get, list, cancel, stats };
