'use strict';
/**
 * Audit log — append-only NDJSON writer.
 * Source: docs/crm/plans/22-audit-log.md step 1.
 *
 * One file per UTC date. File handle is NOT held open across writes.
 */
const fs = require('fs');
const path = require('path');
const { redactPayload } = require('./redact');

let AUDIT_DIR = process.env.AUDIT_DIR || './data/audit';

function setAuditDir(dir) {
  AUDIT_DIR = dir;
}

function ensureDir() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function auditPath(date) {
  return path.join(AUDIT_DIR, `${date || todayUtc()}.ndjson`);
}

async function write(eventType, payload) {
  ensureDir();
  const safePayload = payload || {};
  const redacted = redactPayload(safePayload);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    eventType,
    ...redacted,
  });
  const p = auditPath();
  await fs.promises.appendFile(p, line + '\n', 'utf8');
}

module.exports = {
  write,
  auditPath,
  AUDIT_DIR,
  setAuditDir,
  todayUtc,
};