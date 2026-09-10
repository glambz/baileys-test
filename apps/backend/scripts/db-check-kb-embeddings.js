// db-check-kb-embeddings.js
const pg = require('pg');
async function main() {
  const c = new pg.Client({ connectionString: 'postgres://baileys:baileys@127.0.0.1:55432/baileys' });
  await c.connect();
  const r = await c.query(`
    SELECT kf.id, kf.filename, kf.status, kc.chunk_index,
           (kc.embedding IS NOT NULL) AS has_embedding,
           octet_length(kc.embedding) AS emb_bytes,
           length(kc.text) AS text_len,
           substr(kc.text, 1, 100) AS preview
    FROM knowledge_files kf
    LEFT JOIN knowledge_chunks kc ON kc.file_id = kf.id
    WHERE kf.tenant_id = 'default'
    ORDER BY kf.filename, kc.chunk_index
  `);
  console.log('=== KB chunk embeddings ===');
  r.rows.forEach(row => {
    console.log(`  ${row.filename} chunk=${row.chunk_index} emb=${row.has_embedding}(${row.emb_bytes||0}b) text=${row.text_len}b  | ${row.preview}`);
  });
  await c.end();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });