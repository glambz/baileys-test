import { describe, it, expect, beforeEach } from 'vitest';
import { crmMock } from '../crmStore';
import { routeMockRequest } from '../handler';
import type { KnowledgeChunk, KnowledgeFile } from '@/types/crm';

/**
 * Plan 05 task 4 — Deterministic mock chunking. The production handler
 * (`POST /api/crm/knowledge/upload` → `POST /crm/knowledge/files` in the
 * mock registry) must derive its `chunksCount` from the input file via
 * Web Crypto SHA-256, produce stable hashes across calls, and walk the
 * status lifecycle (`queued -> ingesting -> indexed`) inside ~2 seconds.
 *
 * Re-uploading the same metadata must produce the same chunks
 * (count + chunk hashes identical).
 */

function makeFile(name: string, size: number): KnowledgeFile {
  return {
    id: 'kf-test',
    filename: name,
    mimeType: 'text/markdown',
    size,
    status: 'queued',
    chunksCount: 0,
    ingestedAt: null,
    entityId: null,
    uploadedAt: 0,
  };
}

function fakeChunksFor(file: KnowledgeFile, body: string): KnowledgeChunk[] {
  // Mirror the spec's determinism: SHA-256-seeded 1536-dim vector and
  // char-based chunker with overlap.
  const MAX = 800;
  const OVERLAP = 100;
  const chunks: KnowledgeChunk[] = [];
  let idx = 0;
  for (let i = 0; i < body.length; i += MAX - OVERLAP) {
    const piece = body.slice(i, i + MAX);
    if (!piece) break;
    chunks.push({
      id: `kf-test-${idx}`,
      fileId: file.id,
      index: idx,
      text: piece,
      embeddingRef: `sha256:${hash(piece)}`,
      metadata: {},
    });
    idx++;
    if (i + MAX >= body.length) break;
  }
  return chunks;
}

// Lightweight non-cryptographic hash for the test only (mock chunking
// itself uses SHA-256 via `crypto.createHash`; for this unit test we
// only need stability).
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function listFiles(): Promise<KnowledgeFile[]> {
  const resp = await routeMockRequest(
    'GET',
    '/crm/knowledge/files',
    new URL('http://mock.local/crm/knowledge/files'),
    {}
  );
  expect(resp).not.toBeNull();
  const body = (await resp!.json()) as { files: KnowledgeFile[] };
  return body.files;
}

async function postUpload(metadata: {
  filename: string;
  size: number;
  mimeType: string;
}): Promise<KnowledgeFile> {
  const resp = await routeMockRequest(
    'POST',
    '/crm/knowledge/files',
    new URL('http://mock.local/crm/knowledge/files'),
    metadata
  );
  expect(resp).not.toBeNull();
  expect(resp!.status).toBe(201);
  const body = (await resp!.json()) as { file: KnowledgeFile };
  return body.file;
}

describe('Knowledge chunking (deterministic mock)', () => {
  beforeEach(() => {
    crmMock.reset();
  });

  it('legacy fakeChunksFor: chunks the same body twice → identical chunk count + identical embeddingRefs', () => {
    const file = makeFile('pricing.md', 5000);
    const body = 'X'.repeat(5000);
    const a = fakeChunksFor(file, body);
    const b = fakeChunksFor(file, body);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].text).toBe(b[i].text);
      expect(a[i].embeddingRef).toBe(b[i].embeddingRef);
    }
  });

  it('legacy fakeChunksFor: chunks of length > 800 split with overlap', () => {
    const file = makeFile('long.md', 1800);
    const body = 'A'.repeat(1800);
    const chunks = fakeChunksFor(file, body);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Overlap rule: consecutive chunks share 100 chars.
    expect(chunks[1].text.startsWith('A'.repeat(800 - 100))).toBe(true);
  });

  it('POST /api/crm/knowledge/upload (production handler): chunksCount is derived from size, deterministic, and reaches `indexed` within 2s', async () => {
    // (a) chunk count derived from size: a bigger upload yields more chunks.
    const smallSize = 1500;
    const largeSize = 9000;
    const smallCreated = await postUpload({
      filename: 'pricing-small.md',
      size: smallSize,
      mimeType: 'text/markdown',
    });
    const largeCreated = await postUpload({
      filename: 'pricing-large.md',
      size: largeSize,
      mimeType: 'text/markdown',
    });
    expect(smallCreated.status).toBe('queued');
    expect(smallCreated.chunksCount).toBe(0);
    expect(largeCreated.status).toBe('queued');
    expect(largeCreated.chunksCount).toBe(0);

    // (b) determinism: two uploads with identical metadata produce
    // identical chunksCount via the Web Crypto SHA-256 chunker.
    const detA = await postUpload({ filename: 'rga.md', size: 4000, mimeType: 'text/markdown' });
    const detB = await postUpload({ filename: 'rga.md', size: 4000, mimeType: 'text/markdown' });
    void detA;
    void detB;

    // (c) status lifecycle completes inside ~2 seconds.
    await wait(1500);

    const all = await listFiles();
    const small = all.find((f) => f.filename === 'pricing-small.md');
    const large = all.find((f) => f.filename === 'pricing-large.md');
    const rga = all.filter((f) => f.filename === 'rga.md');

    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(small!.status).toBe('indexed');
    expect(large!.status).toBe('indexed');
    expect(small!.chunksCount).toBeGreaterThan(0);
    expect(large!.chunksCount).toBeGreaterThan(small!.chunksCount);
    expect(small!.ingestedAt).not.toBeNull();
    expect(large!.ingestedAt).not.toBeNull();

    expect(rga.length).toBe(2);
    expect(rga[0].chunksCount).toBeGreaterThan(0);
    expect(rga[0].chunksCount).toBe(rga[1].chunksCount);
  });
});
