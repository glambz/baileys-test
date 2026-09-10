/**
 * Hardened rules byte-identity test.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHardenedRulesBlock } from '../src/ai/settings/hardened-rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('hardened-rules byte identity', () => {
  it('contains the four locked Bahasa Indonesia rules', () => {
    const block = getHardenedRulesBlock();
    expect(block).toContain('Layanan WhatsApp WAJIB memfilter data berdasarkan');
    expect(block).toContain('Layanan WhatsApp HANYA boleh menggunakan data kontak terkait');
    expect(block).toContain('Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan');
    expect(block).toContain('AI HANYA boleh menulis ke CRM');
  });

  it('contains no leading or trailing newline', () => {
    const block = getHardenedRulesBlock();
    expect(block.startsWith('\n')).toBe(false);
    expect(block.endsWith('\n')).toBe(false);
  });

  it('is exactly 4 lines joined by single newlines', () => {
    const block = getHardenedRulesBlock();
    const lines = block.split('\n');
    expect(lines.length).toBe(4);
  });

  it('is byte-equal to FE source when FE source is available', () => {
    const fePath = path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'ai', 'systemPrompt.ts');
    if (!fs.existsSync(fePath)) return;
    const src = fs.readFileSync(fePath, 'utf8');
    const match = src.match(/HARDENED_RULES_BLOCK:\s*string\s*=\s*\[([\s\S]*?)\]\.join\('\\n'\)/);
    if (!match) return;
    const linesLiteral = match[1];
    const quoted = [...linesLiteral.matchAll(/'((?:\\'|[^'])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    const expected = quoted.join('\n');
    expect(getHardenedRulesBlock()).toBe(expected);
  });
});