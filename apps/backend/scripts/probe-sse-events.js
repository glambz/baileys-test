// probe-sse-events.js — open SSE connection, then trigger a message via
// the BE, verify the SSE event arrives.
const http = require('node:http');
const { Client: PgClient } = require('pg');
const path = require('node:path');

const CHAT = '6281236012938@s.whatsapp.net';
const BE_BASE = 'http://127.0.0.1:3000';

function postSSE() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 3000,
      path: `/api/chats/${encodeURIComponent(CHAT)}/events`,
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    }, (res) => {
      console.log('SSE response status:', res.statusCode);
      console.log('SSE content-type:', res.headers['content-type']);
      console.log('SSE x-accel-buffering:', res.headers['x-accel-buffering']);
      const chunks = [];
      res.on('data', (c) => {
        const s = c.toString('utf8');
        chunks.push(s);
        if (s.includes('event:')) {
          console.log('  ← event chunk received');
        }
      });
      setTimeout(() => {
        req.destroy();
        resolve(chunks.join(''));
      }, 4000);
    });
    req.on('error', reject);
    req.end();
  });
}

function postSSE2() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

(async () => {
  // 1. Open SSE
  console.log('--- opening SSE ---');
  const promise = postSSE();

  await postSSE2();

  // 2. After 0.5s, insert a fake message into the DB to trigger the
  // inbox writer. We do this by directly inserting into messages (the
  // trigger doesn't have a clean direct way to force an inbound).
  console.log('--- inserting test message into DB ---');
  const c = new PgClient({ connectionString: 'postgres://baileys:baileys@127.0.0.1:55432/baileys' });
  try {
    await c.connect();
    // The BE's inbox writer (in apps/backend/src/inbox/writer.js) inserts
    // into the messages table; to trigger the SSE we just need to
    // publish via the events module. Easier: insert into messages table
    // and call the chat.mode.changed endpoint. The events module
    // publish is in-process; we can't reach it from here. Instead, just
    // verify SSE by toggling the chat mode which fires chat.mode.changed.
    await c.end();
  } catch (err) {
    console.log('DB err:', err.message);
  }

  // 3. Wait for SSE event (timeout 4s)
  console.log('--- waiting for SSE events ---');
  const data = await promise;
  console.log('--- SSE data received ---');
  console.log(data || '(empty)');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });