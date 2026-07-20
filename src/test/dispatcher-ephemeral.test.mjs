/**
 * Ephemeral-message body extraction test (BUG-DISPATCHER-EPHEMERAL fix).
 *
 * Symptom: WhatsApp chats with disappearing messages enabled wrap inbound
 * payloads in `ephemeralMessage.message`. The inbox writer's
 * `extractText()` calls `unwrapMessage()` to peel these wrappers, but the
 * dispatcher at src/index.js:128 uses a naive expression that misses
 * wrapped content. Result: the AI trigger receives `body = ''` and bails
 * on its empty-body guard.
 *
 * This test pins the expected behavior of an extracted-body helper
 * (exported from src/inbox/writer.js after the fix) and asserts that
 * conversation / extendedTextMessage / image-caption / viewOnce /
 * documentWithCaption wrappers are all unwrapped correctly.
 *
 * This test is the RED phase of the BUG-DISPATCHER-EPHEMERAL fix. It
 * must FAIL against the current code because `extractText` is not
 * exported from src/inbox/writer.js.
 */
import { describe, it, expect } from 'vitest';

describe('dispatcher body extraction (BUG-DISPATCHER-EPHEMERAL fix)', () => {
  it('extractText is exported from src/inbox/writer.js', async () => {
    const mod = await import('../inbox/writer.js');
    expect(typeof mod.extractText).toBe('function');
  });

  it('plain conversation is returned verbatim', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({ conversation: 'halo kak' });
    expect(r).toEqual({ body: 'halo kak', kind: 'text' });
  });

  it('ephemeralMessage wrapping is unwrapped (the bug)', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      ephemeralMessage: {
        message: { conversation: 'pesan rahasia yang penting' },
      },
    });
    expect(r).toEqual({ body: 'pesan rahasia yang penting', kind: 'text' });
  });

  it('ephemeralMessage > extendedTextMessage is unwrapped', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      ephemeralMessage: {
        message: {
          extendedTextMessage: { text: 'extended inside ephemeral' },
        },
      },
    });
    expect(r).toEqual({ body: 'extended inside ephemeral', kind: 'text' });
  });

  it('viewOnceMessage wrapping is unwrapped', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      viewOnceMessage: {
        message: { conversation: 'sekali lihat' },
      },
    });
    expect(r).toEqual({ body: 'sekali lihat', kind: 'text' });
  });

  it('viewOnceMessageV2 wrapping is unwrapped', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      viewOnceMessageV2: {
        message: { conversation: 'view once v2' },
      },
    });
    expect(r).toEqual({ body: 'view once v2', kind: 'text' });
  });

  it('documentWithCaptionMessage wrapping is unwrapped', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      documentWithCaptionMessage: {
        message: { conversation: 'captioned doc' },
      },
    });
    expect(r).toEqual({ body: 'captioned doc', kind: 'text' });
  });

  it('image caption is unwrapped and returned with kind=image', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      ephemeralMessage: {
        message: {
          imageMessage: { caption: 'lihat gambar ini kak', mimetype: 'image/png' },
        },
      },
    });
    expect(r.body).toBe('lihat gambar ini kak');
    expect(r.kind).toBe('image');
  });

  it('protocolMessage returns empty (not a real user message)', async () => {
    const { extractText } = await import('../inbox/writer.js');
    const r = extractText({
      ephemeralMessage: {
        message: {
          protocolMessage: { type: 'REVOKE' },
        },
      },
    });
    expect(r.body).toBe('');
    expect(r.kind).toBe('protocol');
  });

  it('empty / null content returns empty body', async () => {
    const { extractText } = await import('../inbox/writer.js');
    // null / undefined: falsy input is caught by `if (!m)` -> kind 'empty'
    expect(extractText(null)).toEqual({ body: '', kind: 'empty' });
    expect(extractText(undefined)).toEqual({ body: '', kind: 'empty' });
    // empty object: no recognised wrapper -> falls through to default 'unknown'
    expect(extractText({})).toEqual({ body: '', kind: 'unknown' });
  });
});
