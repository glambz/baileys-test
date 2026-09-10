'use strict';
/**
 * Audit log helpers — redact sensitive fields before write.
 * Source: docs/crm/plans/22-audit-log.md step 6.
 */
const SENSITIVE_PATTERNS = [
  /api[-_]?key/i,
  /^password$/i,
  /^authorization$/i,
  /^cookie$/i,
  /token$/i,
];

function shouldRedact(key) {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function redactPayload(payload) {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(redactPayload);
  if (typeof payload !== 'object') return payload;
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (shouldRedact(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactPayload(v);
    }
  }
  return out;
}

module.exports = { redactPayload, shouldRedact };