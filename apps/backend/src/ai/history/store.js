'use strict';
/**
 * AI chat history store.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
const { getPool } = require('../../db/client');

const MAX_HISTORY = 30;

async function listHistory({ tenantId, limit = MAX_HISTORY } = {}) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, question, answer, confidence, kind, evidence, created_at
     FROM ai_chat_history
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId || 'default', limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    confidence: Number(row.confidence),
    kind: row.kind,
    evidence: row.evidence || [],
    createdAt: row.created_at.toISOString(),
  }));
}

async function addHistory({ tenantId, question, answer, confidence, kind, evidence }) {
  const pool = getPool();
  const r = await pool.query(
    `INSERT INTO ai_chat_history (tenant_id, question, answer, confidence, kind, evidence)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, question, answer, confidence, kind, evidence, created_at`,
    [
      tenantId || 'default',
      question,
      answer,
      confidence,
      kind || 'answered',
      JSON.stringify(evidence || []),
    ]
  );
  const row = r.rows[0];
  return {
    id: Number(row.id),
    question: row.question,
    answer: row.answer,
    confidence: Number(row.confidence),
    kind: row.kind,
    evidence: row.evidence || [],
    createdAt: row.created_at.toISOString(),
  };
}

async function deleteHistory({ tenantId, id }) {
  const pool = getPool();
  const r = await pool.query(
    'DELETE FROM ai_chat_history WHERE id = $1 AND tenant_id = $2',
    [id, tenantId || 'default']
  );
  return r.rowCount > 0;
}

async function clearHistory({ tenantId }) {
  const pool = getPool();
  await pool.query('DELETE FROM ai_chat_history WHERE tenant_id = $1', [tenantId || 'default']);
}

module.exports = { listHistory, addHistory, deleteHistory, clearHistory, MAX_HISTORY };
