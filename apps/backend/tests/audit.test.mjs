/**
 * Audit log + redaction tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import audit from '../src/ai/audit/log.js';
import { redactPayload } from '../src/ai/audit/redact.js';

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  audit.setAuditDir(tmpDir);
});
afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('redactPayload', () => {
  it('redacts apiKey, password, authorization, cookie, token', () => {
    const r = redactPayload({
      apiKey: 'sk-123',
      nested: { password: 'pw', authorization: 'Bearer x', cookie: 'c=1', accessToken: 't' },
      keep: 'ok',
    });
    expect(r.apiKey).toBe('[REDACTED]');
    expect(r.nested.password).toBe('[REDACTED]');
    expect(r.nested.authorization).toBe('[REDACTED]');
    expect(r.nested.cookie).toBe('[REDACTED]');
    expect(r.nested.accessToken).toBe('[REDACTED]');
    expect(r.keep).toBe('ok');
  });
});

describe('audit.write', () => {
  it('writes one JSON line per call', async () => {
    // Truncate file so this test is independent of others.
    fs.writeFileSync(audit.auditPath(), '');
    await audit.write('test_event', { foo: 'bar' });
    await audit.write('test_event', { foo: 'baz' });
    const file = audit.auditPath();
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    const r1 = JSON.parse(lines[0]);
    expect(r1.eventType).toBe('test_event');
    expect(r1.foo).toBe('bar');
    expect(typeof r1.ts).toBe('string');
  });

  it('appends in order', async () => {
    fs.writeFileSync(audit.auditPath(), '');
    await audit.write('ordered', { n: 1 });
    await audit.write('ordered', { n: 2 });
    const file = audit.auditPath();
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const last2 = lines.slice(-2).map((l) => JSON.parse(l));
    expect(last2[0].n).toBe(1);
    expect(last2[1].n).toBe(2);
  });

  it('redacts sensitive fields in payload', async () => {
    await audit.write('redact_check', { apiKey: 'sk-secret', ok: 1 });
    const file = audit.auditPath();
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.apiKey).toBe('[REDACTED]');
    expect(last.ok).toBe(1);
  });
});