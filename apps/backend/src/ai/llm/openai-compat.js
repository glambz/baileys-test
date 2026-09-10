'use strict';
/**
 * OpenAI-compatible client pointed at MiniMax-M3 via the OpenAI Responses API.
 *
 * MiniMax exposes the OpenAI Responses API at POST {baseURL}/v1/responses,
 * NOT the Chat Completions API at /v1/chat/completions. Sending the legacy
 * Chat Completions body shape (with `messages`) is rejected by MiniMax
 * with HTTP 400 (`expr_path=messages, cause=missing required parameter`).
 *
 * The OpenAI Node SDK's `client.responses.create()` injects OpenAI-specific
 * optional fields (`parallel_tool_calls`, `truncation`, `service_tier`,
 * `safety_identifier`, ...) that MiniMax is strict about. We therefore use
 * a direct `fetch()` against /v1/responses with a minimal body shape
 *   (model + system prompt + user prompt, plus optional text.format for
 *   structured outputs).
 *
 * Source: docs/crm/plans/17-llm-gateway.md step 1.
 */
const OpenAI = require('openai').OpenAI || require('openai').default || require('openai');

class LlmPermanentError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LlmPermanentError';
    this.cause = cause;
  }
}

function jitter(base) {
  const factor = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  return base * factor;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  const status = err && (err.status || err.statusCode);
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
}

function createOpenAICompatClient(opts) {
  const opts2 = opts || {};
  return new OpenAI({
    apiKey: opts2.apiKey || process.env.OPENAI_API_KEY,
    baseURL: opts2.baseURL || process.env.OPENAI_BASE_URL || 'https://api.minimax.io/v1',
  });
}

/**
 * Extract the assistant text from an OpenAI Responses API payload.
 *
 * Shape:
 *   { output: [ { type: 'message', role: 'assistant',
 *                 content: [ { type: 'output_text', text: '...' }, ... ] } ],
 *     output_text: '...' (convenience aggregate),
 *     usage: { input_tokens, output_tokens, total_tokens, ... } }
 *
 * Returns { contentText, usage }. Falls back to the `output_text` aggregate
 * when the structured `output[].content[].text` chain is missing.
 */
function extractResponsesPayload(data) {
  let contentText = '';
  if (data && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && part.type === 'output_text' && typeof part.text === 'string') {
            contentText += part.text;
          }
        }
      }
    }
  }
  if (!contentText && data && typeof data.output_text === 'string') {
    contentText = data.output_text;
  }
  const usage = (data && data.usage)
    || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  return { contentText, usage };
}

/**
 * Call MiniMax's Responses API via direct fetch.
 *
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {string} args.userPrompt
 * @param {object} [args.jsonSchema]  - if present, sets text.format
 * @param {object} [args.signal]      - external AbortSignal to forward
 * @param {string} [args.model]       - defaults to LLM_MODEL env / MiniMax-M3
 * @param {number} [args.maxRetries]  - defaults to LLM_MAX_RETRIES (2)
 * @param {string} [args.baseURL]     - defaults to OPENAI_BASE_URL env
 * @param {string} [args.apiKey]      - defaults to OPENAI_API_KEY env
 * @param {function} [args.fetch]     - injected for tests (defaults to global fetch)
 * @returns {Promise<{ content: string, usage: object }>}
 */
async function createChatCompletion(args) {
  const systemPrompt = args.systemPrompt;
  const userPrompt = args.userPrompt;
  const jsonSchema = args.jsonSchema;
  const model = args.model || process.env.LLM_MODEL || 'MiniMax-M3';
  const maxRetries = args.maxRetries != null
    ? args.maxRetries
    : Number(process.env.LLM_MAX_RETRIES || 2);
  let baseURL = (args.baseURL || process.env.OPENAI_BASE_URL || 'https://api.minimax.io/v1').replace(/\/$/, '');
  baseURL = baseURL.replace(/\/v1$/, ''); // strip trailing /v1 if present (caller may have included it)
  const apiKey = args.apiKey || process.env.OPENAI_API_KEY;
  const fetchImpl = args.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    throw new LlmPermanentError('global fetch is not available (Node >= 18 required)');
  }

  // Build the Responses-API request body. MiniMax's /v1/responses takes
  // { model, input } (not { model, messages }); the system prompt is passed
  // via the Responses-API `instructions` field, and structured outputs use
  // `text.format` (not OpenAI's `response_format`).
  const body = {
    model,
    instructions: systemPrompt,
    input: userPrompt,
  };
  if (jsonSchema && jsonSchema.schema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: jsonSchema.name || 'structured_output',
        schema: jsonSchema.schema,
        strict: true,
      },
    };
  }

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let forwarded = false;
    if (args.signal) {
      // Forward external abort signals to our controller.
      const onAbort = () => controller.abort();
      args.signal.addEventListener('abort', onAbort);
      forwarded = true;
      controller._cleanupForward = () => args.signal.removeEventListener('abort', onAbort);
    }
    try {
      const resp = await fetchImpl(`${baseURL}/v1/responses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (forwarded && typeof controller._cleanupForward === 'function') controller._cleanupForward();

      if (!resp.ok) {
        const errText = await resp.text();
        const err = new Error(`llm_http_${resp.status}: ${errText.slice(0, 500)}`);
        err.status = resp.status;
        lastErr = err;
        if (!isRetryable(err) || attempt === maxRetries) {
          throw new LlmPermanentError(err.message, err);
        }
        const backoff = jitter(500 * Math.pow(2, attempt));
        await sleep(backoff);
        attempt += 1;
        continue;
      }

      const data = await resp.json();
      const { contentText, usage } = extractResponsesPayload(data);
      return { content: contentText || '', usage };
    } catch (err) {
      clearTimeout(timer);
      if (forwarded && typeof controller._cleanupForward === 'function') controller._cleanupForward();
      lastErr = err;
      // AbortError from our controller means we timed out — treat as retryable.
      if (err && err.name === 'AbortError') {
        err.status = 408;
      }
      if (!isRetryable(err) || attempt === maxRetries) {
        throw new LlmPermanentError(err.message || String(err), err);
      }
      const backoff = jitter(500 * Math.pow(2, attempt));
      await sleep(backoff);
      attempt += 1;
    }
  }
  throw new LlmPermanentError(lastErr && lastErr.message || 'llm_unreachable', lastErr);
}

module.exports = {
  createChatCompletion,
  LlmPermanentError,
  createOpenAICompatClient,
  isRetryable,
  extractResponsesPayload,
};
