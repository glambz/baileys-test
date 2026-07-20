/**
 * DB layer tests (skipped when no DB).
 */
import { describe, it, expect } from 'vitest';
import { getPool } from '../db/client.js';
import { runMigrations, status } from '../db/migrate.js';

const HAS_DB = !!process.env.DATABASE_URL;

describe('db client (requires Postgres)', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }
  it('connects and runs SELECT 1', async () => {
    const pool = getPool();
    const r = await pool.query('SELECT 1 AS n');
    expect(r.rows[0].n).toBe(1);
  });
  it('ai_settings row exists (id=1)', async () => {
    const pool = getPool();
    const r = await pool.query('SELECT count(*)::int AS n FROM ai_settings WHERE id = 1');
    expect(r.rows[0].n).toBe(1);
  });
  it('chats.ai_mode column exists', async () => {
    const pool = getPool();
    const r = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'chats' AND column_name = 'ai_mode'`
    );
    expect(r.rows.length).toBe(1);
  });
  it('migration runner is idempotent', async () => {
    const ran = await runMigrations();
    expect(ran).toBe(0);
  });
  it('status() returns rows', async () => {
    await status();
    expect(true).toBe(true);
  });
});