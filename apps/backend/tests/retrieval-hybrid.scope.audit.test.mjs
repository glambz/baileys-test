/**
 * Audit-log integration for the chat-scope guardrail.
 * Source: docs/specs/2026-08-18-kb-chat-scope-guardrail.md
 *
 * Skipped when DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getPool } from '../src/db/client.js';
// Import hybrid FIRST so its `audit` reference is the same instance as the
// one hybridRetrieval uses to write. Then we re-exported `audit` from hybrid
// to make this sharing explicit. Without this, in fork-mode vitest, the
// relative path imports may resolve to different module instances.
import { hybridRetrieval, audit } from '../src/ai/retrieval/hybrid.js';

const HAS_DB = !!process.env.DATABASE_URL;
const CHAT_A = 'scope-test-audit-A@s.whatsapp.net';
const MARK = `audit${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const QUERY = `audit uniquetoken ${MARK}`;

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-scope-'));
  audit.setAuditDir(tmpDir);
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

async function seedAuditChunk() {
  const pool = getPool();
  const vecA = '[' + [0.1, 0.9, ...Array(1022).fill(0)].join(',') + ']';
  await pool.query(
    `INSERT INTO knowledge_files (id, filename, mime_type, size_bytes, storage_path)
     VALUES ('scope-test-audit', 'audit.md', 'text/plain', 0, '/tmp/audit.md')
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding, metadata, chat_jid)
     VALUES ('scope-audit-A', 'scope-test-audit', 0, $1, 'ha', $2::vector, '{"source":"scope-test-audit"}', $3)`,
    [`${QUERY} hello`, vecA, CHAT_A]
  );
}

async function cleanup() {
  const pool = getPool();
  await pool.query("DELETE FROM knowledge_chunks WHERE metadata->>'source' = 'scope-test-audit'");
  await pool.query("DELETE FROM knowledge_files WHERE id = 'scope-test-audit'");
}

describe('chat-scope audit (integration, requires DB)', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }

  it('writes a retrieval_scoped audit event for scope=whatsapp', async () => {
    // Truncate audit file so we can scan independently.
    fs.writeFileSync(audit.auditPath(), '');
    await seedAuditChunk();
    try {
      const pool = getPool();
      const emb = await pool.query(
        "SELECT embedding FROM knowledge_chunks WHERE chat_jid = $1 LIMIT 1",
        [CHAT_A]
      );
      if (emb.rows.length === 0) return;
      await hybridRetrieval({
        query: QUERY,
        scope: 'whatsapp',
        chatId: CHAT_A,
        queryEmbedding: emb.rows[0].embedding,
        topK: 5,
      });
      const lines = fs.readFileSync(audit.auditPath(), 'utf8').split('\n').filter(Boolean);
      const events = lines.map((l) => JSON.parse(l));
      const scoped = events.filter((e) => e.eventType === 'retrieval_scoped');
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped[scoped.length - 1].scope).toBe('whatsapp');
      expect(scoped[scoped.length - 1].chatId).toBe(CHAT_A);
    } finally {
      await cleanup();
    }
  });

  it('writes a retrieval_scoped audit event for scope=team', async () => {
    fs.writeFileSync(audit.auditPath(), '');
    await seedAuditChunk();
    try {
      const pool = getPool();
      const emb = await pool.query(
        "SELECT embedding FROM knowledge_chunks WHERE chat_jid = $1 LIMIT 1",
        [CHAT_A]
      );
      if (emb.rows.length === 0) return;
      await hybridRetrieval({
        query: QUERY,
        scope: 'team',
        queryEmbedding: emb.rows[0].embedding,
        topK: 5,
      });
      const lines = fs.readFileSync(audit.auditPath(), 'utf8').split('\n').filter(Boolean);
      const events = lines.map((l) => JSON.parse(l));
      const scoped = events.filter((e) => e.eventType === 'retrieval_scoped');
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped[scoped.length - 1].scope).toBe('team');
      expect(scoped[scoped.length - 1].chatId).toBeNull();
    } finally {
      await cleanup();
    }
  });
});
