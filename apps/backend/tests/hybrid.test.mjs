/**
 * Hybrid retrieval tests.
 */
import { describe, it, expect } from 'vitest';
import { bm25Search } from '../src/ai/retrieval/bm25.js';
import { annSearch } from '../src/ai/retrieval/ann.js';
import { rerank } from '../src/ai/retrieval/reranker.js';
import { hybridRetrieval, TAU_TURBO } from '../src/ai/retrieval/hybrid.js';

const HAS_DB = !!process.env.DATABASE_URL;

describe('BM25 (requires Postgres)', () => {
  it('is exported', () => {
    expect(typeof bm25Search).toBe('function');
  });
  if (!HAS_DB) return;
  it('returns scored hits for known query', async () => {
    const hits = await bm25Search({ query: 'paket bulanan', limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThan(0);
  });
});

describe('ANN (requires Postgres + pgvector)', () => {
  if (!HAS_DB) {
    it('skipped without DB', () => { expect(true).toBe(true); });
    return;
  }
  it('returns scored hits for known embedding', async () => {
    const { getPool } = await import('../src/db/client.js');
    const pool = getPool();
    const emb = await pool.query('SELECT embedding FROM knowledge_chunks LIMIT 1');
    if (emb.rows.length === 0) return;
    const hits = await annSearch({ queryEmbedding: emb.rows[0].embedding, limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('reranker', () => {
  it('is exported', () => { expect(typeof rerank).toBe('function'); });
});

describe('hybridRetrieval (pure functions)', () => {
  it('exposes TAU_TURBO constant (MVP-activated at 0.30 per G-AI-8)', () => {
    expect(TAU_TURBO).toBe(0.30);
  });
  if (!HAS_DB) {
    it('skipped without DB', () => { expect(true).toBe(true); });
    return;
  }
  it('returns shape with retrievalScore and contactScopeApplied', async () => {
    const r = await hybridRetrieval({ query: 'paket bulanan', scope: 'team' });
    expect(typeof r.retrievalScore).toBe('number');
    expect(typeof r.contactScopeApplied).toBe('boolean');
    expect(Array.isArray(r.chunks)).toBe(true);
  });
});