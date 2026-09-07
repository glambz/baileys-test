'use strict';
/**
 * GET /api/crm/chats/modes — ai_mode lookup keyed by chat id.
 * Cycle: be-fe-integration-2026-07-16.
 * Plan:  docs/maintenance/fe-be-integration-2026-07-16/plan.md §3.
 *
 * The FE's useCrmChatsModes() hook calls this to subscribe to live
 * mode changes for every chat (so the operator UI can show "AI" /
 * "Human" / "Needs human" badges next to each conversation).
 *
 * Reads chats.ai_mode, restricted to the three known values;
 * anything unexpected is silently dropped (fail-closed: a malformed
 * row never propagates to the FE).
 */
const { Router } = require('express');
const { requireTenant } = require('./_middleware');
const { getPool } = require('../../db/client');
const { currentAccountId } = require('../../whatsapp/account');

const router = Router();
router.use(requireTenant);

router.get('/modes', async (_req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      // Account-scoped: without the filter this returned every linked
      // account's chats and the FE keyed modes by contact JID alone.
      `SELECT id, ai_mode FROM chats WHERE account_jid = $1`,
      [currentAccountId() || '']
    );
    const modes = {};
    for (const row of r.rows) {
      const m = row.ai_mode;
      if (m === 'ai' || m === 'human' || m === 'human_pending_flag') {
        modes[row.id] = m;
      }
    }
    res.json({ modes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
