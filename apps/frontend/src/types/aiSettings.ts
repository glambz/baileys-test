/**
 * AI Settings — per-tenant AI configuration.
 *
 * Source of truth: `docs/tech/ai-settings-data-model.md` §1, §2, §3, §4.1.
 * The literal unions and the `DEFAULT_AI_SETTINGS` object are
 * byte-stable; a vitest snapshot in `__tests__/types/aiSettings.test.ts`
 * locks them down.
 *
 * The hardened rules (the four Bahasa Indonesia rules that the
 * operator cannot edit) live in
 * `frontend/src/lib/ai/systemPrompt.ts -> getHardenedRulesBlock()`.
 * They are NOT stored in `AiSettings` — they are appended to the
 * composed system prompt unconditionally.
 */

/**
 * Tone of voice the AI uses. Byte-identical to
 * `docs/crm/features/ai-settings/spec.md` §4.2.
 */
export type AiTone =
  | 'formal'
  | 'casual'
  | 'friendly'
  | 'concise'
  | 'enthusiastic'
  | 'warm-casual-indo';

/**
 * Output language. `id` is Bahasa Indonesia (formal), `en` is English,
 * `id-mod` is Bahasa Indonesia colloquial / "Modern Indonesia".
 * Byte-identical to `docs/crm/features/ai-settings/spec.md` §4.3.
 */
export type AiLanguage = 'id' | 'en' | 'id-mod';

/**
 * Per-surface persona. The AI is used in two surfaces and each one has
 * its own persona so the operator can tune how the AI speaks to
 * (a) external WhatsApp contacts and (b) the internal team chat.
 *
 * `friendly-polite` uses "kak", "kami", and an emoji; `professional`
 * skips the address terms and emoji. The internal chat uses
 * `professional` (default) or `casual` (looser, for a small team).
 * Per U-feedback on 2026-07-09, the persona drives the example lines
 * shown beneath each dropdown in the AI settings page.
 */
export type AiWhatsappPersonality = 'friendly-polite' | 'professional';
export type AiChatPersonality = 'professional' | 'casual';

export interface AiIdentity {
  name: string; // required, <= 80 chars
  role: string; // required, <= 120 chars
  description: string; // optional, <= 500 chars
  greeting?: string; // optional salam pembuka template (FE-controlled)
  closing?: string; // optional penutup template (FE-controlled)
}

export interface AiScope {
  topics: string[]; // newline-split at save time
  excludedTopics: string[]; // newline-split at save time
  bannedPhrases?: string[]; // optional frasa yang dilarang (FE-controlled)
}

/**
 * Concrete phrasings the AI should (positive) or should not (negative)
 * produce. Both arrays optional; the FE composer renders the section
 * only when at least one example is present. Mirrored by the BE
 * composer in `src/ai/settings/composer.js`.
 */
export interface AiStyleExamples {
  positive?: string[];
  negative?: string[];
}

export interface AiWhatsappAutoReply {
  enabled: boolean;
  /** In [0.50, 0.95], step 0.05. Default 0.7. */
  confidenceThreshold: number;
}

/**
 * The full per-tenant AI Settings record. Persisted to localStorage
 * under the key `'baileys-frontend:ai-settings'`. See
 * `docs/tech/ai-settings-data-model.md` §5.
 */
export interface AiSettings {
  identity: AiIdentity;
  tone: AiTone;
  language: AiLanguage;
  scope: AiScope;
  rules: string[]; // one rule per element
  /** Concrete good/bad phrasings (positive = good, negative = avoid). */
  styleExamples?: AiStyleExamples;
  whatsappAutoReply: AiWhatsappAutoReply;
  /**
   * When `true` (default), the AI sends the locked Indonesian fallback phrase
   * ("Maaf kak, untuk hal itu belum ada di data kami ya 🙏") and flags the
   * chat for human handoff whenever it cannot answer. When `false`, the AI
   * holds silently — the chat is still flagged for human handoff but no AI
   * reply bubble is rendered; the operator composes from scratch.
   */
  fallbackEnabled: boolean;
  /** How the AI speaks to external WhatsApp contacts. */
  whatsappPersonality: AiWhatsappPersonality;
  /** How the AI speaks to the internal team in the in-app chat. */
  chatPersonality: AiChatPersonality;
  /** ISO 8601 timestamp. Bumped on every successful save. */
  updatedAt: string;
}

/**
 * Example lines shown beneath each persona dropdown in
 * AiSettingsPage. Examples are localized per the AI's output
 * language (`AiLanguage`) so the operator can preview the
 * persona in the language they will deploy.
 *
 * Real U-supplied tone reference (2026-07-09):
 *   "iya kak, proses pengerjaan project kakak saat ini ada di 63%,
 *    mohon ditunggu ya kak, terimakasih 🙏"
 */
export const WHATSAPP_PERSONALITY_EXAMPLES: Record<
  AiWhatsappPersonality,
  Record<AiLanguage, string>
> = {
  'friendly-polite': {
    id: 'iya kak, proses pengerjaan project kakak saat ini ada di 63%, mohon ditunggu ya kak, terimakasih 🙏',
    en: "Hi! Your project is currently at 63% progress, please bear with us, thank you so much 🙏",
    'id-mod': 'halo kak, progress projectnya udah di 63% nih, ditunggu yaa, makasih banyak 🙏',
  },
  professional: {
    id: 'Baik, saat ini progress project Anda berada di angka 63%. Estimasi selesai dalam 2 minggu ke depan.',
    en: 'Understood. Your project is currently at 63% progress. Estimated completion in 2 weeks.',
    'id-mod': 'Oke, progress projectnya lagi di 63%. Estimasi kelar 2 minggu lagi ya.',
  },
};

export const CHAT_PERSONALITY_EXAMPLES: Record<AiChatPersonality, Record<AiLanguage, string>> = {
  professional: {
    id: 'Progress project saat ini 63%, estimasi selesai 2 minggu. Status on track.',
    en: 'Project progress is at 63%, estimated completion in 2 weeks. Status: on track.',
    'id-mod': 'Progress project lagi di 63%, kelar 2 minggu lagi. Status aman.',
  },
  casual: {
    id: 'Project udah jalan 63%, sebulan lagi kelar. Aman.',
    en: "Project's at 63%, done in a month. All good.",
    'id-mod': 'Project udah jalan 63%, sebulan lagi kelar. Aman cuy.',
  },
};

/**
 * Short human-readable descriptions of each persona, shown in the
 * dropdown options and as helper text on the AI settings page. The
 * descriptions are in Indonesian (the operator's UI language) — they
 * are about the AI's behavior, not the AI's output.
 */
export const WHATSAPP_PERSONALITY_DESCRIPTIONS: Record<AiWhatsappPersonality, string> = {
  'friendly-polite':
    'Ramah, sopan, pakai "kak" dan emoji. Cocok untuk customer service yang hangat.',
  professional:
    'Profesional dan ringkas, tanpa "kak" atau emoji. Cocok untuk komunikasi bisnis formal.',
};

export const CHAT_PERSONALITY_DESCRIPTIONS: Record<AiChatPersonality, string> = {
  professional:
    'Langsung ke inti, tanpa basa-basi. Cocok untuk laporan internal dan update status.',
  casual:
    'Santai dan ramah, pakai bahasa tim internal. Cocok untuk chat tim sehari-hari.',
};

/**
 * Indonesian (operator-UI) descriptions of each AI tone value. Mirrors
 * the keys in `AiTone`; the `warm-casual-indo` entry is the new value
 * added by the warm-persona cycle. Companion to the internal (composed
 * fragment) descriptions in `frontend/src/lib/ai/systemPrompt.ts ->
 * TONE_DESCRIPTIONS`.
 */
export const TONE_DESCRIPTION_FE: Record<AiTone, string> = {
  formal: 'Bahasa baku, sopan, dan terstruktur. Cocok untuk komunikasi resmi.',
  casual: 'Bahasa santai seperti berbicara dengan teman dekat.',
  friendly: 'Bahasa ramah, hangat, dan mudah dipahami. Cocok untuk customer service.',
  concise: 'Kalimat pendek, langsung ke inti jawaban. Cocok untuk respons cepat.',
  enthusiastic: 'Bahasa penuh semangat dan energi positif. Cocok untuk promosi.',
  'warm-casual-indo':
    'Bahasa kasual-modern Indonesia yang hangat dan personal. Sapa dengan "kak", emoji diperbolehkan. Cocok untuk CS WhatsApp yang terasa seperti teman.',
};

/**
 * Byte-stable defaults — `docs/tech/ai-settings-data-model.md` §4.1.
 * The `updatedAt` is the *initial* value; every successful
 * `useAiSettingsStore.save()` call bumps it to `new Date().toISOString()`.
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
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
};

/** localStorage envelope (reserved for future migrations). */
export const AI_SETTINGS_STORAGE_KEY = 'baileys-frontend:ai-settings';
export const AI_SETTINGS_STORAGE_VERSION = 1;

export interface AiSettingsStorageEnvelope {
  version: number;
  value: AiSettings;
}