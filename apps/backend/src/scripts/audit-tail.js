'use strict';
/**
 * Manual smoke: tail the audit log.
 *   pnpm script:audit-tail
 *   pnpm script:audit-tail --filter=auto_reply_hold
 *   pnpm script:audit-tail --since=2026-07-03T00:00:00Z
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const audit = require('../ai/audit/log');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return fallback;
}

async function main() {
  const filter = arg('filter');
  const since = arg('since');
  const sinceTs = since ? Date.parse(since) : 0;
  const file = audit.auditPath();
  if (!fs.existsSync(file)) {
    console.error('no audit file:', file);
    process.exit(0);
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const l of lines) {
    try {
      const row = JSON.parse(l);
      if (filter && row.eventType !== filter) continue;
      if (sinceTs && row.ts && Date.parse(row.ts) < sinceTs) continue;
      out.push(row);
    } catch (_) {}
  }
  out.reverse();
  for (const r of out) console.log(JSON.stringify(r));
}

main();