/**
 * AIReplyMode state machine tests.
 */
import { describe, it, expect } from 'vitest';
import { assertTransitionAllowed, ForbiddenTransitionError } from '../ai/whatsapp/handoff.js';

describe('AIReplyMode transitions', () => {
  it('allows ai -> human_pending_flag', () => {
    expect(() => assertTransitionAllowed('ai', 'human_pending_flag')).not.toThrow();
  });
  it('allows ai -> human', () => {
    expect(() => assertTransitionAllowed('ai', 'human')).not.toThrow();
  });
  it('allows human_pending_flag -> ai', () => {
    expect(() => assertTransitionAllowed('human_pending_flag', 'ai')).not.toThrow();
  });
  it('allows human_pending_flag -> human', () => {
    expect(() => assertTransitionAllowed('human_pending_flag', 'human')).not.toThrow();
  });
  it('allows human -> ai (operator override)', () => {
    expect(() => assertTransitionAllowed('human', 'ai')).not.toThrow();
  });
  it('forbids_human_to_human_pending_flag', () => {
    expect(() => assertTransitionAllowed('human', 'human_pending_flag')).toThrow(ForbiddenTransitionError);
  });
  it('is idempotent when from === to', () => {
    expect(() => assertTransitionAllowed('ai', 'ai')).not.toThrow();
    expect(() => assertTransitionAllowed('human', 'human')).not.toThrow();
  });
});