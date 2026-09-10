/**
 * Module-wide configuration constants.
 *
 * Single source of truth for tunable thresholds — see
 * `docs/frontend/general/MODULE_OVERVIEW.md` §8 and
 * `docs/frontend/features/ai-chat/spec.md` §4.
 */

/**
 * AI confidence threshold. Below this value the system returns a
 * FallbackAiAnswer instead of an AiAnswer. Locked value: `0.65`.
 */
export const AI_CONFIDENCE_THRESHOLD = 0.65;

/**
 * Artificial network delay for the mock POST /api/chats/:id/messages
 * handler. Source: `docs/frontend/api/api-spec.md` §2.3.
 */
export const MOCK_SEND_DELAY_MS = 400;

/**
 * Format an E.164 digits-only phone string as `+<CC> <first-3>-<next-4>-<last-4>`.
 *
 * Example: `formatPhone("6281234567890")` → `"+62 812-3456-7890"`.
 *
 * The string is not validated as a real phone; it is purely a display helper.
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length <= 7) return `+${digits}`;
  // Try to detect country code as 1-3 leading digits, keep last 11 as national.
  const cc = digits.slice(0, digits.length - 11 > 0 ? digits.length - 11 : 2);
  const national = digits.slice(cc.length);
  if (national.length >= 11) {
    const a = national.slice(0, 3);
    const b = national.slice(3, 7);
    const c = national.slice(7, 11);
    const tail = national.slice(11);
    return tail ? `+${cc} ${a}-${b}-${c}-${tail}` : `+${cc} ${a}-${b}-${c}`;
  }
  if (national.length >= 7) {
    const a = national.slice(0, 3);
    const b = national.slice(3, national.length - 4);
    const c = national.slice(-4);
    return `+${cc} ${a}-${b}-${c}`;
  }
  return `+${digits}`;
}