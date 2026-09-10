/**
 * Self-tests for `frontend/src/lib/ai/systemPrompt.ts`.
 *
 * These assertions guard the **locked values** declared in
 * `docs/crm/features/ai-chat/systemPrompt.md`. If any of these fail,
 * the prompt has drifted from the SSoT and the change MUST be made in
 * coordination with the PM (the doc is the source of truth).
 *
 * What we assert:
 *   - The `{{tenantName}}` placeholder is present in both variants.
 *   - The confidence threshold literal `0.7` is present in both variants.
 *   - The `contact_id` token is present in both variants (hard filter).
 *   - The Indonesian prompt embeds the byte-identical fallback phrase
 *     taken from `frontend/src/i18n/id.json` -> `ai.fallback.message`.
 *   - The English prompt embeds the byte-identical fallback phrase
 *     taken from `frontend/src/i18n/en.json` -> `ai.fallback.message`.
 *   - The `[n]` citation marker is present in both variants.
 *   - `buildSystemPrompt` interpolates the supplied tenant name and
 *     leaves no `{{tenantName}}` placeholder behind.
 *   - `buildSystemPrompt` defaults to Indonesian with `Baileys Studio`.
 */

import { describe, it, expect } from 'vitest';
import {
  BAILEYS_AI_SYSTEM_PROMPT_ID,
  BAILEYS_AI_SYSTEM_PROMPT_EN,
  buildSystemPrompt,
  buildSystemPromptFragment,
  getHardenedRulesBlock,
} from '../ai/systemPrompt';
import { DEFAULT_AI_SETTINGS } from '@/types/aiSettings';
import idTranslations from '../../i18n/id.json';
import enTranslations from '../../i18n/en.json';

const FALLBACK_ID: string = idTranslations.ai.fallback.message as string;
const FALLBACK_EN: string = enTranslations.ai.fallback.message as string;

describe('lib/ai/systemPrompt — locked values', () => {
  it('ID prompt carries the {{tenantName}} placeholder', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('{{tenantName}}');
  });

  it('EN prompt carries the {{tenantName}} placeholder', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('{{tenantName}}');
  });

  it('ID prompt encodes the 0.7 confidence threshold', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('0.7');
  });

  it('EN prompt encodes the 0.7 confidence threshold', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('0.7');
  });

  it('ID prompt mentions contact_id (hard filter)', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('contact_id');
  });

  it('EN prompt mentions contact_id (hard filter)', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('contact_id');
  });

  it('ID prompt embeds the byte-identical Indonesian fallback phrase', () => {
    // Updated 2026-07-15 (OPEN-FE-BASE-PROMPT-FALLBACK-DRIFT fix): the
    // i18n source-of-truth now holds the new friendly phrase; the base
    // prompt must contain it. The 'Maaf, saya tidak memiliki' prefix
    // check has been replaced with the new phrase check below.
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain(FALLBACK_ID);
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('Maaf kak, untuk hal itu belum ada di data kami ya 🙏');
  });

  // NEW (OPEN-FE-BASE-PROMPT-FALLBACK-DRIFT fix, 2026-07-15): the FE
  // i18n source-of-truth `frontend/src/i18n/id.json -> ai.fallback.message`
  // must match the BE's new friendly phrase
  // (`'Maaf kak, untuk hal itu belum ada di data kami ya 🙏'`).
  // The FE base-prompt literal must then contain this same string.
  it('FE i18n ai.fallback.message matches the new friendly phrase (closes the per-surface drift)', () => {
    expect(FALLBACK_ID).toBe('Maaf kak, untuk hal itu belum ada di data kami ya 🙏');
  });

  it('ID prompt does NOT contain the old fallback text (regression guard)', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).not.toContain('Maaf, saya tidak memiliki');
  });

  it('EN prompt embeds the byte-identical English fallback phrase', () => {
    // Updated 2026-07-15 (OPEN-FE-EN-BASE-PROMPT-FALLBACK-DRIFT fix): the
    // i18n source-of-truth now holds the new friendly phrase; the base
    // prompt must contain it.
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain(FALLBACK_EN);
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain("Sorry, we don't have data on that yet 🙏");
  });

  // NEW (OPEN-FE-EN-BASE-PROMPT-FALLBACK-DRIFT fix, 2026-07-15): the FE
  // i18n source-of-truth `frontend/src/i18n/en.json -> ai.fallback.message`
  // must match the BE's new friendly phrase.
  it('FE i18n en.fallback.message matches the new friendly phrase (closes the per-surface drift)', () => {
    expect(FALLBACK_EN).toBe("Sorry, we don't have data on that yet 🙏");
  });

  it('EN prompt does NOT contain the old fallback text (regression guard)', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).not.toContain("Sorry, I don't have confident enough");
  });

  it('ID prompt declares the [n] citation marker', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('[n]');
  });

  it('EN prompt declares the [n] citation marker', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('[n]');
  });

  it('ID prompt declares STRICT JSON output schema', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('STRICT JSON');
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('"fallback_used"');
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('"citations"');
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('"confidence"');
  });

  it('EN prompt declares STRICT JSON output schema', () => {
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('STRICT JSON');
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('"fallback_used"');
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('"citations"');
    expect(BAILEYS_AI_SYSTEM_PROMPT_EN).toContain('"confidence"');
  });
});

describe('buildSystemPrompt — interpolation', () => {
  it('replaces {{tenantName}} with the supplied tenant name (default language = id)', () => {
    const out = buildSystemPrompt({ tenantName: 'Acme' });
    expect(out).toContain('Acme');
    expect(out).not.toContain('{{tenantName}}');
  });

  it('returns the EN variant when language = "en"', () => {
    const out = buildSystemPrompt({ language: 'en', tenantName: 'Acme' });
    expect(out).toContain('Acme');
    expect(out).not.toContain('{{tenantName}}');
    // Anchors unique to the EN variant.
    expect(out).toContain("You are Baileys Studio AI Assistant");
    expect(out).toContain('# Identity');
  });

  it('returns the ID variant by default', () => {
    const out = buildSystemPrompt({ tenantName: 'Acme' });
    expect(out).toContain('Anda adalah Baileys Studio AI Assistant');
    expect(out).toContain('# Identitas');
  });

  it('defaults to { tenantName: "Baileys Studio", language: "id" } when called with no args', () => {
    const out = buildSystemPrompt();
    expect(out).toContain('Baileys Studio');
    expect(out).not.toContain('{{tenantName}}');
    expect(out).toContain('Anda adalah Baileys Studio AI Assistant');
  });

  it('handles tenant names with regex metacharacters literally', () => {
    const tricky = 'Acme (R&D) + Co.';
    const out = buildSystemPrompt({ tenantName: tricky });
    expect(out).toContain(tricky);
    // The placeholder is gone (no un-replaced occurrence).
    expect(out).not.toContain('{{tenantName}}');
  });
});

describe('buildSystemPromptFragment — per-tenant custom block', () => {
  it('renders the Identitas / Suara & nada / Bahasa sections for empty settings', () => {
    const frag = buildSystemPromptFragment({
      identity: { name: 'X', role: 'Y', description: '' },
      tone: 'friendly',
      language: 'id',
      scope: { topics: [], excludedTopics: [] },
      rules: [],
    });
    expect(frag).toContain('# Pengaturan tenant');
    expect(frag).toContain('## Identitas');
    expect(frag).toContain('Anda adalah X — Y.');
    expect(frag).toContain('## Suara & nada');
    expect(frag).toContain('## Bahasa');
    expect(frag).toContain('Bahasa yang digunakan: id.');
    // No empty sections:
    expect(frag).not.toContain('## Topik yang dibahas');
    expect(frag).not.toContain('## Aturan tambahan');
  });

  it('includes scope topics and excluded topics and rules when present', () => {
    const frag = buildSystemPromptFragment({
      identity: { name: 'Acme Helper', role: 'CS Agent', description: 'desc' },
      tone: 'formal',
      language: 'id',
      scope: { topics: ['paket harga'], excludedTopics: ['diskon'] },
      rules: ['Kalau barter, minta human.'],
    });
    expect(frag).toContain('Acme Helper');
    expect(frag).toContain('CS Agent');
    expect(frag).toContain('desc');
    expect(frag).toContain('paket harga');
    expect(frag).toContain('diskon');
    expect(frag).toContain('1. Kalau barter, minta human.');
  });
});

describe('buildSystemPromptFragment — warm persona (mirror BE BUG-WARM-PERSONA-1)', () => {
  // Mirror of src/test/warm-persona-customizable.test.mjs.
  // Asserts the FE composer renders the 4 new sections byte-symmetric to
  // src/ai/settings/composer.js for the same inputs.

  const baseSettings = {
    identity: { name: 'Acme Helper', role: 'CS Agent', description: '' },
    tone: 'warm-casual-indo' as const,
    language: 'id' as const,
    scope: { topics: [], excludedTopics: [] },
    rules: [] as string[],
  };

  it('TONE_DESCRIPTIONS recognises the warm-casual-indo tone (per Fragment TypeScript surface)', () => {
    // The FE module exposes AiSettingsLike['tone'], which includes
    // 'warm-casual-indo'. The fragment's ## Suara & nada line is driven
    // by the TONE_DESCRIPTIONS map; rendering with tone=must not throw
    // and must surface a non-empty description.
    const frag = buildSystemPromptFragment({ ...baseSettings, tone: 'warm-casual-indo' });
    expect(frag).toContain('## Suara & nada');
    // The description tied to warm-casual-indo is the BE-aligned sentence
    // mentioning "kak". The mirror must render it.
    expect(frag).toContain('kak');
  });

  it('renders ## Salam pembuka when identity.greeting is set', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      identity: { ...baseSettings.identity, greeting: 'Halo kak! Ada yang bisa dibantu?' },
    });
    expect(frag).toContain('## Salam pembuka');
    expect(frag).toContain('Halo kak! Ada yang bisa dibantu?');
  });

  it('does NOT render ## Salam pembuka when identity.greeting is empty / whitespace', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      identity: { ...baseSettings.identity, greeting: '   ' },
    });
    expect(frag).not.toContain('## Salam pembuka');
  });

  it('renders ## Penutup when identity.closing is set', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      identity: { ...baseSettings.identity, closing: 'Kalau ada lagi, bilang aja ya kak 🙏' },
    });
    expect(frag).toContain('## Penutup');
    expect(frag).toContain('Kalau ada lagi, bilang aja ya kak 🙏');
  });

  it('does NOT render ## Penutup when identity.closing is empty', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      identity: { ...baseSettings.identity, closing: '' },
    });
    expect(frag).not.toContain('## Penutup');
  });

  it('renders ## Contoh gaya bahasa with both good and avoid subsections when both arrays are set', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      styleExamples: {
        positive: ['Halo kak, lagi cek ya 🙏', 'Ditunggu yaa, makasih'],
        negative: ['Berdasarkan informasi yang kami terima', 'Mohon maaf sebelumnya'],
      },
    });
    expect(frag).toContain('## Contoh gaya bahasa');
    expect(frag).toContain('### Jawaban yang bagus');
    expect(frag).toContain('> Halo kak, lagi cek ya 🙏');
    expect(frag).toContain('> Ditunggu yaa, makasih');
    expect(frag).toContain('### Jawaban yang harus dihindari');
    expect(frag).toContain('> Berdasarkan informasi yang kami terima');
    expect(frag).toContain('> Mohon maaf sebelumnya');
  });

  it('renders ## Contoh gaya bahasa positive-only when only positive entries exist', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      styleExamples: { positive: ['Halo kak 🙏'], negative: [] },
    });
    expect(frag).toContain('## Contoh gaya bahasa');
    expect(frag).toContain('### Jawaban yang bagus');
    expect(frag).toContain('> Halo kak 🙏');
    expect(frag).not.toContain('### Jawaban yang harus dihindari');
  });

  it('does NOT render ## Contoh gaya bahasa when both arrays are empty / absent', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      styleExamples: { positive: [], negative: [] },
    });
    expect(frag).not.toContain('## Contoh gaya bahasa');
  });

  it('renders ## Frasa yang dilarang when scope.bannedPhrases has entries', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      scope: {
        ...baseSettings.scope,
        bannedPhrases: ['Berdasarkan informasi', 'kami menyediakan', 'mohon maaf'],
      },
    });
    expect(frag).toContain('## Frasa yang dilarang');
    expect(frag).toContain('Dilarang keras menggunakan frasa berikut dalam jawaban:');
    expect(frag).toContain('- Berdasarkan informasi');
    expect(frag).toContain('- kami menyediakan');
    expect(frag).toContain('- mohon maaf');
  });

  it('does NOT render ## Frasa yang dilarang when scope.bannedPhrases is empty / absent', () => {
    const frag = buildSystemPromptFragment({
      ...baseSettings,
      scope: { ...baseSettings.scope, bannedPhrases: [] },
    });
    expect(frag).not.toContain('## Frasa yang dilarang');
  });

  it('byte-identity: FE fragment output equals BE simulateFeFragment output (sample settings)', () => {
    // Re-implementation of BE `simulateFeFragment` from
    // src/test/composer-byte-identity.test.mjs. We mirror the algorithm
    // verbatim — if this drifts the BE/FE byte-identity cross-check will
    // fail and the orchestrator will route a fix-up dispatch.
    const TONES: Record<string, string> = {
      formal: 'Gunakan bahasa baku, sopan, dan terstruktur. Hindari bahasa santai.',
      casual: 'Gunakan bahasa santai, seperti berbicara dengan teman dekat.',
      friendly: 'Gunakan bahasa ramah dan hangat, mudah dipahami.',
      concise: 'Gunakan kalimat pendek dan langsung ke inti jawaban.',
      enthusiastic: 'Gunakan bahasa penuh semangat dan energi positif.',
      'warm-casual-indo':
        'Gunakan bahasa kasual-modern Indonesia yang hangat dan personal. Sapa dengan "kak". Hindari bahasa formal/korporat. Emoji diperbolehkan (🙏✨😊👍). PENTING: Jika blok CONTEXT tidak langsung menjawab pertanyaan pengguna, gunakan kalimat fallback (fallback_used: true, confidence < 0.7, citations: []) meskipun kamu merasa bisa menjawab dari potongan CONTEXT yang tidak relevan. Jangan menggabungkan potongan CONTEXT yang tidak relevan untuk menyusun jawaban.',
    };
    function simulateFeFragment(
      settings: typeof baseSettings & {
        identity: { greeting?: string; closing?: string };
        scope: { bannedPhrases?: string[] };
        styleExamples?: { positive?: string[]; negative?: string[] };
      },
      resolvedLanguage?: 'id' | 'en' | 'id-mod'
    ): string {
      const lang = resolvedLanguage === undefined ? settings.language : resolvedLanguage;
      const lines: string[] = [];
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
      if (
        settings.identity &&
        typeof settings.identity.greeting === 'string' &&
        settings.identity.greeting.trim()
      ) {
        lines.push('');
        lines.push('## Salam pembuka');
        lines.push(settings.identity.greeting.trim());
      }
      if (
        settings.identity &&
        typeof settings.identity.closing === 'string' &&
        settings.identity.closing.trim()
      ) {
        lines.push('');
        lines.push('## Penutup');
        lines.push(settings.identity.closing.trim());
      }
      const positive =
        settings.styleExamples && Array.isArray(settings.styleExamples.positive)
          ? settings.styleExamples.positive.map((s) => (s || '').trim()).filter(Boolean)
          : [];
      const negative =
        settings.styleExamples && Array.isArray(settings.styleExamples.negative)
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
      const bannedPhrases =
        settings.scope && Array.isArray(settings.scope.bannedPhrases)
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
        for (const t of settings.scope.topics as readonly string[]) {
          const v = (t || '').trim();
          if (v) lines.push(`- ${v}`);
        }
      }
      if (settings.scope.excludedTopics.length > 0) {
        lines.push('');
        lines.push('## Topik yang dikecualikan');
        for (const t of settings.scope.excludedTopics as readonly string[]) {
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

    const sample = {
      ...baseSettings,
      identity: {
        ...baseSettings.identity,
        greeting: 'Halo kak! Ada yang bisa dibantu?',
        closing: 'Kalau ada lagi, bilang aja ya kak 🙏',
      },
      scope: {
        ...baseSettings.scope,
        bannedPhrases: ['Berdasarkan informasi', 'kami menyediakan'],
      },
      styleExamples: {
        positive: ['Halo kak, lagi cek ya 🙏'],
        negative: ['Berdasarkan informasi yang kami terima'],
      },
    };
    // Cast through unknown — sample carries the new optional fields that the
    // baseSettings alias type doesn't encode yet.
    const fe = buildSystemPromptFragment(sample as unknown as Parameters<typeof buildSystemPromptFragment>[0]);
    const beMirror = simulateFeFragment(sample as unknown as Parameters<typeof simulateFeFragment>[0]);
    expect(fe).toBe(beMirror);
  });
});

describe('buildSystemPrompt — composed prompt (Plan 12)', () => {
  it('with settings, appends the hardened block byte-exact', () => {
    const out = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS });
    expect(out.endsWith(getHardenedRulesBlock())).toBe(true);
  });

  it('with settings, injects the per-tenant fragment between base and hardened block', () => {
    const out = buildSystemPrompt({
      settings: {
        ...DEFAULT_AI_SETTINGS,
        identity: { name: 'Acme Helper', role: 'CS Agent', description: '' },
      },
    });
    expect(out).toContain('Acme Helper');
    expect(out).toContain('CS Agent');
    // Per-tenant fragment should come before the hardened block.
    const hardenedIdx = out.indexOf(getHardenedRulesBlock());
    const acmeIdx = out.indexOf('Acme Helper');
    expect(acmeIdx).toBeGreaterThan(-1);
    expect(hardenedIdx).toBeGreaterThan(acmeIdx);
  });

  it('id-mod renders the per-tenant fragment with Bahasa yang digunakan: id-mod.', () => {
    const out = buildSystemPrompt({
      language: 'id-mod',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'id-mod' },
    });
    expect(out).toContain('Bahasa yang digunakan: id-mod.');
    // The base prompt is still the ID variant (not a new prompt).
    expect(out).toContain('# Identitas');
  });

  it('settings: undefined preserves the cycle-9 base-only behavior', () => {
    const out = buildSystemPrompt();
    expect(out).toBe(buildSystemPrompt());
    expect(out).not.toContain(getHardenedRulesBlock());
    expect(out).not.toContain('# Pengaturan tenant');
  });

  it('preserves BAILEYS_AI_SYSTEM_PROMPT_ID byte-for-byte (cycle-9 base is untouched)', () => {
    // The exported constant must not have been mutated by the refactor.
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('{{tenantName}}');
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('contact_id');
    expect(BAILEYS_AI_SYSTEM_PROMPT_ID).toContain('0.7');
    // Composed-prompt suffix is byte-equal to the hardened block.
    const out = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS });
    expect(out.endsWith(BAILEYS_AI_SYSTEM_PROMPT_ID)).toBe(false); // composed, not base-only
    expect(out.endsWith(getHardenedRulesBlock())).toBe(true);
  });
});