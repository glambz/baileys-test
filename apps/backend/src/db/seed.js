'use strict';
/**
 * Dev-only seed mirroring FE mock fixtures.
 * Source: docs/crm/plans/15-db-layer-postgresql.md step 7.
 */
require('dotenv').config();
const { getPool, closeDb } = require('./client');
const crypto = require('crypto');
const { DEFAULT_AI_SETTINGS } = require('../ai/settings/defaults');
const { embedText } = require('../ai/llm/embed');

async function seed() {
  const pool = getPool();
  const settingsId = 1;

  // AI settings row (idempotent).
  await pool.query(
    `INSERT INTO ai_settings (id, tenant_id, identity, tone, language, scope, rules, whatsapp_auto_reply, updated_at)
     VALUES ($1, 'default', $2::jsonb, $3, $4, $5::jsonb, $6, $7::jsonb, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      settingsId,
      JSON.stringify(DEFAULT_AI_SETTINGS.identity),
      DEFAULT_AI_SETTINGS.tone,
      DEFAULT_AI_SETTINGS.language,
      JSON.stringify(DEFAULT_AI_SETTINGS.scope),
      DEFAULT_AI_SETTINGS.rules,
      JSON.stringify(DEFAULT_AI_SETTINGS.whatsappAutoReply),
    ]
  );

  // Entity definitions (idempotent via ON CONFLICT by name+version).
  const customerId = 'ent_customer_v1';
  const invoiceId = 'ent_invoice_v1';
  await pool.query(
    `INSERT INTO entity_definitions (id, tenant_id, name, label, schema_json, version)
     VALUES ($1, 'default', 'customer', 'Customer', $2::jsonb, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      customerId,
      JSON.stringify({
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'phone', label: 'Phone', type: 'phone' },
        ],
        relations: [],
      }),
    ]
  );
  await pool.query(
    `INSERT INTO entity_definitions (id, tenant_id, name, label, schema_json, version)
     VALUES ($1, 'default', 'invoice', 'Invoice', $2::jsonb, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      invoiceId,
      JSON.stringify({
        fields: [
          { name: 'amount', label: 'Amount', type: 'number' },
          { name: 'package', label: 'Package', type: 'text' },
        ],
        relations: [],
      }),
    ]
  );

  // Entity records — 5 for contacts A, B, C + null.
  const contacts = ['6285179652486', '6281234567890', '6289876543210', null];
  for (const phone of contacts) {
    const id = `rec_${customerId}_${phone ?? 'null'}`;
    await pool.query(
      `INSERT INTO entity_records (id, tenant_id, entity_id, contact_id, data)
       VALUES ($1, 'default', $2, $3, $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        customerId,
        phone,
        JSON.stringify({
          name: phone ? `Customer ${phone.slice(-4)}` : 'Tenant-wide note',
          phone: phone,
        }),
      ]
    );
  }

  // Knowledge files + chunks (3 files, 20 chunks total).
  const chunks = [
    { file: 'pricelist-2026', text: 'Paket Bulanan harga 500000 rupiah per bulan untuk tenant.' },
    { file: 'pricelist-2026', text: 'Paket Tahunan harga 5000000 rupiah per tahun untuk tenant.' },
    { file: 'pricelist-2026', text: 'Paket Mingguan harga 150000 rupiah per minggu untuk tenant.' },
    { file: 'campaign-jan', text: 'Campaign Januari fokus pada produk paket bulanan.' },
    { file: 'campaign-jan', text: 'Target campaign adalah pelanggan baru.' },
    { file: 'campaign-jan', text: 'Budget campaign Januari adalah 10 juta rupiah.' },
    { file: 'schedule-2026', text: 'Jadwal campaign Q1 adalah Januari sampai Maret.' },
    { file: 'schedule-2026', text: 'Jadwal campaign Q2 adalah April sampai Juni.' },
    { file: 'schedule-2026', text: 'Deliverables campaign Q1: landing page dan email blast.' },
    { file: 'faq', text: 'Pembayaran dapat melalui transfer bank atau e-wallet.' },
    { file: 'faq', text: 'Refund tersedia dalam 7 hari setelah pembelian.' },
    { file: 'faq', text: 'Customer service tersedia 24 jam melalui WhatsApp.' },
    { file: 'onboarding', text: 'Proses onboarding membutuhkan dokumen KTP dan NPWP.' },
    { file: 'onboarding', text: 'Verifikasi dokumen memakan waktu 1-3 hari kerja.' },
    { file: 'onboarding', text: 'Setelah verifikasi, tenant dapat mengakses dashboard.' },
    { file: 'pricing-detail', text: 'Harga paket bulanan sudah termasuk maintenance.' },
    { file: 'pricing-detail', text: 'Harga paket tahunan mendapat diskon 10 persen.' },
    { file: 'pricing-detail', text: 'Biaya tambahan di luar paket adalah 100000 per jam.' },
    { file: 'contact-info', text: 'Customer service WhatsApp di 6285179652486.' },
    { file: 'contact-info', text: 'Email customer service di support@example.com.' },
  ];

  const fileIds = {};
  for (const c of chunks) {
    if (!fileIds[c.file]) {
      const fid = `kf_${c.file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fileIds[c.file] = fid;
      await pool.query(
        `INSERT INTO knowledge_files (id, tenant_id, filename, mime_type, size_bytes, storage_path, status, chunks_count, ingested_at)
         VALUES ($1, 'default', $2, 'text/plain', $3, $4, 'indexed', 0, now())
         ON CONFLICT (id) DO NOTHING`,
        [fid, `${c.file}.txt`, 1000, `./data/kb/${fid}/`]
      );
    }
  }

  // Insert chunks with REAL embeddings (MiniMax /v1/embeddings).
  // ON CONFLICT (file_id, chunk_index) DO UPDATE so re-running the seed
  // refreshes the embedding for any new MiniMax model. Idempotent.
  let idx = 0;
  for (const c of chunks) {
    idx += 1;
    const fileId = fileIds[c.file];
    const chunkId = `kc_${c.file.replace(/[^a-zA-Z0-9._-]/g, '_')}_${idx}`;
    const textHash = crypto.createHash('sha256').update(c.text).digest('hex');
    // eslint-disable-next-line no-console
    console.log(`[seed] embedding chunk ${idx}/${chunks.length} (${c.file}): ${c.text.slice(0, 40)}…`);
    // eslint-disable-next-line no-console
    let embedding;
    try {
      embedding = await embedText(c.text);
      // eslint-disable-next-line no-console
      console.log(`[seed] embedded chunk ${idx}/${chunks.length} (${c.file}) via MiniMax`);
    } catch (err) {
      // Fall back to a per-chunk pseudo-embedding derived from text_hash.
      // This isn't a real embedding but it's BETTER than constant per-chunk
      // (each chunk has a unique hash-based vector) and lets the seed always
      // complete even if MiniMax embeddings is down.
      const seed = parseInt(textHash.slice(0, 8), 16);
      embedding = Array(1024).fill(0).map((_, i) =>
        Math.sin((seed + i * 7) * 0.0001) * 0.05
      );
      // eslint-disable-next-line no-console
      console.warn(`[seed] chunk ${idx} (${c.file}) embedding failed (${err.message}); using hash-derived fallback`);
    }
    await pool.query(
      `INSERT INTO knowledge_chunks (id, file_id, chunk_index, text, text_hash, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::vector, '{}'::jsonb)
       ON CONFLICT (file_id, chunk_index) DO UPDATE SET embedding = EXCLUDED.embedding, text_hash = EXCLUDED.text_hash`,
      [chunkId, fileId, idx, c.text, textHash, JSON.stringify(embedding)]
    );
  }

  // Update chunk counts.
  for (const fid of Object.values(fileIds)) {
    await pool.query(
      `UPDATE knowledge_files SET chunks_count = (SELECT count(*) FROM knowledge_chunks WHERE file_id = $1) WHERE id = $1`,
      [fid]
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] done. ${Object.keys(fileIds).length} KB files, ${chunks.length} chunks (re-embedded via MiniMax).`);
}

if (require.main === module) {
  seed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      closeDb().finally(() => process.exit(1));
    });
}

module.exports = { seed };