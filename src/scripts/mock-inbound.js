'use strict';
/**
 * Manual smoke: emit a mock messages.upsert to test the AI trigger.
 * Requires a running BE + Postgres + a chats row.
 */
const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: 'localhost', port: Number(process.env.PORT || 3000), path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const chatId = process.argv[2] || '6285179652486@s.whatsapp.net';
  const body = process.argv[3] || 'Berapa harga paket Bulanan?';
  const r = await postJson('/internal/mock-inbound', { chatId, body });
  console.log(r);
}

main().catch((err) => { console.error(err); process.exit(1); });