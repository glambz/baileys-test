'use strict';

require('dotenv').config();

const path = require('path');

function intEnv(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function boolEnv(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return String(raw).toLowerCase() === 'true';
}

function floatEnv(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : def;
}

const config = {
  server: {
    port: intEnv('PORT', 3000),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  whatsapp: {
    sessionDir: path.resolve(
      process.cwd(),
      process.env.SESSION_DIR || './auth_info'
    ),
    logLevel: process.env.LOG_LEVEL || 'info',
    printQRInTerminal: boolEnv('PRINT_QR_IN_TERMINAL', true),
  },
  antiBan: {
    enabled: boolEnv('ANTI_BAN_ENABLED', true),
    minDelayMs: intEnv('ANTI_BAN_MIN_DELAY_MS', 15_000),
    maxDelayMs: intEnv('ANTI_BAN_MAX_DELAY_MS', 45_000),
    jitterFactor: floatEnv('ANTI_BAN_JITTER_FACTOR', 0.4),
    batchSize: intEnv('ANTI_BAN_BATCH_SIZE', 20),
    batchPauseMs: intEnv('ANTI_BAN_BATCH_PAUSE_MS', 90_000),
    maxPerHour: intEnv('ANTI_BAN_MAX_PER_HOUR', 50),
    maxPerDay: intEnv('ANTI_BAN_MAX_PER_DAY', 250),
    dedupeWindowMs: intEnv('ANTI_BAN_DEDUPE_WINDOW_MS', 24 * 60 * 60 * 1000),
    skipIfMessagedWithinMs: intEnv(
      'ANTI_BAN_SKIP_IF_MESSAGED_WITHIN_MS',
      120_000
    ),
    activeHoursStart: intEnv('ANTI_BAN_ACTIVE_HOURS_START', 0),
    activeHoursEnd: intEnv('ANTI_BAN_ACTIVE_HOURS_END', 24),
    maxSendRetries: intEnv('ANTI_BAN_MAX_SEND_RETRIES', 3),
    connectionWaitTimeoutMs: intEnv(
      'ANTI_BAN_CONNECTION_WAIT_TIMEOUT_MS',
      30_000
    ),
  },
  inbox: {
    enabled: boolEnv('INBOX_ENABLED', true),
    dir: path.resolve(
      process.cwd(),
      process.env.INBOX_LOG_DIR || './inbox_logs'
    ),
    includeStatus: boolEnv('INBOX_INCLUDE_STATUS', false),
  },
};

module.exports = config;
