/**
 * Answer-policy: warm-casual-indo anti-confabulation rule RED test.
 *
 * Cycle: be-answer-policy-2026-07-15
 * Plan:  docs/maintenance/answer-policy-defer-to-human-2026-07-15/plan.md §3.1
 *
 * The 'warm-casual-indo' tone is the operator's chosen tone. When it is
 * active, the per-tenant fragment MUST include an explicit
 * anti-confabulation rule: if the CONTEXT block does not directly answer
 * the user's question, the LLM must fall back (fallback_used: true,
 * confidence < 0.7, citations: []) even if it could stitch together an
 * answer from tangential CONTEXT pieces.
 *
 * Today the tone description stops at the emoji line. The test FAILS
 * until the description is extended with the anti-confabulation rule.
 */
import { describe, it, expect } from 'vitest';
import { buildSystemPromptFragment } from '../src/ai/settings/composer.js';
import { DEFAULT_AI_SETTINGS } from '../src/ai/settings/defaults.js';

const WARM_SETTINGS = {
  ...DEFAULT_AI_SETTINGS,
  tone: 'warm-casual-indo',
};

describe('answer-policy — warm-casual-indo anti-confabulation rule (BUGFIX RED)', () => {
  it('warm-casual-indo tone description includes the anti-confabulation rule', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    // The original tone description (pre-fix) has no anti-confabulation
    // language at all — the test fails because none of the markers are
    // present in the current fragment.
    const fragmentLower = fragment.toLowerCase();

    // The rule must tell the LLM that if CONTEXT does not directly answer
    // the question, it should set fallback_used: true.
    expect(fragmentLower).toMatch(/fallback_used/);
    // It must mention the 0.7 confidence threshold.
    expect(fragment).toMatch(/0\.7/);
    // It must warn against stitching together an answer from CONTEXT
    // chunks that don't directly answer the question.
    expect(fragmentLower).toMatch(/tidak langsung menjawab|tidak relevan|tidak boleh|menjawab dari.*kontak|kontak.*tidak|jangan.*menggabungkan|menyusun.*jawaban/);
  });

  it('warm-casual-indo tone description preserves the original tone cues (regression guard)', () => {
    const fragment = buildSystemPromptFragment(WARM_SETTINGS);
    // The new rule must be ADDED — the existing tone cues must still be
    // present (kak, warm-casual-modern, emoji).
    expect(fragment).toMatch(/kak/);
    expect(fragment).toMatch(/hangat/);
    expect(fragment).toMatch(/🙏/);
  });

  it('the existing 5 tone descriptions are NOT modified by this fix (regression guard)', () => {
    // Build the fragment for each of the 5 other tones and confirm none of
    // them picked up the new anti-confabulation text.
    const OTHER_TONES = ['formal', 'casual', 'friendly', 'concise', 'enthusiastic'];
    for (const tone of OTHER_TONES) {
      const fragment = buildSystemPromptFragment({ ...DEFAULT_AI_SETTINGS, tone });
      expect(fragment.toLowerCase()).not.toMatch(/fallback_used: true, confidence < 0\.7, citations: \[\]/);
    }
  });
});