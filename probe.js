const { Client } = require('pg');
const url = process.env.DATABASE_URL;
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const r1 = await c.query('SELECT current_database() AS db, current_user AS usr');
  console.log('Connected to:', r1.rows[0]);
  const r2 = await c.query(
    "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'"
  );
  console.log('pg_available_extensions for vector:', r2.rows);
  const r3 = await c.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
  console.log('pg_extension:', r3.rows);
  await c.end();
})().catch((e) => {
  console.error('Error:', e.code, e.message);
  process.exit(1);
});