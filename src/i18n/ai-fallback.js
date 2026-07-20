'use strict';
/**
 * Indonesian fallback phrase.
 * Sourced from frontend/src/i18n/id.json -> ai.fallback.message.
 * Per-surface divergence (intentional, 2026-07-09): the WhatsApp auto-reply
 * uses a friendlier semi-formal tone ("kak", "kami") compared to the
 * pre-2026-07-09 strictly-formal locked phrase. The FE copy should be
 * updated separately if it needs to match this BE copy for UI rendering.
 */
const AI_FALLBACK_MESSAGE_ID = 'Maaf kak, untuk hal itu belum ada di data kami ya 🙏';

const AI_FALLBACK_MESSAGE_EN =
  "Sorry, we don't have data on that yet 🙏";

module.exports = {
  AI_FALLBACK_MESSAGE_ID,
  AI_FALLBACK_MESSAGE_EN,
};