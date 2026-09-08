/**
 * Numerical grounding: a figure the model ADDED UP out of grounded figures
 * must pass the gate; an invented one must still be caught.
 *
 * Regression for 2026-09-08: with the read-only tool layer in place, asking
 * "total tagihan saya" makes the model call query_records, get 7500000 and
 * 2500000, and answer 10000000 — correct and fully traceable to the
 * contact's own rows, but literally absent from every source, so the old
 * `sources.includes(n)` gate suppressed a good reply and escalated at
 * random. Prompting the model to route totals through aggregate_records was
 * not a gate (observed: it disobeyed, then over-corrected into the locked
 * fallback phrase). This is.
 */
import { describe, it, expect } from 'vitest';
import { isDerivableSum, extractNumbers } from '../src/ai/whatsapp/trigger.js';

describe('numerical grounding — derived sums', () => {
  it('accepts the exact sum of two grounded amounts (the observed case)', () => {
    expect(isDerivableSum(10000000, [7500000, 2500000, 9000000])).toBe(true);
  });

  it('accepts a subset sum, ignoring unrelated grounded amounts', () => {
    expect(isDerivableSum(10000000, [9000000, 7500000, 1234, 2500000])).toBe(true);
  });

  it('rejects a figure that does not add up — the hallucination case', () => {
    expect(isDerivableSum(12345678, [7500000, 2500000, 9000000])).toBe(false);
  });

  it('rejects another contact-scoped total that would need a foreign row', () => {
    // 19,000,000 is the ALL-contacts total. From this contact's pool
    // (7.5M + 2.5M) it is unreachable, so a leak cannot be laundered
    // through the derived-sum path.
    expect(isDerivableSum(19000000, [7500000, 2500000])).toBe(false);
  });

  it('will not derive small numbers, where a pool of ids makes anything reachable', () => {
    // "rec_t1", "ent_invoice_v1" etc. put 1s and 2s in the pool; deriving
    // at that scale is meaningless, so small figures keep the literal check.
    expect(isDerivableSum(7, [1, 2, 4])).toBe(false);
  });

  it('needs at least two operands — a single grounded amount is the literal check', () => {
    expect(isDerivableSum(7500000, [7500000])).toBe(false);
  });

  it('normalises the answer and the sources the same way', () => {
    // "Rp 10.000.000" and a source's "7.500.000" must both reduce to bare
    // integers, or the pool never lines up with the target.
    expect(extractNumbers('Total tagihan Anda adalah Rp 10.000.000.')).toContain('10000000');
    const pool = extractNumbers('{"amount":7500000}\n{"amount":2500000}').map(Number);
    expect(isDerivableSum(10000000, pool)).toBe(true);
  });
});
