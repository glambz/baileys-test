/**
 * KB ingest + OCR smoke tests.
 */
import { describe, it, expect } from 'vitest';
import { extractText, UnsupportedMimeError } from '../src/ai/retrieval/ocr.js';
import { chunkText } from '../src/ai/retrieval/chunker.js';

describe('extractText', () => {
  it('extracts plain text', async () => {
    const r = await extractText({ buffer: Buffer.from('Hello world'), mimeType: 'text/plain' });
    expect(r.text).toBe('Hello world');
  });
  it('throws UnsupportedMimeError for zip', async () => {
    await expect(
      extractText({ buffer: Buffer.from('xx'), mimeType: 'application/zip' })
    ).rejects.toBeInstanceOf(UnsupportedMimeError);
  });
  it('strips script tags from HTML', async () => {
    const html = '<html><body><h2>A</h2><p>hi</p><script>alert(1)</script></body></html>';
    const r = await extractText({ buffer: Buffer.from(html), mimeType: 'text/html' });
    expect(r.text).toContain('hi');
    expect(r.text).not.toContain('alert');
    expect(r.metadata.sections).toContain('A');
  });
});

describe('ingest smoke (no DB)', () => {
  it('chunkText is idempotent', () => {
    const a = chunkText({ text: 'a b c d e f' });
    const b = chunkText({ text: 'a b c d e f' });
    expect(a).toEqual(b);
  });
});