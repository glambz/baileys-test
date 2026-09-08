/**
 * Server-enforced tool scope.
 *
 * The internal assistant may read everything on the connected account; the
 * WhatsApp auto-reply may read only the contact it is talking to. That
 * boundary is enforced in runTool — NOT by the prompt — because a prompt is
 * not an access control, and the auto-reply's prompt is partly composed from
 * operator-editable settings.
 *
 * Requires DATABASE_URL; the seeded rows are created and removed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const requireFromTest = createRequire(import.meta.url);
const HAS_DB = !!process.env.DATABASE_URL;

const PHONE_A = '6281236012938';
const PHONE_B = '6289876543210';
const CHAT_A = `${PHONE_A}@s.whatsapp.net`;

describe('tool scope isolation', () => {
  if (!HAS_DB) {
    it('skipped without DATABASE_URL', () => { expect(true).toBe(true); });
    return;
  }

  let runTool, SCOPE_INTERNAL, SCOPE_CHAT, pool, accountJid;
  const ENTITY = 'ent_scopetest_invoice';
  const IDS = ['rec_scope_a1', 'rec_scope_a2', 'rec_scope_b1'];

  beforeAll(async () => {
    ({ runTool, SCOPE_INTERNAL, SCOPE_CHAT } = requireFromTest('../src/ai/tools/dbTools.js'));
    pool = requireFromTest('../src/db/client.js').getPool();
    accountJid = requireFromTest('../src/whatsapp/account.js').currentAccountId() || '';

    await pool.query(
      `INSERT INTO entity_definitions (id, name, label, schema_json)
       VALUES ($1, 'scopetest_invoice', 'ScopeTest Invoice',
               '{"fields":[{"name":"amount","type":"number","label":"Amount"}]}'::jsonb)
       ON CONFLICT (id) DO NOTHING`, [ENTITY]);
    // A: 4,000,000 + 1,000,000.  B: 8,000,000. All-contacts total: 13,000,000.
    const rows = [
      [IDS[0], PHONE_A, 4000000],
      [IDS[1], PHONE_A, 1000000],
      [IDS[2], PHONE_B, 8000000],
    ];
    for (const [id, contact, amount] of rows) {
      await pool.query(
        `INSERT INTO entity_records (id, entity_id, contact_id, data)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET contact_id = EXCLUDED.contact_id, data = EXCLUDED.data`,
        [id, ENTITY, contact, JSON.stringify({ amount })]);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM entity_records WHERE id = ANY($1)`, [IDS]);
    await pool.query(`DELETE FROM entity_definitions WHERE id = $1`, [ENTITY]);
  });

  const chatScope = () => ({ mode: SCOPE_CHAT, chatId: CHAT_A, contactPhone: PHONE_A });

  it('sums only the contact\'s own records in chat scope', async () => {
    const r = await runTool('aggregate_records', { entity: ENTITY, op: 'sum', field: 'amount' }, chatScope());
    expect(r.error).toBeUndefined();
    expect(Number(r.value)).toBe(5000000);
  });

  it('sums every contact\'s records in internal scope', async () => {
    const r = await runTool('aggregate_records', { entity: ENTITY, op: 'sum', field: 'amount' }, { mode: SCOPE_INTERNAL });
    expect(Number(r.value)).toBe(13000000);
  });

  it('never returns another contact\'s rows in chat scope', async () => {
    const r = await runTool('query_records', { entity: ENTITY, limit: 50 }, chatScope());
    const ids = r.records.map((x) => x.id);
    expect(ids).toContain(IDS[0]);
    expect(ids).toContain(IDS[1]);
    expect(ids).not.toContain(IDS[2]);
  });

  it('ignores a contact_id filter the model supplies to reach another contact', async () => {
    // The scope filter is forced server-side, so an argument naming contact B
    // cannot widen it — the result is A's rows, never B's.
    const r = await runTool(
      'query_records',
      { entity: ENTITY, limit: 50, filters: [{ field: 'contact_id', op: 'eq', value: PHONE_B }] },
      chatScope());
    const ids = (r.records || []).map((x) => x.id);
    expect(ids).not.toContain(IDS[2]);
  });

  it('denies list_chats in chat scope but allows it internally', async () => {
    const denied = await runTool('list_chats', {}, chatScope());
    expect(denied.error).toMatch(/not available in chat scope/i);
    const allowed = await runTool('list_chats', { limit: 1 }, { mode: SCOPE_INTERNAL });
    expect(allowed.error).toBeUndefined();
  });

  it('denies list_knowledge_files in chat scope', async () => {
    const denied = await runTool('list_knowledge_files', {}, chatScope());
    expect(denied.error).toMatch(/not available in chat scope/i);
  });

  it('pins search_messages to this chat, ignoring a foreign chatId argument', async () => {
    const r = await runTool(
      'search_messages',
      { chatId: `${PHONE_B}@s.whatsapp.net`, limit: 20 },
      chatScope());
    expect(r.error).toBeUndefined();
    for (const m of r.messages || []) {
      expect(m.chatId === undefined || m.chatId === CHAT_A).toBe(true);
    }
  });

  it('rejects an unknown tool name rather than guessing', async () => {
    const r = await runTool('drop_everything', {}, chatScope());
    expect(r.error).toMatch(/unknown tool/i);
  });
});
