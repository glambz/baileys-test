/**
 * CRM record -> vector index.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap A)
 *
 * Covers the lifecycle that was previously missing entirely: creating a
 * record indexes it, updating re-indexes it without leaving orphan chunks,
 * and deleting it drops its vectors via the FK cascade.
 *
 * DB-gated. Imports are top-level (not inside beforeAll) so a failure in
 * setup cannot leave `getPool` unbound and turn a real error into a
 * confusing "getPool is not a function" during teardown.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const HAS_DB = !!process.env.DATABASE_URL;

const { getPool } = await import('../src/db/client.js');
const { indexRecord, deindexRecord, flattenRecord } = await import('../src/ai/store/records.js');

const ENTITY_ID = 'ent_rectest_v1';
const RECORD_ID = 'rec_rectest_0001';

describe('flattenRecord', () => {
  it('renders schema labels, skips empty values, stringifies objects', () => {
    const text = flattenRecord({
      data: { amount: 500, package: 'Gold', note: '', missing: null, tags: ['a', 'b'] },
      schemaJson: { fields: [{ name: 'amount', label: 'Amount' }, { name: 'package', label: 'Package' }] },
      entityLabel: 'Invoice',
    });
    expect(text).toContain('Invoice');
    expect(text).toContain('Amount: 500');
    expect(text).toContain('Package: Gold');
    expect(text).toContain('Tags: ["a","b"]'.replace('Tags', 'tags'));
    // Empty string and null are omitted rather than indexed as blanks.
    expect(text).not.toContain('note:');
    expect(text).not.toContain('missing:');
  });

  it('falls back to the raw key when the schema has no label', () => {
    const text = flattenRecord({ data: { weird_key: 'v' }, schemaJson: { fields: [] } });
    expect(text).toContain('weird_key: v');
  });
});

describe.skipIf(!HAS_DB)('record_embeddings lifecycle', () => {
  beforeAll(async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO entity_definitions (id, tenant_id, name, label, schema_json, version)
       VALUES ($1, 'default', 'rectest', 'RecTest', $2::jsonb, 1)
       ON CONFLICT (id) DO UPDATE SET schema_json = EXCLUDED.schema_json`,
      [ENTITY_ID, JSON.stringify({ fields: [{ name: 'package', label: 'Package' }], relations: [] })]
    );
    await pool.query(
      `INSERT INTO entity_records (id, tenant_id, entity_id, data)
       VALUES ($1, 'default', $2, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [RECORD_ID, ENTITY_ID, JSON.stringify({ package: 'AlphaOne' })]
    );
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM entity_records WHERE id = $1', [RECORD_ID]);
    await pool.query('DELETE FROM entity_definitions WHERE id = $1', [ENTITY_ID]);
  });

  it('indexes a record with a non-null embedding', async () => {
    const r = await indexRecord({
      recordId: RECORD_ID,
      entityId: ENTITY_ID,
      tenantId: 'default',
      data: { package: 'AlphaOne' },
      schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
      entityLabel: 'RecTest',
    });
    expect(r.chunks).toBeGreaterThan(0);

    const rows = await getPool().query(
      'SELECT text, embedding IS NOT NULL AS has_vec FROM record_embeddings WHERE record_id = $1',
      [RECORD_ID]
    );
    expect(rows.rows.length).toBe(r.chunks);
    expect(rows.rows[0].has_vec).toBe(true);
    expect(rows.rows[0].text).toContain('AlphaOne');
  });

  it('re-indexing replaces old chunks instead of accumulating them', async () => {
    await indexRecord({
      recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default',
      data: { package: 'BetaTwo' },
      schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
    });
    const rows = await getPool().query(
      'SELECT text FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    const all = rows.rows.map((x) => x.text).join('\n');
    expect(all).toContain('BetaTwo');
    // The superseded value must be gone, not merely outranked.
    expect(all).not.toContain('AlphaOne');
  });

  it('clears the index when a record has no embeddable content left', async () => {
    await indexRecord({ recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default', data: {} });
    const rows = await getPool().query(
      'SELECT count(*)::int AS n FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('deleting the record cascades to its embeddings', async () => {
    await indexRecord({
      recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default',
      data: { package: 'GammaThree' },
      schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
    });
    const before = await getPool().query(
      'SELECT count(*)::int AS n FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    expect(before.rows[0].n).toBeGreaterThan(0);

    await getPool().query('DELETE FROM entity_records WHERE id = $1', [RECORD_ID]);

    const after = await getPool().query(
      'SELECT count(*)::int AS n FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    expect(after.rows[0].n).toBe(0);

    // Restore for afterAll's cleanup to be a no-op rather than an error.
    await getPool().query(
      `INSERT INTO entity_records (id, tenant_id, entity_id, data)
       VALUES ($1, 'default', $2, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [RECORD_ID, ENTITY_ID]
    );
  });

  it('drops stale chunks when embedding fails mid-reindex', async () => {
    // Regression guard. embedText() runs outside the transaction (holding one
    // open across N sidecar round-trips would pin a connection), so a failure
    // used to leave the PREVIOUS chunks in place. That is the dangerous
    // direction: record_embeddings is both a retrieval source and a grounding
    // source for trigger.js's numerical gate, so stale text would let the AI
    // keep quoting a superseded value *with the gate's approval*.
    await indexRecord({
      recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default',
      data: { package: 'OldValue5000000' },
      schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
    });
    const before = await getPool().query(
      'SELECT count(*)::int AS n FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    expect(before.rows[0].n).toBeGreaterThan(0);

    // Simulate the sidecar being down for the re-index.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new Error('sidecar down'); });
    let threw = false;
    try {
      await indexRecord({
        recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default',
        data: { package: 'NewValue7500000' },
        schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
      });
    } catch {
      threw = true;
    } finally {
      globalThis.fetch = originalFetch;
    }

    // It must surface the failure to the caller...
    expect(threw).toBe(true);
    // ...and must NOT have left the superseded value indexed.
    const after = await getPool().query(
      'SELECT text FROM record_embeddings WHERE record_id = $1', [RECORD_ID]
    );
    const remaining = after.rows.map((r) => r.text).join(' ');
    expect(remaining).not.toContain('OldValue5000000');
    expect(after.rows.length).toBe(0);
  });

  it('deindexRecord removes vectors without touching the record', async () => {
    await indexRecord({
      recordId: RECORD_ID, entityId: ENTITY_ID, tenantId: 'default',
      data: { package: 'DeltaFour' },
      schemaJson: { fields: [{ name: 'package', label: 'Package' }] },
    });
    const r = await deindexRecord(RECORD_ID);
    expect(r.deleted).toBeGreaterThan(0);

    const rec = await getPool().query(
      'SELECT count(*)::int AS n FROM entity_records WHERE id = $1', [RECORD_ID]
    );
    expect(rec.rows[0].n).toBe(1);
  });
});
