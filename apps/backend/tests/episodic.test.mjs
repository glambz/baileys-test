/**
 * Tests for src/ai/store/episodic.js — embedding storage + vector retrieval.
 * Source: cycle be-ai-auto-reply follow-up "I love the summary and the
 * top K = 10" (2026-07-09).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const STATE = {
  poolRows: [],
  embedCalls: [],
};

const mockPool = {
  query: vi.fn(async (sql, params) => {
    if (/UPDATE messages\s+SET embedding/i.test(sql)) {
      const vec = JSON.parse(params[0]);
      const id = params[1];
      const row = STATE.poolRows.find((r) => r.id === id);
      if (row) row.embedding = vec;
      return { rows: [], rowCount: 1 };
    }
    if (/FROM messages\s+WHERE chat_id/i.test(sql) && /embedding IS NOT NULL/i.test(sql)) {
      const chatId = params[1];
      // Find the minTimestamp param (third positional, present when
      // `timestamp >= $N` appears in the SQL).
      const tsMatch = sql.match(/timestamp\s*>=\s*\$\d+/i);
      const minTs = tsMatch ? Number(params[2]) : null;
      const rows = STATE.poolRows
        .filter((r) => r.chat_id === chatId && r.embedding)
        .filter((r) => minTs == null || Number(r.timestamp) >= minTs)
        .map((r) => ({ ...r }));
      return { rows };
    }
    return { rows: [] };
  }),
};

vi.mock('../src/db/client.js', () => ({ getPool: () => mockPool }));
vi.mock('../src/ai/llm/embed.js', () => ({
  embedText: vi.fn(async (text) => {
    STATE.embedCalls.push(text);
    const dim = 1024;
    const v = new Array(dim);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let i = 0; i < dim; i += 1) {
      v[i] = (((h + i * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
    }
    return v;
  }),
}));

// Pre-populate require.cache for the CJS modules that episodic.js depends
// on. vi.mock only applies to ESM imports, but episodic.js is loaded as
// CJS-via-vitest-interop, so its internal `require()` calls go through the
// real loader. We monkey-patch the cache before the dynamic import.
import * as embedMod from '../src/ai/llm/embed.js';
const embedPath = require('path').resolve('src/ai/llm/embed.js');
require.cache[embedPath] = { exports: { embedText: embedMod.embedText } };
const dbPath = require('path').resolve('src/db/client.js');
require.cache[dbPath] = { exports: { getPool: () => mockPool } };

// Now import the production module (after the cache is patched).
const episodic = await import('../src/ai/store/episodic.js');

beforeEach(() => {
  STATE.poolRows.length = 0;
  STATE.embedCalls.length = 0;
  mockPool.query.mockClear();
});

describe('episodic.embedAndStoreMessage', () => {
  it('skips silently when required args are missing', async () => {
    await episodic.embedAndStoreMessage({});
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('embeds the body and UPDATE-persists the vector to the existing row', async () => {
    STATE.poolRows.push({ id: 'm1', chat_id: 'c1', body: 'hello', embedding: null });
    await episodic.embedAndStoreMessage({ id: 'm1', chatId: 'c1', body: 'hello', direction: 'in' });
    expect(STATE.embedCalls).toEqual(['hello']);
    const row = STATE.poolRows[0];
    expect(row.embedding).toBeInstanceOf(Array);
    expect(row.embedding.length).toBe(1024);
  });

  it('survives embedder failure (no row update, no throw)', async () => {
    embedMod.embedText.mockRejectedValueOnce(new Error('sidecar down'));
    STATE.poolRows.push({ id: 'm1', chat_id: 'c1', body: 'hi', embedding: null });
    await episodic.embedAndStoreMessage({ id: 'm1', chatId: 'c1', body: 'hi' });
    expect(STATE.poolRows[0].embedding).toBeNull();
  });
});

describe('episodic.episodicSearch', () => {
  beforeEach(() => {
    STATE.poolRows.push(
      { id: 'm1', chat_id: 'c1', body: 'Paket Bulanan harganya 500000', direction: 'in', timestamp: 1000, embedding: null },
      { id: 'm2', chat_id: 'c1', body: 'Verifikasi dokumen KTP', direction: 'in', timestamp: 1100, embedding: null }
    );
  });

  it('returns [] when chatId or queryEmbedding is missing', async () => {
    expect(await episodic.episodicSearch({})).toEqual([]);
    expect(await episodic.episodicSearch({ chatId: 'c1' })).toEqual([]);
    expect(await episodic.episodicSearch({ chatId: 'c1', queryEmbedding: [] })).toEqual([]);
  });

  it('queries the messages table filtered by chatId and embedding IS NOT NULL', async () => {
    await episodic.embedAndStoreMessage({ id: 'm1', chatId: 'c1', body: STATE.poolRows[0].body });
    const qEmb = await embedMod.embedText('berapa harga paket bulanan?');
    const hits = await episodic.episodicSearch({ chatId: 'c1', queryEmbedding: qEmb, topK: 10 });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('m1');
    expect(hits[0].role).toBe('user');
  });

  it('applies minTimestamp filter when provided', async () => {
    await episodic.embedAndStoreMessage({ id: 'm1', chatId: 'c1', body: STATE.poolRows[0].body });
    await episodic.embedAndStoreMessage({ id: 'm2', chatId: 'c1', body: STATE.poolRows[1].body });
    const qEmb = await embedMod.embedText('test');
    const hits = await episodic.episodicSearch({ chatId: 'c1', queryEmbedding: qEmb, topK: 10, minTimestamp: 1050 });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('m2');
  });
});
