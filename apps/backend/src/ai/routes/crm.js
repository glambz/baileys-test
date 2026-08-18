'use strict';
/**
 * CRM persistence routes: /api/crm/entities + /api/crm/records
 */
const express = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');
const { getPool } = require('../../db/client');
const { requireTenant } = require('./_middleware');

const router = express.Router();
router.use(requireTenant);

// GET /api/crm/entities
router.get('/entities', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, name, label, icon, description, schema_json, version, deleted_at, created_at, updated_at
       FROM entity_definitions WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [req.tenantId]
    );
    return res.json({ entities: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label,
      icon: row.icon,
      description: row.description,
      schemaJson: row.schema_json,
      version: row.version,
      createdAt: row.created_at instanceof Date ? row.created_at.getTime() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : row.updated_at,
    })) });
  } catch (err) {
    next(err);
  }
});

// POST /api/crm/entities
const CreateEntitySchema = z.object({
  name: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  icon: z.string().optional(),
  description: z.string().optional(),
  schemaJson: z.any(),
});
router.post('/entities', async (req, res, next) => {
  try {
    const parsed = CreateEntitySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }
    const id = `ent_${nanoid(12)}`;
    const pool = getPool();
    await pool.query(
      `INSERT INTO entity_definitions (id, tenant_id, name, label, icon, description, schema_json, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 1)`,
      [
        id,
        req.tenantId,
        parsed.data.name,
        parsed.data.label,
        parsed.data.icon || null,
        parsed.data.description || null,
        JSON.stringify(parsed.data.schemaJson),
      ]
    );
    return res.status(201).json({ id, ...parsed.data, version: 1 });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/crm/entities/:id (creates new version)
router.patch('/entities/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query('SELECT max(version) AS v FROM entity_definitions WHERE id = $1', [req.params.id]);
    const next_v = (r.rows[0] && r.rows[0].v ? Number(r.rows[0].v) : 0) + 1;
    const newId = `${req.params.id}__v${next_v}`;
    const old = await pool.query('SELECT * FROM entity_definitions WHERE id = $1', [req.params.id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'EntityNotFound' });
    const cur = old.rows[0];
    const merged = {
      name: (req.body && req.body.name) || cur.name,
      label: (req.body && req.body.label) || cur.label,
      icon: (req.body && req.body.icon) || cur.icon,
      description: (req.body && req.body.description) || cur.description,
      schema_json: (req.body && req.body.schemaJson) || cur.schema_json,
    };
    await pool.query(
      `INSERT INTO entity_definitions (id, tenant_id, name, label, icon, description, schema_json, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now())`,
      [newId, cur.tenant_id, merged.name, merged.label, merged.icon, merged.description, JSON.stringify(merged.schema_json), next_v]
    );
    return res.json({ id: newId, version: next_v });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/crm/entities/:id (soft delete)
router.delete('/entities/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query(
      'UPDATE entity_definitions SET deleted_at = now() WHERE id = $1',
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/crm/entities/:id/records
router.get('/entities/:id/records', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const contactId = req.query.contactId;
    const q = req.query.q;
    const pool = getPool();
    const params = [req.params.id, req.tenantId];
    let where = 'WHERE entity_id = $1 AND tenant_id = $2';
    if (contactId) {
      params.push(contactId);
      where += ` AND contact_id = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND data::text ILIKE $${params.length}`;
    }
    params.push(limit, offset);
    const r = await pool.query(
      `SELECT id, entity_id, contact_id, data, created_by, created_at, updated_at
       FROM entity_records ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    // Return the FE-friendly {records, total, limit, offset} envelope.
    // Total is a separate count query (cheap; same WHERE clause).
    const totalParams = params.slice(0, params.length - 2);  // exclude limit + offset
    const countRes = await pool.query(
      `SELECT count(*)::int AS total FROM entity_records ${where}`,
      totalParams
    );
    const total = countRes.rows[0] ? Number(countRes.rows[0].total) : 0;
    return res.json({
      records: r.rows.map((row) => ({
        id: row.id,
        entityId: row.entity_id,
        contactId: row.contact_id,
        data: row.data,
        createdBy: row.created_by,
        createdAt: row.created_at instanceof Date ? row.created_at.getTime() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : row.updated_at,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crm/entities/:id/records
router.post('/entities/:id/records', async (req, res, next) => {
  try {
    const id = `rec_${nanoid(12)}`;
    const contactId = req.body && req.body.contactId;
    const data = (req.body && req.body.data) || {};
    const pool = getPool();
    await pool.query(
      `INSERT INTO entity_records (id, tenant_id, entity_id, contact_id, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [id, req.tenantId, req.params.id, contactId || null, JSON.stringify(data)]
    );
    return res.status(201).json({ id, entityId: req.params.id, contactId, data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/crm/records/:id
router.patch('/records/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const contactId = req.body && req.body.contactId;
    const data = (req.body && req.body.data) || {};
    const fields = [];
    const params = [];
    let i = 1;
    if (contactId !== undefined) { fields.push(`contact_id = $${i}`); params.push(contactId); i += 1; }
    if (data && Object.keys(data).length > 0) { fields.push(`data = $${i}::jsonb`); params.push(JSON.stringify(data)); i += 1; }
    fields.push(`updated_at = now()`);
    params.push(req.params.id);
    await pool.query(
      `UPDATE entity_records SET ${fields.join(', ')} WHERE id = $${i}`,
      params
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/crm/records/:id
router.delete('/records/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM entity_records WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;