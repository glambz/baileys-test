/**
 * Integration tests for the chat-scope guardrail.
 * Source: docs/specs/2026-08-18-kb-chat-scope-guardrail.md
 *
 * Skipped when DATABASE_URL is not set (matches the rest of the integration suite).
 */
import { describe, it, expect } from 'vitest';
import { getPool } from '../src/db/client.js';
import { bm25Search } from '../src/ai/retrieval/bm25.js';
import { annSearch } from '../src/ai/retrieval/ann.js';
import { hybridRetrieval } from '../src/ai/retrieval/hybrid.js';

const HAS_DB = !!process.env.DATABASE_URL;

const CHAT_A = 'scope-test-A@s.whatsapp.net';
const CHAT_B = 'scope-test-B@s.whatsapp.net';
const MARK = `scopemark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QUERY = `marcopolo uniquetoken ${MARK}`;

async function getJidsForRows(ids) {
  if (ids.length === 0) return [];
  const pool = getPool();
  const r = await pool.query(
    'SELECT id, chat_jid FROM knowledge_chunks WHERE id = ANY($1::text[])',
    [ids]
  );
  return r.rows;
}

async function seed() {
  const pool = getPool();
  // Need a parent knowledge_files row because chunks.file_id REFERENCES it.
  // Distinct 1024-dim embeddings so the ANN path produces non-trivial results.
  const vecA = '[' + [0.1, 0.9, ...Array(1022).fill(0)].join(',') + ']';
  const vecB = '[' + [0.9, 0.1, ...Array(1022).fill(0)].join(',') + ']';
  await pool.query(
    `INSERT INTO knowledge_files (id, filename, mime_type, size_bytes, storage_path)
     VALUES ('scope-test-file', 'scope.md', 'text/plain', 0, '/tmp/scope.md')
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding, metadata, chat_jid)
     VALUES
       ('scope-A', 'scope-test-file', 0, $1, 'hA', $2::vector, '{"source":"scope-test"}', $3),
       ('scope-B', 'scope-test-file', 1, $4, 'hB', $5::vector, '{"source":"scope-test"}', $6)`,
    [
      `${QUERY} answer for A`,
      vecA,
      CHAT_A,
      `${QUERY} answer for B`,
      vecB,
      CHAT_B,
    ]
  );
}

async function cleanup() {
  const pool = getPool();
  await pool.query("DELETE FROM knowledge_chunks WHERE metadata->>'source' = 'scope-test'");
  await pool.query("DELETE FROM knowledge_files WHERE id = 'scope-test-file'");
}

describe('chat-scope guardrail (integration, requires DB)', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }

  it('bm25Search returns only chat-A rows when chatJid=CHAT_A', async () => {
    await seed();
    try {
      const hits = await bm25Search({ query: QUERY, limit: 50, chatJid: CHAT_A });
      const ids = hits.map((h) => h.chunk.id);
      const rows = await getJidsForRows(ids);
      const jids = rows.map((r) => r.chat_jid).filter(Boolean);
      expect(jids.length).toBeGreaterThan(0);
      expect(jids.every((j) => j === CHAT_A)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('bm25Search without chatJid returns both chats (legacy/team behavior)', async () => {
    await seed();
    try {
      const hits = await bm25Search({ query: QUERY, limit: 50 });
      const ids = hits.map((h) => h.chunk.id);
      const rows = await getJidsForRows(ids);
      const jids = new Set(rows.map((r) => r.chat_jid).filter(Boolean));
      expect(jids.has(CHAT_A)).toBe(true);
      expect(jids.has(CHAT_B)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('annSearch returns only chat-A rows when chatJid=CHAT_A', async () => {
    await seed();
    try {
      const pool = getPool();
      const emb = await pool.query(
        "SELECT embedding FROM knowledge_chunks WHERE chat_jid = $1 LIMIT 1",
        [CHAT_A]
      );
      if (emb.rows.length === 0) return; // pgvector not installed
      const hits = await annSearch({
        queryEmbedding: emb.rows[0].embedding,
        limit: 50,
        chatJid: CHAT_A,
      });
      const ids = hits.map((h) => h.chunk.id);
      const rows = await getJidsForRows(ids);
      const jids = rows.map((r) => r.chat_jid).filter(Boolean);
      expect(jids.every((j) => j === CHAT_A)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('hybridRetrieval with scope=whatsapp+chatId=CHAT_A never returns chat-B chunks', async () => {
    await seed();
    try {
      const pool = getPool();
      const emb = await pool.query(
        "SELECT embedding FROM knowledge_chunks WHERE chat_jid = $1 LIMIT 1",
        [CHAT_A]
      );
      if (emb.rows.length === 0) return;
      const r = await hybridRetrieval({
        query: QUERY,
        scope: 'whatsapp',
        chatId: CHAT_A,
        queryEmbedding: emb.rows[0].embedding,
        topK: 10,
      });
      const ids = r.chunks.map((c) => c.chunk?.id).filter(Boolean);
      const rows = await getJidsForRows(ids);
      const offending = rows.filter((row) => row.chat_jid === CHAT_B);
      expect(offending).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('hybridRetrieval with scope=team still returns everything (no regression)', async () => {
    await seed();
    try {
      const pool = getPool();
      const emb = await pool.query(
        "SELECT embedding FROM knowledge_chunks WHERE chat_jid = $1 LIMIT 1",
        [CHAT_A]
      );
      if (emb.rows.length === 0) return;
      const r = await hybridRetrieval({
        query: QUERY,
        scope: 'team',
        queryEmbedding: emb.rows[0].embedding,
        topK: 50,
      });
      const ids = r.chunks.map((c) => c.chunk?.id).filter(Boolean);
      const rows = await getJidsForRows(ids);
      const jids = new Set(rows.map((r) => r.chat_jid).filter(Boolean));
      expect(jids.has(CHAT_A)).toBe(true);
      expect(jids.has(CHAT_B)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
