'use strict';
/**
 * MiniMax embeddings client with LRU cache.
 * Source: docs/crm/plans/17-llm-gateway.md step 5.
 */
const crypto = require('crypto');

class EmbeddingCache {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    // refresh LRU
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
  size() {
    return this.map.size;
  }
}

const cache = new EmbeddingCache(10000);

function jitter(base) {
  const factor = 1 + (Math.random() * 0.4 - 0.2);
  return base * factor;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function meanVectors(arrs) {
  const dim = arrs[0].length;
  const out = new Array(dim).fill(0);
  for (const a of arrs) {
    for (let i = 0; i < dim; i += 1) out[i] += a[i];
  }
  return out.map((v) => v / arrs.length);
}

async function rawEmbed(text, client, model, dims, maxRetries) {
  // MiniMax's /v1/embeddings endpoint uses a body shape different from OpenAI's:
  //   { model, texts: [string], type: "string" }  (NOT { model, input: string })
  // The OpenAI SDK's embeddings.create() always sends `input`, which MiniMax
  // rejects with `expr_path=texts, cause=missing required parameter`. Use a
  // direct fetch to keep control of the body shape.
  let baseURL = (process.env.OPENAI_BASE_URL || 'https://api.minimax.io/v1').replace(/\/$/, '');
  // Override: the local sentence-transformers sidecar (MarcoAland/Indonesian-bge-m3).
  // Set EMBEDDING_BASE_URL=http://127.0.0.1:8765 to use the sidecar instead of MiniMax.
  // The sidecar exposes a MiniMax-compatible /v1/embeddings endpoint that takes
  // {model, texts:[..], type:"string"} and returns {vectors:[{embedding},..]}.
  if (process.env.EMBEDDING_BASE_URL) {
    baseURL = process.env.EMBEDDING_BASE_URL.replace(/\/$/, '');
  }
  baseURL = baseURL.replace(/\/v1$/, ''); // strip trailing /v1 if present (caller may have included it)
  const apiKey = process.env.OPENAI_API_KEY;
  const fetchImpl = (typeof fetch === 'function') ? fetch : null;
  if (!fetchImpl) {
    throw new Error('embed: global fetch unavailable (Node >= 18 required)');
  }
  const body = { model, texts: [text], type: 'string' };

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetchImpl(`${baseURL}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text();
        const err = new Error(`embed_http_${resp.status}: ${errText.slice(0, 500)}`);
        err.status = resp.status;
        throw err;
      }

      const data = await resp.json();
      // Sidecar/MiniMax shape: { vectors: [<embedding> | { embedding: [...] } | [embedding, ...]],
      //                          base_resp: { status_code, status_msg } }.
      // OpenAI-compat shape (fallback): { data: [{ embedding: [...] }] }.
      // The local sentence-transformers sidecar (src/scripts/embed_sidecar.py) serves
      // BOTH `vectors` and `data` keys with `{embedding:[..]}` per element.
      let vec = null;
      if (data && Array.isArray(data.vectors)) {
        const first = data.vectors[0];
        if (Array.isArray(first)) {
          vec = first;
        } else if (first && Array.isArray(first.embedding)) {
          vec = first.embedding;
        }
      } else if (data && Array.isArray(data.data) && data.data[0] && Array.isArray(data.data[0].embedding)) {
        vec = data.data[0].embedding;
      }
      if (!Array.isArray(vec)) {
        const err = new Error(`embed: no embedding in response (vectors=${data && data.vectors ? 'present' : 'missing'})`);
        err.status = 502;
        throw err;
      }
      // If a configured dim was provided AND the response vector has a different
      // dimension, throw — the caller's downstream code (DB insert, cache key)
      // depends on the dim matching what was declared in env / migration schema.
      if (Number.isFinite(dims) && vec.length !== dims) {
        const err = new Error(
          `embed: dim mismatch — provider returned ${vec.length}-dim but EMBEDDING_DIM=${dims}. ` +
          `Either EMBEDDING_MODEL is wrong for the running sidecar, or the sidecar is ` +
          `serving a different model. Update EMBEDDING_MODEL / EMBEDDING_DIM to match.`
        );
        err.status = 502;
        throw err;
      }
      return vec;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err && err.name === 'AbortError') err.status = 408;
      const status = err && (err.status || err.statusCode);
      const retryable = status === 429 || status === 408 || (typeof status === 'number' && status >= 500);
      if (!retryable || attempt === maxRetries) throw err;
      await sleep(jitter(500 * Math.pow(2, attempt)));
      attempt += 1;
    }
  }
  throw lastErr;
}

async function embedText(text, opts) {
  opts = opts || {};
  const model = opts.model || process.env.EMBEDDING_MODEL || 'MiniMax-embed';
  // Default matches the schema (migration 004 moved every vector column to
  // VECTOR(1024) for bge-m3). The old 1536 default was a leftover from the
  // OpenAI-embeddings era and made a missing EMBEDDING_DIM fail closed with a
  // confusing dim-mismatch error instead of just working.
  const dims = opts.dims || Number(process.env.EMBEDDING_DIM || 1024);
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('embedText: text is required');
  }
  const cacheKey = crypto.createHash('sha256').update(text).digest('hex');
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // `rawEmbed` uses a direct fetch against MiniMax's /v1/embeddings endpoint
  // (the OpenAI SDK sends `input` which MiniMax rejects). It reads its own
  // baseURL/apiKey from the env, so no client is constructed here.

  // If text is short, single embed; otherwise split into 2000-char segments and average.
  const SEGMENT = 2000;
  let vec;
  if (text.length <= SEGMENT) {
    vec = await rawEmbed(text, null, model, dims, maxRetries);
  } else {
    const segments = [];
    for (let i = 0; i < text.length; i += SEGMENT) {
      segments.push(text.slice(i, i + SEGMENT));
    }
    const embeddings = [];
    for (const seg of segments) {
      embeddings.push(await rawEmbed(seg, null, model, dims, maxRetries));
    }
    vec = meanVectors(embeddings);
  }

  cache.set(cacheKey, vec);
  return vec;
}

module.exports = { embedText, EmbeddingCache, cache };