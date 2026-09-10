// backfill-lid-chats.js — one-shot migration.
const fs = require('fs');
const path = require('path');
const pg = require('pg');

// Path resolution: assume the script is run from the apps/backend dir
// (or anywhere with the repo root in the path). Look up to 3 levels.
function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Could not find project root (pnpm-workspace.yaml)');
}

const PROJECT_ROOT = findProjectRoot(process.cwd());
const INBOX_DIR = path.join(PROJECT_ROOT, 'apps/backend/runtime/inbox_logs');
const MAPPINGS_FILE = path.join(INBOX_DIR, '.lid-mappings.json');

async function main() {
  if (!fs.existsSync(MAPPINGS_FILE)) {
    console.error('No .lid-mappings.json found at', MAPPINGS_FILE);
    process.exit(1);
  }
  const obj = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
  if (!Array.isArray(obj.mappings) || obj.mappings.length === 0) {
    console.log('No LID mappings to apply.');
    return;
  }
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgres://baileys:baileys@127.0.0.1:55432/baileys' });
  await c.connect();
  let totalMessagesUpdated = 0;
  let chatsTouched = 0;
  for (const [lidBare, pnFull] of obj.mappings) {
    const lidJid = `${lidBare}@lid`;
    const chatRes = await c.query('SELECT id, phone FROM chats WHERE id = $1', [lidJid]);
    if (chatRes.rowCount > 0) {
      await c.query(
        `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count)
         VALUES ($1, $1, '', '', 0, 0)
         ON CONFLICT (id) DO NOTHING`,
        [pnFull]
      );
      const upd = await c.query(
        `UPDATE messages SET chat_id = $1 WHERE chat_id = $2 RETURNING id`,
        [pnFull, lidJid]
      );
      const movedCount = upd.rowCount;
      await c.query(
        `UPDATE chats SET last_message_at = GREATEST(
           COALESCE((SELECT MAX(timestamp) FROM messages WHERE chat_id = $1), 0),
           COALESCE(last_message_at, 0)
         ) WHERE id = $1`,
        [pnFull]
      );
      await c.query(`DELETE FROM chats WHERE id = $1`, [lidJid]);
      chatsTouched++;
      totalMessagesUpdated += movedCount;
      console.log(`LID ${lidJid} -> PN ${pnFull}: moved ${movedCount} messages; deleted empty LID row.`);
    }
  }
  await c.end();
  console.log(`\nDone. Touched ${chatsTouched} LID chats; moved ${totalMessagesUpdated} messages.`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });