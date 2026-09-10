'use strict';
/**
 * Byte-stable Indonesian 4-rule hardened block.
 * Source: docs/crm/plans/16-settings-store-composer-hardened.md step 3.
 * Byte-equal copy of frontend/src/lib/ai/systemPrompt.ts::getHardenedRulesBlock().
 */
const HARDENED_RULES_BLOCK = [
  '1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.',
  '2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.',
  '3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.',
  '4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.',
].join('\n');

function getHardenedRulesBlock() {
  return HARDENED_RULES_BLOCK;
}

module.exports = { getHardenedRulesBlock, HARDENED_RULES_BLOCK };