/**
 * Contact-scope tests (defense-in-depth layer 6).
 */
import { describe, it, expect } from 'vitest';

const HAS_DB = !!process.env.DATABASE_URL;
const describeIf = HAS_DB ? describe : describe.skip;

describeIf('contact-scope filter (DB-backed)', () => {
  it('team scope returns no contactScopeApplied', async () => {
    const { hybridRetrieval } = await import('../ai/retrieval/hybrid.js');
    const r = await hybridRetrieval({ query: 'paket bulanan', scope: 'team' });
    expect(r.contactScopeApplied).toBe(false);
  });
  it('whatsapp scope with contactPhone applies scope', async () => {
    const { hybridRetrieval } = await import('../ai/retrieval/hybrid.js');
    const r = await hybridRetrieval({
      query: 'paket bulanan',
      scope: 'whatsapp',
      contactPhone: '6285179652486',
    });
    expect(r.contactScopeApplied).toBe(true);
  });
  it('turbo cutoff triggers when retrievalScore < TAU_TURBO', async () => {
    const { hybridRetrieval, TAU_TURBO } = await import('../ai/retrieval/hybrid.js');
    const r = await hybridRetrieval({ query: 'xyzzy gibberish nonsense', scope: 'team' });
    expect(r.chunks.length === 0 || r.retrievalScore < TAU_TURBO).toBe(true);
  });
});

describe('contact-scope layer smoke (always-on)', () => {
  it('TAU_TURBO constant is 0.30 (MVP-activated per G-AI-8)', async () => {
    const { TAU_TURBO } = await import('../ai/retrieval/hybrid.js');
    expect(TAU_TURBO).toBe(0.30);
  });
  it('chunk module surfaces the contact-scope surface', async () => {
    const chunks = await import('../ai/store/chunks.js');
    // WRITE-RESTRICTED: only __ingestUpsertChunk + __ingestDeleteForFile are exported;
    // no insertChunk / updateChunk / deleteChunk in the public API.
    expect(typeof chunks.getChunksForFile).toBe('function');
    expect(typeof chunks.searchByTextFts).toBe('function');
    expect(chunks.insertChunk).toBeUndefined();
    expect(chunks.updateChunk).toBeUndefined();
    expect(chunks.deleteChunk).toBeUndefined();
  });
});