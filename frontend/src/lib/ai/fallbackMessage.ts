import idTranslations from '@/i18n/id.json';
import enTranslations from '@/i18n/en.json';

/**
 * Byte-identical Indonesian fallback sentence returned when the AI
 * retrieval cannot find an entry with confidence >= `AI_CONFIDENCE_THRESHOLD`.
 *
 * Single source of truth: `docs/frontend/features/ai-chat/spec.md` §8.
 * The literal strings live in `src/i18n/{id,en}.json` (key
 * `ai.fallback.message`) and are re-exported here for code that runs
 * outside the React tree (e.g. the mock interceptor).
 *
 * Every other file MUST import this constant — never inline the string.
 */
export const AI_FALLBACK_MESSAGE_ID: string = idTranslations.ai.fallback.message as string;

/**
 * English equivalent for the future `en.json` locale (Phase 2 does not
 * render it). Source: `docs/frontend/features/ai-chat/spec.md` §8.1.
 */
export const AI_FALLBACK_MESSAGE_EN: string = enTranslations.ai.fallback.message as string;

/**
 * Indonesian placeholder for unnamed groups (`@g.us` with no extractable
 * phone). Source: `docs/tech/chat-data-model.md` §3 rule 4.
 */
export const UNNAMED_GROUP_LABEL_ID = 'Grup belum dinamai';

/** Status broadcast literal label. Source: `docs/tech/chat-data-model.md` §3 rule 5. */
export const STATUS_LABEL_ID = 'Status';