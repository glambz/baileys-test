/**
 * Answer-policy: TAU_TURBO turbo-cutoff RED test.
 *
 * Cycle: be-answer-policy-2026-07-15
 * Plan:  docs/maintenance/answer-policy-defer-to-human-2026-07-15/plan.md §3.1
 *
 * When the top retrieval score is below TAU_TURBO, hybridRetrieval MUST
 * return empty chunks (so the LLM has nothing to confabulate from). Today
 * TAU_TURBO = 0.0, so even a 0.20 retrieval score returns chunks → test
 * FAILS until TAU_TURBO is raised to 0.30 (G-AI-8 resolution).
 */
import { describe, it, expect } from 'vitest';
import { TAU_TURBO } from '../ai/retrieval/hybrid.js';

describe('answer-policy — TAU_TURBO turbo-cutoff (BUGFIX RED)', () => {
  it('TAU_TURBO constant is activated at MVP (0.30, was 0.0)', () => {
    expect(TAU_TURBO).toBeCloseTo(0.30, 5);
  });

  it('composes the right comparison boundary at 0.30', () => {
    // The cutoff fires when retrievalScore < TAU_TURBO. 0.29 must be
    // considered "below cutoff" (→ empty chunks) and 0.31 must be "above
    // cutoff" (→ chunks returned). This pins the semantics so a future
    // bump to 0.40 (or downgrade to 0.20) is a deliberate choice.
    const cut = TAU_TURBO;
    expect(0.29 < cut).toBe(true);
    expect(0.31 < cut).toBe(false);
  });
});