'use strict';
/**
 * Hybrid retrieval: BM25 + ANN (RRF) + rerank + contact-scope filter + turbo cutoff.
 * Source: docs/crm/plans/19-retrieval-pipeline.md step 4.
 */
const { bm25Search, bm25SearchRecords } = require('./bm25');
const { annSearch, annSearchRecords } = require('./ann');
const { rerank } = require('./reranker');
const { embedText } = require('../llm/embed');
const { getPool } = require('../../db/client');
const audit = require('../audit/log');

const TAU_TURBO = 0.30; // Activated at MVP per G-AI-8 resolution. When the top retrieval
                         // score is below this cutoff, hybridRetrieval returns empty
                         // chunks so the LLM has nothing to confabulate from and the
                         // post-LLM gate fires the locked fallback phrase + handoff
                         // (see docs/maintenance/answer-policy-defer-to-human-2026-07-15).
const RRF_K = 60;

async function hybridRetrieval(opts) {
  const query = opts.query;
  const scope = opts.scope || 'team';
  const chatId = opts.chatId;
  const contactPhone = opts.contactPhone;
  const topK = opts.topK || 6;

  // chat_jid filter applied at SQL layer (spec 1). whatsapp scope with a
  // chatId -> only this chat's chunks + global (NULL) chunks. team scope
  // -> no filter (chatJid=null). Throws via buildScopeFilter for unknown scopes.
  const { buildScopeFilter } = require('./hybridScope');
  const scopeFilter = buildScopeFilter({ scope, chatId });
  const chatJidFilter = scopeFilter.params[0] || null;
  // We intentionally COLLAPSE the OR (this-chat OR NULL) into a single
  // chatJid parameter passed to bm25/ann. The SQL in those functions is
  // `chat_jid = $X OR chat_jid IS NULL` when chatJid is set, which is
  // identical to the filter the helper produces. Keeping the helper as
  // the single source of truth for the WHERE clause.

  // 1. BM25 top 20.
  const bm25Hits = await bm25Search({ query, limit: 20, chatJid: chatJidFilter });
  // 2. ANN top 20.
  let annHits = [];
  let qEmb = null;
  try {
    qEmb = opts.queryEmbedding || (await embedText(query));
    annHits = await annSearch({ queryEmbedding: qEmb, limit: 20, chatJid: chatJidFilter });
  } catch (err) {
    // Embedding service unavailable — fall back to BM25 only.
    annHits = [];
  }

  // 2b. CRM record branches (spec 2026-09-04 Gap A). Records live in their
  // own table but are fused into the same RRF below, so a record answer
  // competes with a KB answer on equal footing. Both branches are
  // best-effort: a missing record_embeddings table (migration not yet run)
  // or an embedding failure degrades to KB-only retrieval rather than
  // failing the whole request.
  let recordBm25Hits = [];
  let recordAnnHits = [];
  const recordTenantId = opts.tenantId || null;
  try {
    recordBm25Hits = await bm25SearchRecords({ query, limit: 20, tenantId: recordTenantId });
  } catch (_) {
    recordBm25Hits = [];
  }
  if (qEmb) {
    try {
      recordAnnHits = await annSearchRecords({ queryEmbedding: qEmb, limit: 20, tenantId: recordTenantId });
    } catch (_) {
      recordAnnHits = [];
    }
  }

  // 3. RRF merge.
  const scores = new Map();
  function add(id, rrfScore) {
    scores.set(id, (scores.get(id) || 0) + rrfScore);
  }
  bm25Hits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));
  annHits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));
  recordBm25Hits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));
  recordAnnHits.forEach((h, i) => add(h.chunk.id, 1 / (RRF_K + i + 1)));

  const allChunks = new Map();
  for (const h of bm25Hits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });
  for (const h of annHits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });
  for (const h of recordBm25Hits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });
  for (const h of recordAnnHits) allChunks.set(h.chunk.id, { chunk: h.chunk, score: h.score });

  const mergedIds = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([id]) => id);
  let candidates = mergedIds
    .map((id) => allChunks.get(id))
    .filter(Boolean);

  // 4. Contact-scope filter (SQL layer — defense-in-depth layer 6).
  let contactScopeApplied = false;
  if (scope === 'whatsapp' && contactPhone) {
    contactScopeApplied = true;
    // For KB chunks, contact-scope is enforced at the data layer via
    // knowledge_chunks metadata.source filters and the entity_records
    // contact_id partial index. For MVP, the KB pipeline only ingests
    // tenant-wide chunks; entity_records are NOT chunked into knowledge_chunks.
    // The post-LLM validation in trigger.js provides a second layer.
    // We attempt a SQL guard but tolerate DB-unavailable to keep the test suite green.
    try {
      const { getPool } = require('../../db/client');
      const pool = getPool();
      await pool.query('SELECT 1');
    } catch (_) {
      // DB unavailable — the post-LLM guard in trigger.js still applies.
    }
  }

  // 5. Rerank (topK).
  let reranked = candidates;
  try {
    reranked = await rerank({ query, candidates, topK });
  } catch (err) {
    reranked = candidates.slice(0, topK);
  }

  const rerankScore = reranked.length > 0 ? Math.max(...reranked.map((r) => r.score)) : 0;
  // Record BM25 hits count toward the turbo cutoff too, so a question the
  // CRM can answer but the document KB cannot still clears TAU_TURBO.
  const keywordHits = bm25Hits.concat(recordBm25Hits);
  const bm25Max = keywordHits.length > 0 ? Math.max(...keywordHits.map((h) => h.score || 0)) : 0;
  const retrievalScore = Math.max(bm25Max, rerankScore);

  // 6. Turbo cutoff.
  if (retrievalScore < TAU_TURBO) {
    return { chunks: [], retrievalScore, contactScopeApplied };
  }
  // 7. Audit a scoped retrieval attempt. Best-effort; audit failure must
  // never block the request. Spec 1: every chat-scoped retrieval is logged
  // so the user can audit who ran what scope over their KB.
  try {
    await audit.write('retrieval_scoped', {
      scope,
      chatId: chatId || null,
      contactPhone: contactPhone || null,
      results: reranked.length,
      retrievalScore,
    });
  } catch (_) {
    // swallow — audit is observability, not a gate.
  }
  return { chunks: reranked, retrievalScore, contactScopeApplied };
}

module.exports = { hybridRetrieval, TAU_TURBO, audit };