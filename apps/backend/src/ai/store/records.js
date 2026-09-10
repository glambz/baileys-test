'use strict';
/**
 * CRM record -> vector index.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap A)
 *
 * Keeps `record_embeddings` in sync with `entity_records`. Called by the
 * CRM routes on create/update; delete is handled by the FK cascade on
 * record_embeddings.record_id, so there is no deindex call on that path.
 *
 * Records are flattened to "Label: value" lines using the entity's
 * schemaJson field labels, so the embedded text reads the way a person
 * would write it and matches natural-language queries. Falls back to the
 * raw JSON key when a field has no label.
 */
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const { getPool } = require('../../db/client');
const { chunkText } = require('../retrieval/chunker');
const { embedText } = require('../llm/embed');

/**
 * Flatten a record's `data` jsonb into embeddable text.
 *
 * @param {object} args
 * @param {object} args.data        - the record's data jsonb
 * @param {object} [args.schemaJson] - entity schema, for field labels
 * @param {string} [args.entityLabel] - human label for the entity
 * @returns {string}
 */
function flattenRecord({ data, schemaJson, entityLabel }) {
  const fields = (schemaJson && Array.isArray(schemaJson.fields)) ? schemaJson.fields : [];
  const labelByName = new Map(fields.map((f) => [f.name, f.label || f.name]));

  const lines = [];
  if (entityLabel) lines.push(String(entityLabel));

  for (const [key, value] of Object.entries(data || {})) {
    if (value === null || value === undefined || value === '') continue;
    const label = labelByName.get(key) || key;
    // Objects/arrays are JSON-stringified rather than skipped: a relation
    // id or a tag list is still worth matching on.
    const rendered = (typeof value === 'object')
      ? JSON.stringify(value)
      : String(value);
    lines.push(`${label}: ${rendered}`);
  }
  return lines.join('\n');
}

/**
 * (Re)index one record. Idempotent: replaces every chunk for the record.
 *
 * Deletes-then-inserts inside a transaction so a record whose new text
 * produces fewer chunks than before does not leave orphans behind, and so
 * a mid-way embedding failure cannot leave the index half-updated.
 */
async function indexRecord({ recordId, entityId, tenantId, data, schemaJson, entityLabel }) {
  if (!recordId) throw new Error('indexRecord: recordId required');
  const text = flattenRecord({ data, schemaJson, entityLabel });

  const pool = getPool();
  // Nothing embeddable (e.g. every field cleared) — drop the old index
  // rows and stop. Leaving stale text indexed would surface deleted values.
  if (!text.trim()) {
    await pool.query('DELETE FROM record_embeddings WHERE record_id = $1', [recordId]);
    return { recordId, chunks: 0 };
  }

  // Embedding happens OUTSIDE the transaction on purpose — holding one open
  // across N network round-trips to the sidecar would pin a connection for
  // seconds. The cost of that choice is this catch: `embedText` throws on a
  // down sidecar or a dim mismatch, and without cleanup the record's PREVIOUS
  // chunks would survive untouched. That is the dangerous failure direction:
  // since these chunks are both a retrieval source (retrieval/hybrid.js) and a
  // grounding source for the numerical gate (whatsapp/trigger.js), stale text
  // would let the AI keep quoting a superseded value *with the gate's
  // approval*. Failing to "absent" is safe; failing to "stale" is not — so
  // drop the old rows and let the caller report that the record is
  // unsearchable until the next successful write.
  const chunks = chunkText({ text });
  const embedded = [];
  try {
    for (const c of chunks) {
      embedded.push({ ...c, embedding: await embedText(c.text) });
    }
  } catch (err) {
    await pool
      .query('DELETE FROM record_embeddings WHERE record_id = $1', [recordId])
      .catch(() => {});
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM record_embeddings WHERE record_id = $1', [recordId]);
    for (let i = 0; i < embedded.length; i += 1) {
      const c = embedded[i];
      await client.query(
        `INSERT INTO record_embeddings
           (id, record_id, entity_id, tenant_id, chunk_index, text, text_hash, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9::jsonb)`,
        [
          `re_${nanoid(12)}`,
          recordId,
          entityId || null,
          tenantId || 'default',
          i,
          c.text,
          crypto.createHash('sha256').update(c.text).digest('hex'),
          JSON.stringify(c.embedding),
          JSON.stringify({ ...(c.metadata || {}), recordId, entityId: entityId || null }),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { recordId, chunks: embedded.length };
}

/**
 * Explicit deindex. The FK cascade covers record deletion, so this exists
 * for callers that need to drop the index without dropping the record.
 */
async function deindexRecord(recordId) {
  if (!recordId) return { recordId, deleted: 0 };
  const pool = getPool();
  const r = await pool.query('DELETE FROM record_embeddings WHERE record_id = $1', [recordId]);
  return { recordId, deleted: r.rowCount };
}

/**
 * Load the entity row a record belongs to, for labels. Returns null when
 * the entity is missing so indexing degrades to raw key names rather than
 * failing the write.
 */
async function loadEntityForRecord(recordId) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT e.id, e.label, e.schema_json
       FROM entity_records r
       JOIN entity_definitions e ON e.id = r.entity_id
      WHERE r.id = $1`,
    [recordId]
  );
  if (r.rows.length === 0) return null;
  return { id: r.rows[0].id, label: r.rows[0].label, schemaJson: r.rows[0].schema_json };
}

module.exports = { indexRecord, deindexRecord, flattenRecord, loadEntityForRecord };
