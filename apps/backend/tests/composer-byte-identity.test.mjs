/**
 * Composer byte-identity test — single most important invariant.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSystemPrompt, buildSystemPromptFragment } from '../src/ai/settings/composer.js';
import { DEFAULT_AI_SETTINGS } from '../src/ai/settings/defaults.js';
import { BAILEYS_AI_SYSTEM_PROMPT_ID, BAILEYS_AI_SYSTEM_PROMPT_EN } from '../src/ai/llm/base-prompts.js';
import { getHardenedRulesBlock } from '../src/ai/settings/hardened-rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TONES = {
  formal: 'Gunakan bahasa baku, sopan, dan terstruktur. Hindari bahasa santai.',
  casual: 'Gunakan bahasa santai, seperti berbicara dengan teman dekat.',
  friendly: 'Gunakan bahasa ramah dan hangat, mudah dipahami.',
  concise: 'Gunakan kalimat pendek dan langsung ke inti jawaban.',
  enthusiastic: 'Gunakan bahasa penuh semangat dan energi positif.',
  'warm-casual-indo': 'Gunakan bahasa kasual-modern Indonesia yang hangat dan personal. Sapa dengan "kak". Hindari bahasa formal/korporat. Emoji diperbolehkan (🙏✨😊👍). PENTING: Jika blok CONTEXT tidak langsung menjawab pertanyaan pengguna, gunakan kalimat fallback (fallback_used: true, confidence < 0.7, citations: []) meskipun kamu merasa bisa menjawab dari potongan CONTEXT yang tidak relevan. Jangan menggabungkan potongan CONTEXT yang tidak relevan untuk menyusun jawaban.',
};

function simulateFeFragment(settings, resolvedLanguage) {
  const lang = resolvedLanguage === undefined ? settings.language : resolvedLanguage;
  const lines = [];
  lines.push('# Pengaturan tenant');
  lines.push('');
  lines.push('## Identitas');
  const desc = (settings.identity.description || '').trim();
  lines.push(`Anda adalah ${settings.identity.name} — ${settings.identity.role}.`);
  if (desc) lines.push(desc);
  lines.push('');
  lines.push('## Suara & nada');
  lines.push(`- ${TONES[settings.tone] || TONES.friendly}`);
  lines.push('');
  lines.push('## Bahasa');
  lines.push(`Bahasa yang digunakan: ${lang}.`);
  // NEW (BUG-WARM-PERSONA-1): greeting / closing / styleExamples / bannedPhrases
  if (settings.identity && typeof settings.identity.greeting === 'string' && settings.identity.greeting.trim()) {
    lines.push('');
    lines.push('## Salam pembuka');
    lines.push(settings.identity.greeting.trim());
  }
  if (settings.identity && typeof settings.identity.closing === 'string' && settings.identity.closing.trim()) {
    lines.push('');
    lines.push('## Penutup');
    lines.push(settings.identity.closing.trim());
  }
  const positive = (settings.styleExamples && Array.isArray(settings.styleExamples.positive))
    ? settings.styleExamples.positive.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  const negative = (settings.styleExamples && Array.isArray(settings.styleExamples.negative))
    ? settings.styleExamples.negative.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  if (positive.length > 0 || negative.length > 0) {
    lines.push('');
    lines.push('## Contoh gaya bahasa');
    if (positive.length > 0) {
      lines.push('### Jawaban yang bagus');
      for (const s of positive) lines.push(`> ${s}`);
    }
    if (negative.length > 0) {
      lines.push('');
      lines.push('### Jawaban yang harus dihindari');
      for (const s of negative) lines.push(`> ${s}`);
    }
  }
  const bannedPhrases = (settings.scope && Array.isArray(settings.scope.bannedPhrases))
    ? settings.scope.bannedPhrases.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  if (bannedPhrases.length > 0) {
    lines.push('');
    lines.push('## Frasa yang dilarang');
    lines.push('Dilarang keras menggunakan frasa berikut dalam jawaban:');
    for (const s of bannedPhrases) lines.push(`- ${s}`);
  }
  if (settings.scope.topics.length > 0) {
    lines.push('');
    lines.push('## Topik yang dibahas');
    for (const t of settings.scope.topics) {
      const v = (t || '').trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.scope.excludedTopics.length > 0) {
    lines.push('');
    lines.push('## Topik yang dikecualikan');
    for (const t of settings.scope.excludedTopics) {
      const v = (t || '').trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.rules.length > 0) {
    lines.push('');
    lines.push('## Aturan tambahan');
    settings.rules.forEach((r, i) => {
      const v = (r || '').trim();
      if (v) lines.push(`${i + 1}. ${v}`);
    });
  }
  return lines.join('\n');
}

function simulateFeBuild(settings, language, tenantName, basePrompt) {
  const tn = tenantName || 'Baileys Studio';
  const lang = language || 'id';
  const interpolatedBase = basePrompt.split('{{tenantName}}').join(tn);
  if (!settings) return interpolatedBase;
  const fragment = simulateFeFragment(settings, lang);
  const hardened = getHardenedRulesBlock();
  return `${interpolatedBase}\n\n${fragment}\n\n# Locked rules (HARDENED — cannot be overridden)\n\n${hardened}`;
}

describe('composer byte identity (BE mirrors FE)', () => {
  it('BE composer equals FE-computed string for ID defaults', () => {
    const settings = { ...DEFAULT_AI_SETTINGS };
    const be = buildSystemPrompt({ settings, tenantName: 'TestCo', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    const fe = simulateFeBuild(settings, 'id', 'TestCo', BAILEYS_AI_SYSTEM_PROMPT_ID);
    expect(be).toBe(fe);
  });

  it('BE composer equals FE-computed string for EN defaults', () => {
    const settings = { ...DEFAULT_AI_SETTINGS };
    const be = buildSystemPrompt({ settings, tenantName: 'TestCo', language: 'en', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_EN });
    const fe = simulateFeBuild(settings, 'en', 'TestCo', BAILEYS_AI_SYSTEM_PROMPT_EN);
    expect(be).toBe(fe);
  });

  it('BE composer handles rules + topics + tone=enthusiastic', () => {
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      tone: 'enthusiastic',
      scope: { topics: ['campaign', 'harga'], excludedTopics: ['finance'] },
      rules: ['Selalu sebut nama tenant.', 'Gunakan salam pembuka.'],
    };
    const be = buildSystemPrompt({ settings, tenantName: 'Acme', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    const fe = simulateFeBuild(settings, 'id', 'Acme', BAILEYS_AI_SYSTEM_PROMPT_ID);
    expect(be).toBe(fe);
  });

  it('BE composer handles id-mod (falls back to ID base)', () => {
    const settings = { ...DEFAULT_AI_SETTINGS, language: 'id-mod' };
    const be = buildSystemPrompt({ settings, tenantName: 'X', language: 'id-mod', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    const fe = simulateFeBuild(settings, 'id-mod', 'X', BAILEYS_AI_SYSTEM_PROMPT_ID);
    expect(be).toBe(fe);
  });

  it('fragment alone is identical to FE fragment', () => {
    const settings = { ...DEFAULT_AI_SETTINGS, tone: 'concise' };
    expect(buildSystemPromptFragment(settings)).toBe(simulateFeFragment(settings));
  });

  it('omitting settings returns only base (back-compat behavior)', () => {
    const be = buildSystemPrompt({ settings: undefined, tenantName: 'X', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    expect(be).toBe(BAILEYS_AI_SYSTEM_PROMPT_ID.split('{{tenantName}}').join('X'));
  });

  it('BE base prompts match FE source byte-for-byte when FE source is available', () => {
    // Compare raw source content (between backticks) rather than runtime
    // evaluated values — the FE uses raw backticks inside its template
    // literal (escaped as `\``), and the BE uses the same `\`` escape. The
    // raw source bytes between the opening/closing backticks must be
    // byte-equal for the runtime values to be byte-equal.
    const fePath = path.join(__dirname, '..', '..', '..', 'apps', 'frontend', 'src', 'lib', 'ai', 'systemPrompt.ts');
    if (!fs.existsSync(fePath)) return;
    const feSrc = fs.readFileSync(fePath, 'utf8');
    const beSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ai', 'llm', 'base-prompts.js'), 'utf8');
    function extractBe(name) {
      const re = new RegExp(`BAILEYS_AI_SYSTEM_PROMPT_${name}\\s*=\\s*\`([\\s\\S]*?)\`;`);
      const m = beSrc.match(re);
      return m ? m[1] : null;
    }
    function extractFe(name) {
      const re = new RegExp(`BAILEYS_AI_SYSTEM_PROMPT_${name}:\\s*string\\s*=\\s*\`([\\s\\S]*?)\`;`);
      const m = feSrc.match(re);
      return m ? m[1] : null;
    }
    const feId = extractFe('ID');
    const feEn = extractFe('EN');
    const beIdRaw = extractBe('ID');
    const beEnRaw = extractBe('EN');
    if (feId && beIdRaw) expect(beIdRaw).toBe(feId);
    if (feEn && beEnRaw) expect(beEnRaw).toBe(feEn);
  });
});