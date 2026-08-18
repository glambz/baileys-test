'use strict';
/**
 * pgvector cosine ANN.
 * Source: docs/crm/plans/19-retrieval-pipeline.md step 2.
 */
const { getPool } = require('../../db/client');

async function annSearch({ queryEmbedding, limit = 20, chatJid = null }) {
  const pool = getPool();
  // Accept either a number[] (from embedText) or a string (already serialized).
  const vecLiteral = Array.isArray(queryEmbedding)
    ? `[${queryEmbedding.join(',')}]`
    : String(queryEmbedding);
  const r = await pool.query(
    `SELECT id, file_id, chunk_index, text, text_hash, metadata,
       1 - (embedding <=> $1::vector) AS score
     FROM knowledge_chunks
     WHERE ($3::text IS NULL OR chat_jid = $3 OR chat_jid IS NULL)
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vecLiteral, limit, chatJid]
  );
  return r.rows.map((row) => ({
    chunk: {
      id: row.id,
      fileId: row.file_id,
      chunkIndex: row.chunk_index,
      text: row.text,
      textHash: row.text_hash,
      metadata: row.metadata,
    },
    score: Number(row.score),
  }));
}

module.exports = { annSearch };