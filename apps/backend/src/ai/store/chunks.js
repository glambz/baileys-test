'use strict';
/**
 * KB chunks store — READ-ONLY public API.
 * Source: docs/crm/plans/18-kb-ingestion.md step 3.
 *
 * Write methods are NOT exported. They are reachable only from
 * src/ai/store/ingest.js via __ingestUpsertChunk / __ingestDeleteForFile.
 * This is defense-in-depth layer 1 for the "AI never writes to KB" rule.
 */
const { getPool } = require('../../db/client');

/**
 * WRITE-RESTRICTED: only src/ai/store/ingest.js may call this.
 * chatJid: optional. NULL = global KB (visible to any chat under whatsapp scope).
 *          A specific JID = chat-scoped KB (only visible to that chat).
 */
async function __ingestUpsertChunk(chunk) {
  const pool = getPool();
  const chatJid = chunk.chatJid || null;
  const sql = `
    INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding, metadata, chat_jid)
    VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8)
    ON CONFLICT (file_id, chunk_index) DO UPDATE SET
      text = EXCLUDED.text,
      text_hash = EXCLUDED.text_hash,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      chat_jid = EXCLUDED.chat_jid
  `;
  await pool.query(sql, [
    chunk.id,
    chunk.fileId,
    chunk.chunkIndex,
    chunk.text,
    chunk.textHash,
    JSON.stringify(chunk.embedding),
    JSON.stringify(chunk.metadata || {}),
    chatJid,
  ]);
}

/**
 * WRITE-RESTRICTED: only src/ai/store/ingest.js may call this.
 */
async function __ingestDeleteForFile(fileId) {
  const pool = getPool();
  await pool.query('DELETE FROM knowledge_chunks WHERE file_id = $1', [fileId]);
}

async function getChunksForFile(fileId) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, file_id, chunk_index, text, text_hash, metadata
     FROM knowledge_chunks WHERE file_id = $1 ORDER BY chunk_index ASC`,
    [fileId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    textHash: row.text_hash,
    metadata: row.metadata,
  }));
}

async function getChunksByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, file_id, chunk_index, text, text_hash, metadata
     FROM knowledge_chunks WHERE id = ANY($1::text[])`,
    [ids]
  );
  return r.rows.map((row) => ({
    id: row.id,
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    textHash: row.text_hash,
    metadata: row.metadata,
  }));
}

async function searchByTextFts(query, limit) {
  limit = limit || 20;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, file_id, chunk_index, text, text_hash, metadata,
       ts_rank_cd(to_tsvector('simple', text), plainto_tsquery('simple', $1)) AS score
     FROM knowledge_chunks
     WHERE to_tsvector('simple', text) @@ plainto_tsquery('simple', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
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

module.exports = {
  // Public READ-ONLY API
  getChunksForFile,
  getChunksByIds,
  searchByTextFts,
  // PRIVATE write API (used only by ingest.js). Named with __ingest prefix
  // to flag them as off-limits for everything else. Not exported from
  // src/ai/store/index.js.
  __ingestUpsertChunk,
  __ingestDeleteForFile,
};