/**
 * Warm-persona customizable settings test.
 *
 * Verifies that the BE composer (a) knows about the new 'warm-casual-indo'
 * tone, (b) renders the new styleExamples/bannedPhrases/greeting/closing knobs
 * from the tenant settings, and (c) stays byte-identical to the FE composer
 * when the simulateFeFragment in composer-byte-identity.test.mjs is extended
 * symmetrically.
 *
 * This test is the RED phase of the BUG-WARM-PERSONA-1 fix. It must FAIL
 * against the current src/ai/settings/{composer,defaults,schema}.js because
 * they don't yet support the new fields. The fix (next dispatch) extends
 * the BE fragment + zod schema + TONE_DESCRIPTIONS to match.
 */
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildSystemPromptFragment } from '../src/ai/settings/composer.js';
import { DEFAULT_AI_SETTINGS } from '../src/ai/settings/defaults.js';
import { BAILEYS_AI_SYSTEM_PROMPT_ID } from '../src/ai/llm/base-prompts.js';
import { AiSettingsSchema } from '../src/ai/settings/schema.js';

const WARM_SETTINGS = {
  ...DEFAULT_AI_SETTINGS,
  tone: 'warm-casual-indo',
  identity: {
    ...DEFAULT_AI_SETTINGS.identity,
    description: 'Asisten AI untuk tenant dengan gaya santai, hangat, dan personal.',
    greeting: 'Halo kak! Ada yang bisa dibantu?',
    closing: 'Kalau ada lagi, bilang aja ya kak 🙏',
  },
  scope: {
    topics: [],
    excludedTopics: [],
    bannedPhrases: ['Berdasarkan informasi', 'kami menyediakan', 'mohon maaf'],
  },
  rules: [
    'Selalu jawab dengan gaya chat WhatsApp ke teman, bukan surat resmi.',
    'Sapa dengan "kak". Maksimal 2-3 kalimat.',
  ],
  styleExamples: {
    positive: ['Ohh ada kak, kami bisa bantu bikin landing page ya 😊'],
    negative: ['Berdasarkan informasi yang tersedia di knowledge DB, kami menyediakan...'],
  },
};

describe('warm-casual-indo tone + style knobs (BUG-WARM-PERSONA-1 fix)', () => {
  it("TONE_DESCRIPTIONS knows the new 'warm-casual-indo' value", () => {
    // Probe: build the fragment and assert the tone bullet uses a non-empty
    // warm-casual-indo description (not the friendly fallback).
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toMatch(/## Suara & nada\n- .+/);
    // The new tone value must produce its own bullet, distinct from 'friendly'.
    expect(fragment).not.toMatch(/Gunakan bahasa ramah dan hangat, mudah dipahami\./);
  });

  it('fragment renders the identity.description verbatim (already supported — regression guard)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toContain('Asisten AI untuk tenant dengan gaya santai, hangat, dan personal.');
  });

  it('fragment renders greeting + closing as new sections (NEW behavior)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toMatch(/## Salam pembuka/);
    expect(fragment).toContain('Halo kak! Ada yang bisa dibantu?');
    expect(fragment).toMatch(/## Penutup/);
    expect(fragment).toContain('Kalau ada lagi, bilang aja ya kak 🙏');
  });

  it('fragment renders styleExamples.positive + .negative as a new section (NEW behavior)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toMatch(/## Contoh gaya bahasa/);
    expect(fragment).toMatch(/### Jawaban yang bagus/);
    expect(fragment).toContain('Ohh ada kak, kami bisa bantu bikin landing page ya 😊');
    expect(fragment).toMatch(/### Jawaban yang harus dihindari/);
    expect(fragment).toContain('Berdasarkan informasi yang tersedia di knowledge DB, kami menyediakan...');
  });

  it('fragment renders scope.bannedPhrases as a new section (NEW behavior)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toMatch(/## Frasa yang dilarang/);
    expect(fragment).toContain('Berdasarkan informasi');
    expect(fragment).toContain('kami menyediakan');
    expect(fragment).toContain('mohon maaf');
  });

  it('rules are still rendered under ## Aturan tambahan (regression guard)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    expect(fragment).toMatch(/## Aturan tambahan/);
    expect(fragment).toContain('1. Selalu jawab dengan gaya chat WhatsApp ke teman, bukan surat resmi.');
    expect(fragment).toContain('2. Sapa dengan "kak". Maksimal 2-3 kalimat.');
  });

  it('zod schema accepts the new fields (NEW behavior)', () => {
    const r = AiSettingsSchema.safeParse(WARM_SETTINGS);
    // Will FAIL until schema.js is extended.
    expect(r.success).toBe(true);
  });

  it('zod schema still rejects an unknown tone value (regression guard)', () => {
    const r = AiSettingsSchema.safeParse({ ...WARM_SETTINGS, tone: 'totally-bogus' });
    expect(r.success).toBe(false);
  });

  it('buildSystemPrompt with the new fields composes a fully-formed prompt (NEW behavior)', () => {
    const full = buildSystemPrompt({
      settings: WARM_SETTINGS,
      tenantName: 'Pak Hendro',
      language: 'id',
      basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID,
    });
    // All the new sections must be present in the final composed prompt.
    expect(full).toContain('## Salam pembuka');
    expect(full).toContain('Halo kak! Ada yang bisa dibantu?');
    expect(full).toContain('## Penutup');
    expect(full).toContain('## Contoh gaya bahasa');
    expect(full).toContain('### Jawaban yang bagus');
    expect(full).toContain('## Frasa yang dilarang');
  });
});
