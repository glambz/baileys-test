'use strict';
/**
 * BM25 via Postgres full-text search.
 * Source: docs/crm/plans/19-retrieval-pipeline.md step 1.
 */
const { getPool } = require('../../db/client');

async function bm25Search({ query, limit = 20, chatJid = null }) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, file_id, chunk_index, text, text_hash, metadata,
       ts_rank_cd(to_tsvector('simple', text), plainto_tsquery('simple', $1)) AS score
     FROM knowledge_chunks
     WHERE to_tsvector('simple', text) @@ plainto_tsquery('simple', $1)
       AND ($3::text IS NULL OR chat_jid = $3 OR chat_jid IS NULL)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit, chatJid]
  );
  if (r.rows.length === 0) return [];
  const maxScore = Math.max(...r.rows.map((row) => Number(row.score)));
  if (maxScore === 0) return r.rows.map((row) => ({ chunk: rowToChunk(row), score: 0 }));
  return r.rows.map((row) => ({
    chunk: rowToChunk(row),
    score: Number(row.score) / maxScore,
  }));
}

function rowToChunk(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    textHash: row.text_hash,
    metadata: row.metadata,
  };
}

/**
 * Same FTS ranking over CRM record embeddings.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap A)
 */
async function bm25SearchRecords({ query, limit = 20, tenantId = null }) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, record_id, entity_id, chunk_index, text, text_hash, metadata,
       ts_rank_cd(to_tsvector('simple', text), plainto_tsquery('simple', $1)) AS score
     FROM record_embeddings
     WHERE to_tsvector('simple', text) @@ plainto_tsquery('simple', $1)
       AND ($3::text IS NULL OR tenant_id = $3)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit, tenantId]
  );
  if (r.rows.length === 0) return [];
  const maxScore = Math.max(...r.rows.map((row) => Number(row.score)));
  const norm = maxScore === 0 ? 0 : 1 / maxScore;
  return r.rows.map((row) => ({
    chunk: recordRowToChunk(row),
    score: Number(row.score) * norm,
  }));
}

function recordRowToChunk(row) {
  return {
    id: row.id,
    fileId: null,
    recordId: row.record_id,
    entityId: row.entity_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    textHash: row.text_hash,
    metadata: row.metadata,
  };
}

module.exports = { bm25Search, bm25SearchRecords };