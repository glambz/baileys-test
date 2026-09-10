'use strict';
/**
 * Pure scope-policy helper for retrieval.
 * Source: docs/specs/2026-08-18-kb-chat-scope-guardrail.md
 *
 * whatsapp scope: returns chunks for the given chatId OR global (chat_jid IS NULL).
 * team scope:      returns everything (no filter).
 * Throws on unknown scope or whatsapp-without-chatId.
 */
function buildScopeFilter({ scope, chatId }) {
  if (scope === 'whatsapp') {
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('buildScopeFilter: scope=whatsapp requires a non-empty chatId');
    }
    return { sql: 'chat_jid = $1 OR chat_jid IS NULL', params: [chatId] };
  }
  if (scope === 'team') {
    return { sql: 'TRUE', params: [] };
  }
  throw new Error(`buildScopeFilter: Unknown scope "${scope}"`);
}

module.exports = { buildScopeFilter };
