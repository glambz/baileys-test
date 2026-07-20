/**
 * Chunk text tests.
 */
import { describe, it, expect } from 'vitest';
import { chunkText } from '../ai/retrieval/chunker.js';

describe('chunkText', () => {
  it('produces 1 chunk for short input', () => {
    const r = chunkText({ text: 'Halo dunia.' });
    expect(r.length).toBe(1);
    expect(r[0].metadata.hardSplit).toBe(false);
  });

  it('sets sectionTitle from preceding heading', () => {
    const r = chunkText({ text: '## Bagian A\n\nIsi bagian A adalah ini.\n\n## Bagian B\n\nIsi B.' });
    expect(r.length).toBeGreaterThanOrEqual(2);
    const first = r[0];
    expect(first.metadata.sectionTitle).toBe('Bagian A');
  });

  it('hard-splits paragraphs larger than maxTokens', () => {
    const big = 'word '.repeat(1000).trim();
    const r = chunkText({ text: big, maxTokens: 50, overlapTokens: 0 });
    expect(r.length).toBeGreaterThan(2);
    expect(r.some((c) => c.metadata.hardSplit)).toBe(true);
  });

  it('is deterministic', () => {
    const a = chunkText({ text: 'lorem ipsum dolor sit amet' });
    const b = chunkText({ text: 'lorem ipsum dolor sit amet' });
    expect(a).toEqual(b);
  });
});