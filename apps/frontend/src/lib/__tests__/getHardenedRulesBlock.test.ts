import { describe, it, expect } from 'vitest';
import { getHardenedRulesBlock } from '../ai/systemPrompt';

/**
 * Self-tests for `getHardenedRulesBlock()` — the four Bahasa Indonesia
 * hardened rules that the operator cannot edit.
 *
 * Source of truth: `docs/tech/ai-settings-data-model.md` §3.2 and
 * `docs/crm/features/ai-settings/spec.md` §4.7. Drift between the two
 * documents is a hard blocker — these tests assert byte-equivalence
 * to the inline literal.
 */
describe('lib/ai/systemPrompt — getHardenedRulesBlock', () => {
  it('returns the locked four-line Indonesian string (byte-exact)', () => {
    expect(getHardenedRulesBlock()).toBe(
      [
        '1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.',
        '2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.',
        '3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.',
        '4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.',
      ].join('\n')
    );
  });

  it('is idempotent across calls (not regenerated)', () => {
    expect(getHardenedRulesBlock()).toBe(getHardenedRulesBlock());
  });

  it('line 1 mentions the contact_id filter', () => {
    const lines = getHardenedRulesBlock().split('\n');
    expect(lines[0]).toContain('contact_id');
  });

  it('line 3 mentions /ai (dashboard full-data scope)', () => {
    const lines = getHardenedRulesBlock().split('\n');
    expect(lines[2]).toContain('/ai');
  });

  it('line 4 forbids writing to the knowledge DB', () => {
    const lines = getHardenedRulesBlock().split('\n');
    expect(lines[3]).toContain('TIDAK BOLEH menulis ke knowledge DB');
  });

  it('has exactly four lines in canonical order, no leading or trailing whitespace, no trailing newline', () => {
    const out = getHardenedRulesBlock();
    expect(out.endsWith('penyalahgunaan data.')).toBe(true);
    expect(out.startsWith('1. ')).toBe(true);
    const lines = out.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith('1. ')).toBe(true);
    expect(lines[1].startsWith('2. ')).toBe(true);
    expect(lines[2].startsWith('3. ')).toBe(true);
    expect(lines[3].startsWith('4. ')).toBe(true);
  });
});