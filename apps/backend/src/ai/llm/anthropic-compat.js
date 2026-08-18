'use strict';
/**
 * Anthropic-compatible client (MiniMax Anthropic fallback).
 * Source: docs/crm/plans/17-llm-gateway.md step 2.
 *
 * Implements response_format:json_schema by defining an
 * `emit_structured_output` tool with input_schema = requested schema
 * and forcing tool_choice.
 */
const { LlmPermanentError, isRetryable } = require('./openai-compat');

function jitter(base) {
  const factor = 1 + (Math.random() * 0.4 - 0.2);
  return base * factor;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createAnthropicHttpClient(opts) {
  const opts2 = opts || {};
  // Returns a thin HTTP-callable client. Uses fetch (Node 18+).
  const baseURL = opts2.baseURL || process.env.ANTHROPIC_BASE_URL;
  const apiKey = opts2.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error('Anthropic-compat: ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY required');
  }
  return {
    create: async (params) => {
      const r = await fetch(`${baseURL.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(params),
      });
      if (!r.ok) {
        const text = await r.text();
        const err = new Error(`Anthropic API ${r.status}: ${text}`);
        err.status = r.status;
        throw err;
      }
      return r.json();
    },
  };
}

async function createChatCompletion(args) {
  const systemPrompt = args.systemPrompt;
  const userPrompt = args.userPrompt;
  const jsonSchema = args.jsonSchema;
  const model = args.model || process.env.ANTHROPIC_MODEL || 'minimax-anthropic';
  const maxRetries = args.maxRetries != null
    ? args.maxRetries
    : Number(process.env.LLM_MAX_RETRIES || 2);
  const client = args.client || createAnthropicHttpClient();

  const tools = [];
  if (jsonSchema) {
    tools.push({
      name: 'emit_structured_output',
      description: 'Emit the structured output JSON.',
      input_schema: jsonSchema.schema || jsonSchema,
    });
  }

  const params = {
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (tools.length > 0) {
    params.tools = tools;
    params.tool_choice = { type: 'tool', name: 'emit_structured_output' };
  }

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    try {
      const r = await client.create(params);
      // Find tool_use block
      const blocks = (r.content || []).filter((b) => b.type === 'tool_use');
      let content = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      if (r.usage) {
        usage = {
          prompt_tokens: r.usage.input_tokens || 0,
          completion_tokens: r.usage.output_tokens || 0,
          total_tokens: (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0),
        };
      }
      if (blocks.length > 0) {
        content = JSON.stringify(blocks[0].input || {});
      } else {
        // fall back to text content
        const textBlock = (r.content || []).find((b) => b.type === 'text');
        content = textBlock ? textBlock.text : '';
      }
      return { content, usage };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) {
        throw new LlmPermanentError(err.message || String(err), err);
      }
      await sleep(jitter(500 * Math.pow(2, attempt)));
      attempt += 1;
    }
  }
  throw new LlmPermanentError(lastErr ? lastErr.message : 'Anthropic call failed', lastErr);
}

module.exports = {
  createChatCompletion,
  createAnthropicHttpClient,
};