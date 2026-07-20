'use strict';
/**
 * KB routes: /api/crm/knowledge/*
 */
const express = require('express');
const multer = require('multer');
const { getPool } = require('../../db/client');
const { requireTenant } = require('./_middleware.js');
const { enqueue } = require('../store/ingest-worker');
const audit = require('../audit/log');

const router = express.Router();
router.use(requireTenant);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// GET /api/crm/knowledge/files
router.get('/files', async (req, res, next) => {
  try {
    const pool = getPool();
    const status = req.query.status;
    const params = [req.tenantId];
    let where = 'WHERE tenant_id = $1';
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    const r = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, status, chunks_count, last_error, ingested_at, created_at
       FROM knowledge_files ${where} ORDER BY created_at DESC`,
      params
    );
    return res.json({ files: r.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size_bytes),
      status: row.status,
      chunksCount: row.chunks_count,
      lastError: row.last_error,
      ingestedAt: row.ingested_at,
      uploadedAt: row.created_at,
    })) });
  } catch (err) {
    next(err);
  }
});

// POST /api/crm/knowledge/upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NoFile' });
    const fileId = await enqueue({
      tenantId: req.tenantId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });
    await audit.write('kb_ingest', {
      fileId,
      tenantId: req.tenantId,
      status: 'started',
    });
    return res.status(202).json({ fileId, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// GET /api/crm/knowledge/files/:id
router.get('/files/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      'SELECT * FROM knowledge_files WHERE id = $1',
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'FileNotFound' });
    const row = r.rows[0];
    return res.json({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size_bytes),
      status: row.status,
      chunksCount: row.chunks_count,
      lastError: row.last_error,
      ingestedAt: row.ingested_at,
      uploadedAt: row.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/crm/knowledge/files/:id
router.delete('/files/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM knowledge_files WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;