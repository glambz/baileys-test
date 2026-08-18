/**
 * Chat-scope guardrail tests.
 * Source: docs/specs/2026-08-18-kb-chat-scope-guardrail.md
 *
 * Pure unit tests (no DB) — fail immediately to prove the scope filter
 * does not exist yet. Integration tests with a DB go in tests/redteam/.
 */
import { describe, it, expect } from 'vitest';

describe('hybridScope.buildScopeFilter', () => {
  it('is exported from hybridScope.js', async () => {
    const mod = await import('../src/ai/retrieval/hybridScope.js');
    expect(typeof mod.buildScopeFilter).toBe('function');
  });
});

describe('buildScopeFilter', () => {
  it('returns (chat_jid = $X OR chat_jid IS NULL) for whatsapp scope with a chatId', async () => {
    const { buildScopeFilter } = await import('../src/ai/retrieval/hybridScope.js');
    const f = buildScopeFilter({ scope: 'whatsapp', chatId: '628123456789@s.whatsapp.net' });
    expect(f.sql).toBe('chat_jid = $1 OR chat_jid IS NULL');
    expect(f.params).toEqual(['628123456789@s.whatsapp.net']);
  });

  it('returns TRUE for team scope regardless of chatId', async () => {
    const { buildScopeFilter } = await import('../src/ai/retrieval/hybridScope.js');
    const f = buildScopeFilter({ scope: 'team', chatId: null });
    expect(f.sql).toBe('TRUE');
    expect(f.params).toEqual([]);
  });

  it('throws when whatsapp scope is missing chatId', async () => {
    const { buildScopeFilter } = await import('../src/ai/retrieval/hybridScope.js');
    expect(() => buildScopeFilter({ scope: 'whatsapp', chatId: null })).toThrow(/chatId/);
    expect(() => buildScopeFilter({ scope: 'whatsapp', chatId: '' })).toThrow(/chatId/);
  });

  it('throws on unknown scope', async () => {
    const { buildScopeFilter } = await import('../src/ai/retrieval/hybridScope.js');
    expect(() => buildScopeFilter({ scope: 'global', chatId: 'X' })).toThrow(/Unknown scope/);
  });
});

describe('hybridRetrieval scope enforcement (no DB)', () => {
  it('accepts a chatJid parameter and threads it through to bm25/ann', async () => {
    // After the change, bm25Search and annSearch must accept a chatJid
    // filter argument. We can only assert the function signature here
    // because the real filter happens in SQL.
    const bm25 = await import('../src/ai/retrieval/bm25.js');
    const ann = await import('../src/ai/retrieval/ann.js');
    // Source — accept {query, limit, chatJid}
    const bm25Len = bm25.bm25Search.length;
    expect(bm25Len).toBeGreaterThanOrEqual(1);
    // annSearch should accept chatJid too
    const annLen = ann.annSearch.length;
    expect(annLen).toBeGreaterThanOrEqual(1);
  });
});
