'use strict';
/**
 * CRM persistence routes: /api/crm/entities + /api/crm/records
 */
const express = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');
const { getPool } = require('../../db/client');
const { requireTenant } = require('./_middleware');
const records = require('../store/records');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(requireTenant);

/**
 * One canonical wire shape for an entity definition.
 *
 * Every /entities response goes through this. They previously did not:
 * POST returned `{ id, ...body, version }` and PATCH returned
 * `{ id, version }`, both missing createdAt/updatedAt — which the FE's
 * EntitySchema requires as numbers. So creating an entity inserted the row
 * and *then* threw a zod error in the client, which is why the operator saw
 * "adding new entity gives me an error, but the entity is created".
 */
function serializeEntity(row) {
  if (!row) return null;
  const ms = (v) => (v instanceof Date ? v.getTime() : v);
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    icon: row.icon,
    description: row.description,
    schemaJson: row.schema_json,
    version: row.version,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
}

const ENTITY_COLUMNS = `id, name, label, icon, description, schema_json, version, deleted_at, created_at, updated_at`;

/** Load one entity by id, scoped to the tenant. */
async function loadEntityById(pool, tenantId, id) {
  const r = await pool.query(
    `SELECT ${ENTITY_COLUMNS} FROM entity_definitions
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] || null;
}

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
    return res.json({ entities: r.rows.map(serializeEntity) });
  } catch (err) {
    next(err);
  }
});

// GET /api/crm/entities/:idOrName
//
// The FE's useEntityByName() has always called this, but it was never
// implemented — the request fell through to the /api/crm/* 404 handler,
// which is why a newly created entity "cannot be opened". Resolves by id
// first, then by name, because /crm/:entityName routes by name while the
// rest of the API addresses entities by id.
router.get('/entities/:idOrName', async (req, res, next) => {
  try {
    const pool = getPool();
    const key = req.params.idOrName;
    let row = await loadEntityById(pool, req.tenantId, key);
    if (!row) {
      const r = await pool.query(
        // `name` is not unique — nothing constrains it, and the failed-create
        // bug above left duplicates behind (three rows named "asda", one per
        // retry). Order by version then recency so the lookup is at least
        // deterministic and resolves to the newest definition rather than an
        // arbitrary row.
        `SELECT ${ENTITY_COLUMNS} FROM entity_definitions
          WHERE name = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY version DESC, created_at DESC
          LIMIT 1`,
        [key, req.tenantId]
      );
      row = r.rows[0] || null;
    }
    if (!row) return res.status(404).json({ error: 'EntityNotFound', key });
    return res.json(serializeEntity(row));
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
    // Return the STORED row, not an echo of the request. The echo omitted
    // createdAt/updatedAt, so the client's parse of a successful create
    // failed and the operator saw an error for a row that existed.
    const row = await loadEntityById(pool, req.tenantId, id);
    return res.status(201).json(serializeEntity(row));
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
    const row = await loadEntityById(pool, cur.tenant_id, newId);
    return res.json(serializeEntity(row));
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
    // Sync the vector index (spec 2026-09-04 Gap A). Awaited, not
    // fire-and-forget: a silent indexing failure would leave the record
    // permanently invisible to RAG with nothing to signal it.
    const indexed = await syncRecordIndex(id, req.tenantId, req.params.id, data);
    return res.status(201).json({ id, entityId: req.params.id, contactId, data, indexed });
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
    // Re-index from the stored row rather than the patch body: a PATCH may
    // carry only some fields, and the index must reflect the whole record.
    const cur = await pool.query(
      'SELECT entity_id, tenant_id, data FROM entity_records WHERE id = $1',
      [req.params.id]
    );
    let indexed = null;
    if (cur.rows.length > 0) {
      indexed = await syncRecordIndex(
        req.params.id, cur.rows[0].tenant_id, cur.rows[0].entity_id, cur.rows[0].data
      );
    }
    return res.json({ ok: true, indexed });
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

/**
 * Re-index one record into record_embeddings.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap A)
 *
 * DELETE needs no counterpart: record_embeddings.record_id is a FK with
 * ON DELETE CASCADE, so removing the record removes its vectors.
 *
 * Returns { chunks } on success, or { error } when indexing fails. The
 * write itself already succeeded at this point, so a failure here is
 * reported to the caller rather than thrown — the record exists and the
 * operator needs to know it is not searchable yet.
 */
async function syncRecordIndex(recordId, tenantId, entityId, data) {
  try {
    const entity = await records.loadEntityForRecord(recordId);
    const r = await records.indexRecord({
      recordId,
      entityId,
      tenantId,
      data,
      schemaJson: entity && entity.schemaJson,
      entityLabel: entity && entity.label,
    });
    return { chunks: r.chunks, searchable: r.chunks > 0 };
  } catch (err) {
    // indexRecord has already dropped any stale chunks for this record, so
    // the index is consistent-but-empty rather than wrong. The row itself is
    // committed, so this is not a request failure — but it is not nothing
    // either: the record is invisible to RAG until the next successful write.
    // Log it server-side so it is not discoverable only by reading a JSON
    // field, and tell the caller plainly via `searchable: false`.
    const message = String(err && err.message ? err.message : err).slice(0, 300);
    logger.warn(
      { recordId, entityId, tenantId, err: message },
      'record saved but vector indexing failed — record is not searchable until re-saved'
    );
    return { error: message, searchable: false };
  }
}

module.exports = router;