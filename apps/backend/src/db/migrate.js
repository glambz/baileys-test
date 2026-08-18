'use strict';
/**
 * Idempotent SQL migration runner.
 * Source: docs/crm/plans/15-db-layer-postgresql.md step 6.
 *
 * Runs a pgvector pre-flight (src/db/check.js) BEFORE applying any
 * migration. Migrations are refused if the `vector` extension is not
 * installed, so the user gets actionable OS-specific install
 * instructions instead of a cryptic `extension "vector" is not
 * available` from `CREATE EXTENSION`.
 *
 * Pass `{ skipPreflight: true }` to bypass the check (used by tests
 * and by callers that already verified pgvector themselves).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPool, closeDb } = require('./client');
const { check: preflightCheck, formatCheckResult } = require('./check');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum TEXT NOT NULL
    )
  `);
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function appliedVersions(pool) {
  const r = await pool.query('SELECT version FROM schema_migrations');
  return new Set(r.rows.map((row) => row.version));
}

async function runMigrations(opts = {}) {
  const pool = getPool();

  // Pre-flight: refuse to migrate if Postgres is unreachable or the
  // pgvector extension is missing. Skippable for tests / callers that
  // already verified the extension.
  if (!opts.skipPreflight) {
    const pre = await preflightCheck({ pool });
    if (!pre.ok) {
      const code = formatCheckResult(pre);
      const e = new Error(
        `pre-flight check failed (${pre.code}): ${pre.message}`
      );
      e.code = pre.code;
      e.exitCode = code;
      e.preflight = pre;
      throw e;
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] preflight OK — ${pre.version}`);
  }

  await ensureMigrationsTable();
  const files = listMigrationFiles();
  const applied = await appliedVersions(pool);

  const forceVersion = process.env.FORCE_VERSION;
  let ran = 0;

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version) && forceVersion !== version) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(sql);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version, checksum)
         VALUES ($1, $2)
         ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
        [version, sum]
      );
      await client.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${version}`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error(`[migrate] FAILED ${version}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }
  if (ran === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrate] nothing to apply');
  }
  return ran;
}

async function status() {
  const pool = getPool();
  await ensureMigrationsTable();
  const r = await pool.query(
    'SELECT version, applied_at, checksum FROM schema_migrations ORDER BY version'
  );
  // eslint-disable-next-line no-console
  console.log('[migrate] applied:');
  for (const row of r.rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.version}\t${row.applied_at.toISOString()}\t${row.checksum.slice(0, 12)}`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      closeDb().finally(() => process.exit(1));
    });
}

module.exports = { runMigrations, status };