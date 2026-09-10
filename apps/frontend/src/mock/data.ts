/**
 * Re-exports of the mock data sources — used by the mock handlers and
 * the hooks (which themselves never import this file directly).
 *
 * Plan 02 ships the underlying modules. Plan 04 needs a stable surface
 * (`./data`) so the handler registry does not need to know which
 * individual file each piece lives in.
 */
export { chats } from './chats';
export { messages } from './messages';
export { contacts } from './contacts';
export { knowledge } from './knowledge';
export { searchKnowledge, type KnowledgeHit } from './ai';