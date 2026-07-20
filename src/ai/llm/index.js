'use strict';
/**
 * LLM gateway namespace.
 * Source: docs/crm/plans/17-llm-gateway.md step 6.
 */
const oc = require('./openai-compat');
const ac = require('./anthropic-compat');
const { buildUserPrompt } = require('./prompt');
const { parseStructuredOutput, LlmParseError, RagAnswerSchema, WhatsAppAutoReplyDecisionSchema } = require('./parse');
const { embedText } = require('./embed');

const provider = (process.env.LLM_PROVIDER || 'openai-compatible').toLowerCase();

let cachedClient = null;
function getLlmClient() {
  if (cachedClient) return cachedClient;
  if (provider === 'anthropic-compatible') {
    cachedClient = { createChatCompletion: ac.createChatCompletion };
  } else {
    cachedClient = { createChatCompletion: oc.createChatCompletion };
  }
  return cachedClient;
}

module.exports = {
  createChatCompletion: (...args) => getLlmClient().createChatCompletion(...args),
  buildUserPrompt,
  parseStructuredOutput,
  embedText,
  RagAnswerSchema,
  WhatsAppAutoReplyDecisionSchema,
  LlmParseError,
  LlmPermanentError: oc.LlmPermanentError,
  getLlmClient,
  getProvider: () => provider,
};