'use strict';
/**
 * KB ingest pipeline.
 * Source: docs/crm/plans/18-kb-ingestion.md step 4.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const { getPool } = require('../../db/client');
const { extractText } = require('../retrieval/ocr');
const { chunkText } = require('../retrieval/chunker');
const { embedText } = require('../llm/embed');
const chunksStore = require('./chunks');

const KB_DIR = process.env.KB_DIR || './data/kb';

async function ingestFile({ tenantId, filename, mimeType, buffer }) {
  tenantId = tenantId || 'default';
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const pool = getPool();

  // Idempotency check.
  const existing = await pool.query(
    `SELECT id, status FROM knowledge_files
     WHERE tenant_id = $1 AND storage_path LIKE $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, `%${sha.slice(0, 8)}%`]
  );

  // More robust: hash entire path. Use the full file content hash via filename+sha storage.
  let fileId;
  if (existing.rows.length > 0 && existing.rows[0].status === 'indexed') {
    fileId = existing.rows[0].id;
    const c = await pool.query(
      'SELECT count(*)::int AS n FROM knowledge_chunks WHERE file_id = $1',
      [fileId]
    );
    return { fileId, chunksCount: c.rows[0].n, idempotent: true };
  }

  fileId = `kf_${nanoid(12)}`;
  const storagePath = path.join(KB_DIR, fileId);
  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(path.join(storagePath, filename), buffer);

  await pool.query(
    `INSERT INTO knowledge_files (id, tenant_id, filename, mime_type, size_bytes, storage_path, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', now())
     ON CONFLICT (id) DO NOTHING`,
    [fileId, tenantId, filename, mimeType, buffer.length, storagePath]
  );

  try {
    await pool.query(
      `UPDATE knowledge_files SET status = 'ingesting' WHERE id = $1`,
      [fileId]
    );

    const { text } = await extractText({ buffer, mimeType });
    const chunkObjs = chunkText({ text });

    // Embed in batches of 4 concurrent.
    const concurrency = 4;
    const embedded = [];
    for (let i = 0; i < chunkObjs.length; i += concurrency) {
      const batch = chunkObjs.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((c) =>
          embedText(c.text).then((vec) => ({ ...c, embedding: vec }))
        )
      );
      embedded.push(...results);
    }

    // Upsert chunks.
    for (let i = 0; i < embedded.length; i += 1) {
      const c = embedded[i];
      const textHash = crypto.createHash('sha256').update(c.text).digest('hex');
      await chunksStore.__ingestUpsertChunk({
        id: `kc_${nanoid(12)}`,
        fileId,
        chunkIndex: i,
        text: c.text,
        textHash,
        embedding: c.embedding,
        metadata: c.metadata || {},
      });
    }

    await pool.query(
      `UPDATE knowledge_files
       SET status = 'indexed', chunks_count = $1, ingested_at = now(), last_error = NULL
       WHERE id = $2`,
      [embedded.length, fileId]
    );
    return { fileId, chunksCount: embedded.length, idempotent: false };
  } catch (err) {
    await pool.query(
      `UPDATE knowledge_files SET status = 'failed', last_error = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 500), fileId]
    );
    throw err;
  }
}

module.exports = { ingestFile };