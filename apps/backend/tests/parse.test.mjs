/**
 * LLM parser + reject-and-retry tests.
 */
import { describe, it, expect } from 'vitest';
import { parseStructuredOutput, LlmParseError, RagAnswerSchema } from '../src/ai/llm/parse.js';

function makeClient(responses) {
  let i = 0;
  return {
    createChatCompletion: async () => {
      const r = responses[i] || responses[responses.length - 1];
      i += 1;
      return { content: r, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
    },
  };
}

const VALID = JSON.stringify({
  answer: 'Paket Bulanan 500000 rupiah.',
  citations: [1],
  confidence: 0.9,
  fallback_used: false,
});

describe('parseStructuredOutput', () => {
  it('parses on first attempt when valid', async () => {
    const c = makeClient([VALID]);
    const r = await parseStructuredOutput({
      rawText: VALID,
      schema: RagAnswerSchema,
      llmClient: c,
      systemPrompt: 's',
      userPrompt: 'u',
    });
    expect(r.attempts).toBe(1);
    expect(r.parsed.answer).toContain('Paket Bulanan');
  });

  it('retries on invalid JSON, succeeds on second attempt', async () => {
    const c = makeClient([VALID]);
    const r = await parseStructuredOutput({
      rawText: 'not json',
      schema: RagAnswerSchema,
      llmClient: c,
      systemPrompt: 's',
      userPrompt: 'u',
    });
    expect(r.attempts).toBe(2);
  });

  it('retries on schema mismatch, succeeds on second attempt', async () => {
    const wrongShape = JSON.stringify({ answer: 'x' });
    const c = makeClient([VALID]);
    const r = await parseStructuredOutput({
      rawText: wrongShape,
      schema: RagAnswerSchema,
      llmClient: c,
      systemPrompt: 's',
      userPrompt: 'u',
    });
    expect(r.attempts).toBe(2);
  });

  it('throws LlmParseError after 3 failed attempts', async () => {
    const c = makeClient(['x', 'y', 'z']);
    await expect(
      parseStructuredOutput({
        rawText: 'x',
        schema: RagAnswerSchema,
        llmClient: c,
        systemPrompt: 's',
        userPrompt: 'u',
        maxAttempts: 3,
      })
    ).rejects.toBeInstanceOf(LlmParseError);
  });
});