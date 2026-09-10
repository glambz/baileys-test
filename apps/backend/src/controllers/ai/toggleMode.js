'use strict';
/**
 * POST /api/crm/ai/toggle-mode — operator-driven state transition.
 * Rejects `human_pending_flag` (only the BE sets that).
 */
const { z } = require('zod');
const {
  loadChatMode,
  transitionChatMode,
  ForbiddenTransitionError,
  ChatNotFoundError,
} = require('../../ai/whatsapp/handoff');
const audit = require('../../ai/audit/log');

const BodySchema = z.object({
  chatId: z.string().min(1),
  mode: z.enum(['ai', 'human']), // never 'human_pending_flag'
});

async function handler(req, res, next) {
  try {
    const parsedBody = BodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid body',
        details: parsedBody.error.issues,
      });
    }
    const { chatId, mode } = parsedBody.data;
    const tenantId = req.tenantId || 'default';

    let current;
    try {
      current = await loadChatMode(chatId);
    } catch (err) {
      if (err instanceof ChatNotFoundError) {
        return res.status(404).json({ error: 'ChatNotFound', chatId });
      }
      throw err;
    }

    if (current === mode) {
      return res.json({ ok: true, chatId, mode, idempotent: true });
    }

    try {
      await transitionChatMode(chatId, current, mode, 'operator_toggle');
    } catch (err) {
      if (err instanceof ForbiddenTransitionError) {
        return res.status(400).json({
          error: 'ForbiddenTransition',
          message: err.message,
          from: err.fromMode,
          to: err.toMode,
        });
      }
      throw err;
    }

    await audit.write('state_transition', {
      chatId,
      tenantId,
      fromMode: current,
      toMode: mode,
      reason: 'operator_toggle',
      actor: 'operator',
    });

    return res.json({ ok: true, chatId, mode });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handler };