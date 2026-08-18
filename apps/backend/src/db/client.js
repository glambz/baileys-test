'use strict';
/**
 * Postgres + Kysely client singleton.
 * Source: docs/crm/plans/15-db-layer-postgresql.md.
 */
const { Pool } = require('pg');
const { Kysely, PostgresDialect } = require('kysely');

let pool = null;
let db = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || 'postgres://baileys:baileys@localhost:5432/baileys';
  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] pool error', err);
  });
  return pool;
}

function getDb() {
  if (db) return db;
  db = new Kysely({
    dialect: new PostgresDialect({ pool: getPool() }),
  });
  return db;
}

async function closeDb() {
  if (db) {
    await db.destroy();
    db = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function withTransaction(fn) {
  const kdb = getDb();
  return kdb.transaction().execute(async (trx) => fn(trx));
}

async function resetSchema() {
  // Drop everything in the public schema and recreate it.
  const p = getPool();
  await p.query('DROP SCHEMA IF EXISTS public CASCADE');
  await p.query('CREATE SCHEMA public');
  await p.query('GRANT ALL ON SCHEMA public TO public');
}

module.exports = { getDb, getPool, closeDb, withTransaction, resetSchema };