// check-dups.js — duplicate messages check
const pg = require('pg');
async function main() {
  const c = new pg.Client({ connectionString: 'postgres://baileys:baileys@127.0.0.1:55432/baileys' });
  await c.connect();
  const r = await c.query(
    "SELECT id, direction, body, timestamp, EXTRACT(EPOCH FROM to_timestamp(timestamp)) AS ep FROM messages WHERE chat_id LIKE '6281236012938%' AND direction = 'out' AND timestamp > EXTRACT(EPOCH FROM NOW()) - 86400 ORDER BY timestamp DESC LIMIT 15"
  );
  console.log('=== Recent outbound messages (last 24h) ===');
  r.rows.forEach(r => console.log(' ts=' + r.timestamp + ' id=' + r.id.slice(0, 28) + ' body=' + r.body.substring(0, 50)));
  const dup = await c.query(
    "SELECT body, count(*) AS cnt, min(timestamp) AS first_ts, max(timestamp) AS last_ts FROM messages WHERE chat_id LIKE '6281236012938%' AND timestamp > EXTRACT(EPOCH FROM NOW()) - 86400 GROUP BY body HAVING count(*) > 1"
  );
  console.log('=== Duplicate bodies (last 24h) ===');
  if (dup.rowCount === 0) console.log('  none');
  dup.rows.forEach(r => console.log(' ', JSON.stringify(r)));
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });