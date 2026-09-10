/**
 * CRM/RAG module-level configuration constants.
 *
 * Distinct from `frontend/src/lib/config.ts` which holds the
 * legacy WhatsApp-module threshold (`AI_CONFIDENCE_THRESHOLD = 0.65`).
 * Do NOT consolidate these — they are intentionally separate
 * locked values per `docs/tech/crm-data-model.md` §3 and
 * `docs/crm/features/ai-autoreply/spec.md` §4.
 */

/**
 * CRM/RAG confidence threshold. Below this value the auto-reply
 * pipeline returns a fallback. Locked value per
 * `docs/tech/crm-data-model.md` §3 and `docs/crm/features/knowledge-rag/spec.md` §4.2.
 */
export const CRM_AI_CONFIDENCE_THRESHOLD = 0.7;
