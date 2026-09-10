'use strict';
/**
 * Default AiSettings.
 * Source: docs/crm/plans/16-settings-store-composer-hardened.md step 1.
 * Byte-mirror of frontend/src/types/aiSettings.ts::DEFAULT_AI_SETTINGS.
 */
const DEFAULTS = Object.freeze({
  identity: Object.freeze({
    name: 'Baileys Studio AI Assistant',
    role: 'Agen CS WhatsApp',
    description: 'Asisten AI internal untuk menjawab pertanyaan tim tentang tenant ini.',
  }),
  tone: 'friendly',
  language: 'id',
  scope: Object.freeze({
    topics: Object.freeze([]),
    excludedTopics: Object.freeze([]),
  }),
  rules: Object.freeze([]),
  whatsappAutoReply: Object.freeze({
    enabled: false,
    confidenceThreshold: 0.7,
  }),
  updatedAt: '2026-07-02T00:00:00.000Z',
});

module.exports = { DEFAULT_AI_SETTINGS: DEFAULTS };