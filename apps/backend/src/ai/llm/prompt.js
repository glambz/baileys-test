'use strict';
/**
 * User-message builder.
 * Source: docs/crm/plans/17-llm-gateway.md step 3.
 */
function buildUserPrompt(opts) {
  const question = opts.question || '';
  const contextChunks = opts.contextChunks || [];
  const maxHistory = Number.isFinite(opts.maxHistory) ? opts.maxHistory : 10;
  const chatHistory = (opts.chatHistory || []).slice(-maxHistory);
  const contactPhone = opts.contactPhone;
  const summary = (opts.summary || '').trim();

  const lines = [];
  if (summary) {
    lines.push('<CONVERSATION_SUMMARY>');
    lines.push(summary);
    lines.push('</CONVERSATION_SUMMARY>');
    lines.push('');
  }
  lines.push('<CONTEXT>');
  contextChunks.forEach((c, i) => {
    const chunk = c.chunk || c;
    const meta = chunk.metadata || {};
    const metaStr = [];
    if (meta.file) metaStr.push(`file=${meta.file}`);
    if (meta.section) metaStr.push(`section=${meta.section}`);
    if (meta.page) metaStr.push(`page=${meta.page}`);
    lines.push(`[${i + 1}]`);
    lines.push(`[${metaStr.join(', ')}]`);
    lines.push(chunk.text);
    lines.push('');
  });
  lines.push('</CONTEXT>');

  if (chatHistory.length > 0) {
    lines.push('<HISTORY>');
    for (const m of chatHistory) {
      const role = m.role || 'user';
      lines.push(`${role}: ${m.content}`);
    }
    lines.push('</HISTORY>');
  }

  if (contactPhone) {
    lines.push('<CONTACT_PHONE>');
    lines.push(String(contactPhone));
    lines.push('</CONTACT_PHONE>');
  }

  lines.push('<QUESTION>');
  lines.push(question);
  lines.push('</QUESTION>');
  return lines.join('\n');
}

module.exports = { buildUserPrompt };