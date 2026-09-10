'use strict';
/**
 * Reranker via MiniMax embedding cosine.
 * Source: docs/crm/plans/19-retrieval-pipeline.md step 3.
 */
const { embedText } = require('../llm/embed');

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function rerank({ query, candidates, topK = 6 }) {
  const queryEmb = await embedText(query);
  const scored = [];
  for (const c of candidates) {
    const emb = c.chunk && c.chunk.embedding;
    if (!emb) {
      scored.push({ chunk: c.chunk, score: c.score || 0 });
      continue;
    }
    scored.push({ chunk: c.chunk, score: cosine(queryEmb, emb) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { rerank };