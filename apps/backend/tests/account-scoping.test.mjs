/**
 * Account scoping — chats and messages must not leak across linked accounts.
 *
 * Guards the bug the operator asked about: "will chat history overlap if I
 * log out and use another WhatsApp account?" It did, completely. `chats.id`
 * is the CONTACT's JID and was the entire primary key, and the read path had
 * no filter at all, so account B's operator saw account A's chats and a
 * contact both had messaged showed one interleaved thread.
 *
 * These tests seed a SECOND account's rows directly and assert that every
 * read path ignores them while the current account's rows still come back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const HAS_DB = !!process.env.DATABASE_URL;

const { getPool } = await import('../src/db/client.js');
const { currentAccountId, normalizeAccountId } = await import('../src/whatsapp/account.js');
const { default: request } = await import('supertest');
const { buildApp } = await import('../src/index.js');
const app = buildApp();

const MINE = currentAccountId() || '';
/** A different account that has never been paired here. */
const OTHER = '6280000000001';

const MY_CHAT = '6281111111111@s.whatsapp.net';
/** Same contact JID under both accounts — the collision case. */
const SHARED_CHAT = '6282222222222@s.whatsapp.net';

describe('normalizeAccountId', () => {
  it('reduces a JID with a device id to bare digits', () => {
    expect(normalizeAccountId('6285179652486:2@s.whatsapp.net')).toBe('6285179652486');
  });

  it('strips formatting from a phone number', () => {
    expect(normalizeAccountId('+62 851-7965-2486')).toBe('6285179652486');
  });

  it('rejects anything that cannot be a phone number', () => {
    expect(normalizeAccountId(null)).toBeNull();
    expect(normalizeAccountId('')).toBeNull();
    expect(normalizeAccountId('not-a-number')).toBeNull();
    // Too short to be a real MSISDN.
    expect(normalizeAccountId('12345')).toBeNull();
  });
});

describe.skipIf(!HAS_DB || !MINE)('chats/messages account isolation', () => {
  beforeAll(async () => {
    const pool = getPool();
    // One chat for us, and the SAME contact JID under both accounts.
    for (const [id, account, preview] of [
      [MY_CHAT, MINE, 'mine'],
      [SHARED_CHAT, MINE, 'shared-mine'],
      [SHARED_CHAT, OTHER, 'shared-theirs'],
    ]) {
      await pool.query(
        `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode, account_jid)
         VALUES ($1, $1, '', $2, 1, 0, 'ai', $3)
         ON CONFLICT (account_jid, id) DO UPDATE SET last_message_preview = EXCLUDED.last_message_preview`,
        [id, preview, account]
      );
    }
    await pool.query(
      `INSERT INTO messages (id, chat_id, direction, body, key, timestamp, status, account_jid)
       VALUES ('SCOPE_MINE', $1, 'in', 'mine only', '{}'::jsonb, 1, 'received', $2),
              ('SCOPE_THEIRS', $3, 'in', 'theirs only', '{}'::jsonb, 2, 'received', $4)
       ON CONFLICT (id) DO UPDATE SET account_jid = EXCLUDED.account_jid`,
      [MY_CHAT, MINE, SHARED_CHAT, OTHER]
    );
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM messages WHERE id IN ('SCOPE_MINE','SCOPE_THEIRS')");
    await pool.query('DELETE FROM chats WHERE id = ANY($1::text[])', [[MY_CHAT, SHARED_CHAT]]);
  });

  it('stores the same contact JID once per account instead of merging', async () => {
    // This is what the composite primary key buys. Under the old single-column
    // PK the second insert hit ON CONFLICT (id) and overwrote the first.
    const r = await getPool().query(
      'SELECT account_jid, last_message_preview FROM chats WHERE id = $1 ORDER BY account_jid',
      [SHARED_CHAT]
    );
    expect(r.rows.length).toBe(2);
    const byAccount = Object.fromEntries(
      r.rows.map((x) => [x.account_jid, x.last_message_preview])
    );
    expect(byAccount[MINE]).toBe('shared-mine');
    expect(byAccount[OTHER]).toBe('shared-theirs');
  });

  it('the chat list returns only the current account', async () => {
    const r = await request(app).get('/api/chats');
    expect(r.status).toBe(200);
    const ids = r.body.chats.map((c) => c.id);
    expect(ids).toContain(MY_CHAT);
    // The shared JID appears once — ours — not twice.
    expect(ids.filter((i) => i === SHARED_CHAT).length).toBe(1);
    const previews = r.body.chats
      .filter((c) => c.id === SHARED_CHAT)
      .map((c) => c.lastMessagePreview);
    expect(previews).not.toContain('shared-theirs');
  });

  it('message reads exclude the other account, even for a shared contact', async () => {
    const r = await request(app).get(
      `/api/chats/${encodeURIComponent(SHARED_CHAT)}/messages`
    );
    expect(r.status).toBe(200);
    const bodies = r.body.messages.map((m) => m.body);
    expect(bodies).not.toContain('theirs only');
  });

  it('the other account\'s rows are present in the DB, not merely absent', async () => {
    // Without this the tests above would pass even if the seed had failed.
    const r = await getPool().query(
      'SELECT count(*)::int AS n FROM messages WHERE account_jid = $1',
      [OTHER]
    );
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it('the per-chat AI mode map is scoped too', async () => {
    const r = await request(app).get('/api/crm/chats/modes');
    expect(r.status).toBe(200);
    // Both accounts have a row for SHARED_CHAT; the map is keyed by contact
    // JID, so an unscoped query would silently pick one at random.
    expect(Object.keys(r.body.modes)).toContain(MY_CHAT);
  });
});
