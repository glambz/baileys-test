/**
 * LLM HTTP retry tests for the MiniMax Responses-API gateway.
 * Mocks global fetch (Node 18+) to assert body shape, response extraction,
 * retry behavior, and the timeout path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createChatCompletion,
  LlmPermanentError,
  extractResponsesPayload,
} from '../ai/llm/openai-compat.js';

function makeFetch(behaviors) {
  let i = 0;
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    const b = behaviors[i] || behaviors[behaviors.length - 1];
    i += 1;
    if (b.error) {
      return {
        ok: false,
        status: b.status,
        text: async () => b.error,
        json: async () => ({ error: b.error }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => b.data,
    };
  });
  return { fn, calls };
}

describe('OpenAI-compat createChatCompletion (MiniMax Responses API)', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns first success and posts to /v1/responses with {model, instructions, input}', async () => {
    const { fn, calls } = makeFetch([
      { data: { output: [{ content: [{ type: 'output_text', text: 'halo' }] }], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
    ]);
    globalThis.fetch = fn;
    const r = await createChatCompletion({
      systemPrompt: 'SYSTEM',
      userPrompt: 'USER',
      fetch: fn,
    });
    expect(r.content).toBe('halo');
    expect(r.usage.total_tokens).toBe(4);
    expect(calls[0].url).toMatch(/\/v1\/responses$/);
    expect(calls[0].body).toEqual({
      model: 'MiniMax-M3',
      instructions: 'SYSTEM',
      input: 'USER',
    });
  });

  it('uses text.format for structured outputs', async () => {
    const { fn, calls } = makeFetch([
      { data: { output: [{ content: [{ type: 'output_text', text: '{}' }] }], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } },
    ]);
    globalThis.fetch = fn;
    await createChatCompletion({
      systemPrompt: 'S',
      userPrompt: 'U',
      jsonSchema: { name: 'rag_answer', schema: { type: 'object', additionalProperties: true } },
      fetch: fn,
    });
    expect(calls[0].body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'rag_answer',
        schema: { type: 'object', additionalProperties: true },
        strict: true,
      },
    });
  });

  it('extracts output[0].content[0].text from the Responses shape', async () => {
    const { fn } = makeFetch([
      { data: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'part-one' }, { type: 'output_text', text: ' part-two' }] }], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } },
    ]);
    globalThis.fetch = fn;
    const r = await createChatCompletion({ systemPrompt: 's', userPrompt: 'u', fetch: fn });
    expect(r.content).toBe('part-one part-two');
  });

  it('falls back to output_text aggregate when content[].text is missing', () => {
    const data = { output_text: 'fallback text', output: [{ content: [] }] };
    const r = extractResponsesPayload(data);
    expect(r.contentText).toBe('fallback text');
  });

  it('retries on 429 then returns second result', async () => {
    const { fn } = makeFetch([
      { error: 'rate limit', status: 429 },
      { data: { output: [{ content: [{ type: 'output_text', text: 'second' }] }], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } },
    ]);
    globalThis.fetch = fn;
    const r = await createChatCompletion({
      systemPrompt: 's', userPrompt: 'u', fetch: fn, maxRetries: 2,
    });
    expect(r.content).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws LlmPermanentError after repeated 500s', async () => {
    const { fn } = makeFetch([
      { error: 'server', status: 500 },
      { error: 'server', status: 500 },
      { error: 'server', status: 500 },
    ]);
    globalThis.fetch = fn;
    await expect(
      createChatCompletion({ systemPrompt: 's', userPrompt: 'u', fetch: fn, maxRetries: 2 })
    ).rejects.toBeInstanceOf(LlmPermanentError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on 400 (not retryable)', async () => {
    const { fn } = makeFetch([{ error: 'bad req', status: 400 }]);
    globalThis.fetch = fn;
    await expect(
      createChatCompletion({ systemPrompt: 's', userPrompt: 'u', fetch: fn })
    ).rejects.toBeInstanceOf(LlmPermanentError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors AbortController timeout (LLM_TIMEOUT_MS=50ms)', async () => {
    const { fn } = makeFetch([
      { data: { output: [{ content: [{ type: 'output_text', text: 'never' }] }], usage: {} } },
    ]);
    // Make the mock hang so the AbortController fires.
    fn.mockImplementationOnce(() => new Promise((resolve) => { setTimeout(resolve, 5000); }));
    globalThis.fetch = fn;
    const prevTimeout = process.env.LLM_TIMEOUT_MS;
    process.env.LLM_TIMEOUT_MS = '50';
    try {
      await expect(
        createChatCompletion({ systemPrompt: 's', userPrompt: 'u', fetch: fn, maxRetries: 0 })
      ).rejects.toBeInstanceOf(LlmPermanentError);
    } finally {
      if (prevTimeout === undefined) delete process.env.LLM_TIMEOUT_MS;
      else process.env.LLM_TIMEOUT_MS = prevTimeout;
    }
  });
});
