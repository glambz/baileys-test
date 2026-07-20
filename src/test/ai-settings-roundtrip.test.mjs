/**
 * Settings store roundtrip + composer integration.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../ai/settings/defaults.js';
import { SettingsValidationError } from '../ai/settings/schema.js';
import { buildSystemPrompt } from '../ai/settings/composer.js';
import { BAILEYS_AI_SYSTEM_PROMPT_ID } from '../ai/llm/base-prompts.js';

describe('settings → composer roundtrip (pure)', () => {
  it('default settings compose a non-empty prompt', () => {
    const p = buildSystemPrompt({
      settings: DEFAULT_AI_SETTINGS,
      tenantName: 'TestCo',
      language: 'id',
      basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID,
    });
    expect(p.length).toBeGreaterThan(500);
    expect(p).toContain('TestCo');
    expect(p).toContain('HARDENED');
  });

  it('switching tone changes the fragment', () => {
    const a = buildSystemPrompt({ settings: { ...DEFAULT_AI_SETTINGS, tone: 'formal' }, tenantName: 'X', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    const b = buildSystemPrompt({ settings: { ...DEFAULT_AI_SETTINGS, tone: 'casual' }, tenantName: 'X', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID });
    expect(a).not.toBe(b);
    expect(a).toContain('bahasa baku');
    expect(b).toContain('bahasa santai');
  });

  it('SettingsValidationError carries zod issues', () => {
    const e = new SettingsValidationError({ issues: [{ path: ['tone'] }] });
    expect(e.name).toBe('SettingsValidationError');
  });
});