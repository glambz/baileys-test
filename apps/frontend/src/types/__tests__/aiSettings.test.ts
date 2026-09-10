import { describe, it, expect } from 'vitest';
import assert from 'node:assert/strict';
import {
  CHAT_PERSONALITY_EXAMPLES,
  DEFAULT_AI_SETTINGS,
  WHATSAPP_PERSONALITY_EXAMPLES,
} from '@/types/aiSettings';

describe('types/aiSettings — DEFAULT_AI_SETTINGS byte-stable defaults', () => {
  it('matches the locked defaults from docs/tech/ai-settings-data-model.md §4.1', () => {
    assert.deepStrictEqual(DEFAULT_AI_SETTINGS, {
      identity: {
        name: 'Baileys Studio AI Assistant',
        role: 'Agen CS WhatsApp',
        description: 'Asisten AI internal untuk menjawab pertanyaan tim tentang tenant ini.',
      },
      tone: 'friendly',
      language: 'id',
      scope: {
        topics: [],
        excludedTopics: [],
      },
      rules: [],
      whatsappAutoReply: {
        enabled: true,
        confidenceThreshold: 0.7,
      },
      fallbackEnabled: true,
      whatsappPersonality: 'friendly-polite',
      chatPersonality: 'professional',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
  });

  it('confidenceThreshold is the locked 0.7 default', () => {
    expect(DEFAULT_AI_SETTINGS.whatsappAutoReply.confidenceThreshold).toBe(0.7);
  });

  it('updatedAt is the locked ISO timestamp', () => {
    expect(DEFAULT_AI_SETTINGS.updatedAt).toBe('2026-07-02T00:00:00.000Z');
  });

  it('whatsappPersonality default is the locked friendly-polite', () => {
    expect(DEFAULT_AI_SETTINGS.whatsappPersonality).toBe('friendly-polite');
  });

  it('chatPersonality default is the locked professional', () => {
    expect(DEFAULT_AI_SETTINGS.chatPersonality).toBe('professional');
  });

  it('WHATSAPP_PERSONALITY_EXAMPLES has an entry for every persona x every language', () => {
    const examples = WHATSAPP_PERSONALITY_EXAMPLES;
    expect(Object.keys(examples).sort()).toEqual(
      ['friendly-polite', 'professional'].sort()
    );
    for (const persona of Object.keys(examples) as Array<keyof typeof examples>) {
      const langs = Object.keys(examples[persona]).sort();
      expect(langs).toEqual(['en', 'id', 'id-mod']);
    }
  });

  it('CHAT_PERSONALITY_EXAMPLES has an entry for every persona x every language', () => {
    const examples = CHAT_PERSONALITY_EXAMPLES;
    expect(Object.keys(examples).sort()).toEqual(
      ['casual', 'professional'].sort()
    );
    for (const persona of Object.keys(examples) as Array<keyof typeof examples>) {
      const langs = Object.keys(examples[persona]).sort();
      expect(langs).toEqual(['en', 'id', 'id-mod']);
    }
  });
});