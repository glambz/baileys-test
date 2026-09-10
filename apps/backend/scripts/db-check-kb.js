// db-check-kb.js
const pg = require('pg');
async function main() {
  const c = new pg.Client({ connectionString: 'postgres://baileys:baileys@127.0.0.1:55432/baileys' });
  await c.connect();
  const r = await c.query(`
    SELECT filename, status, count(*) as chunks
    FROM knowledge_files kf
    LEFT JOIN knowledge_chunks kc ON kc.file_id = kf.id
    WHERE kf.tenant_id = 'default'
    GROUP BY filename, status
    ORDER BY filename
  `);
  console.log('=== KB files ==='); r.rows.forEach(row => console.log(' ', JSON.stringify(row)));
  const r2 = await c.query("SELECT count(*) as total, count(embedding) as with_embedding FROM knowledge_chunks");
  console.log('=== chunks ===', r2.rows[0]);
  await c.end();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });