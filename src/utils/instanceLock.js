'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const LOCK_FILE = path.join(config.whatsapp.sessionDir, 'server.lock');

function isPidAlive(pid) {
  if (!pid || pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  } catch (_) {
    return null;
  }
}

function acquire() {
  if (!fs.existsSync(config.whatsapp.sessionDir)) {
    fs.mkdirSync(config.whatsapp.sessionDir, { recursive: true });
  }
  const existing = readLock();
  if (existing && existing.pid && isPidAlive(existing.pid)) {
    const err = new Error(
      `Another instance of this server is already running (pid ${existing.pid}, started ${existing.startedAt}). ` +
        `Refusing to start a second one to avoid the multi-socket loginOut loop. ` +
        `Stop the other process first, or delete ${LOCK_FILE} if you are sure it is stale.`
    );
    err.code = 'EINSTANCERUNNING';
    err.statusCode = 1;
    throw err;
  }
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: require('os').hostname(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2));
  logger.info({ pid: process.pid }, 'Acquired single-instance lock');
}

function release() {
  try {
    const existing = readLock();
    if (existing && existing.pid === process.pid && fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      logger.info('Released single-instance lock');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to release single-instance lock');
  }
}

function installSignalCleanup() {
  const cleanup = () => {
    release();
    process.exit(0);
  };
  process.on('exit', release);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { acquire, release, installSignalCleanup };
