'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const LOCK_FILE = path.join(config.whatsapp.sessionDir, 'server.lock');

/**
 * Is the process that wrote this lock still running?
 *
 * Container-safe. The naive version of this checked only the pid and
 * returned `true` when it matched our own — which permanently bricked
 * startup under Docker, where the app is ALWAYS pid 1: the lock left by the
 * previous container recorded pid 1, the new process is also pid 1, so every
 * restart concluded that another instance was running and refused to boot.
 * The `=== process.pid` branch was meant to say "that's me, fine", but
 * acquire() reads a `true` here as "someone else holds it".
 */
function isLockHolderAlive(existing) {
  if (!existing || !existing.pid) return false;

  // A lock written on another host — or, under Docker, by another container,
  // since the hostname is the container id — cannot be probed with
  // process.kill from here. Its pid means nothing in our namespace. Treat it
  // as stale: a recreated container legitimately inherits its predecessor's
  // lock through the auth_info volume.
  if (existing.hostname && existing.hostname !== os.hostname()) return false;

  // The lock records OUR pid. We are inside acquire(), so we cannot already
  // be running as ourselves — this is a stale lock from an earlier process
  // that had the same pid. Normal on every container restart (pid 1), and
  // possible on a host after a pid rollover.
  if (existing.pid === process.pid) return false;

  try {
    process.kill(existing.pid, 0);
    return true;
  } catch (err) {
    // EPERM means the pid exists but belongs to another user.
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
  const holderAlive = existing ? isLockHolderAlive(existing) : false;
  if (existing && !holderAlive) {
    logger.warn(
      { staleLock: existing },
      'Found a stale single-instance lock (its holder is gone); taking over'
    );
  }
  if (holderAlive) {
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
    hostname: os.hostname(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2));
  logger.info({ pid: process.pid }, 'Acquired single-instance lock');
}

function release() {
  try {
    const existing = readLock();
    const ours =
      existing &&
      existing.pid === process.pid &&
      (!existing.hostname || existing.hostname === os.hostname());
    if (ours && fs.existsSync(LOCK_FILE)) {
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

module.exports = { acquire, release, installSignalCleanup, isLockHolderAlive };
