/**
 * Default AiSettings + zod schema tests.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../src/ai/settings/defaults.js';
import { AiSettingsSchema } from '../src/ai/settings/schema.js';

describe('defaults', () => {
  it('are frozen', () => {
    expect(Object.isFrozen(DEFAULT_AI_SETTINGS)).toBe(true);
  });
  it('match the FE DEFAULT_AI_SETTINGS field-for-field', () => {
    expect(DEFAULT_AI_SETTINGS.identity.name).toBe('Baileys Studio AI Assistant');
    expect(DEFAULT_AI_SETTINGS.identity.role).toBe('Agen CS WhatsApp');
    expect(DEFAULT_AI_SETTINGS.tone).toBe('friendly');
    expect(DEFAULT_AI_SETTINGS.language).toBe('id');
    expect(DEFAULT_AI_SETTINGS.whatsappAutoReply.confidenceThreshold).toBe(0.7);
  });
});

describe('AiSettingsSchema', () => {
  it('parses DEFAULT_AI_SETTINGS', () => {
    const r = AiSettingsSchema.safeParse(DEFAULT_AI_SETTINGS);
    expect(r.success).toBe(true);
  });
  it('rejects confidenceThreshold 0.71 (not multiple of 0.05)', () => {
    const r = AiSettingsSchema.safeParse({
      ...DEFAULT_AI_SETTINGS,
      whatsappAutoReply: { enabled: true, confidenceThreshold: 0.71 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects tone 'unknown'", () => {
    const r = AiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, tone: 'unknown' });
    expect(r.success).toBe(false);
  });
  it("rejects language 'fr'", () => {
    const r = AiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, language: 'fr' });
    expect(r.success).toBe(false);
  });
});