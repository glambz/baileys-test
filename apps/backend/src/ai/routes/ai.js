'use strict';
/**
 * AI routes aggregator: /api/crm/ai/*
 */
const express = require('express');
const { requireTenant } = require('./_middleware');
const ask = require('../../controllers/ai/ask');
const replyPreview = require('../../controllers/ai/replyPreview');
const toggleMode = require('../../controllers/ai/toggleMode');
const handoff = require('../../controllers/ai/handoff');
const streamChat = require('../../controllers/ai/streamChat');

const router = express.Router();
router.use(requireTenant);

router.post('/ask', ask.handler);
router.post('/chat', streamChat.streamChatHandler);
router.post('/reply-preview', replyPreview.handler);
router.post('/toggle-mode', toggleMode.handler);
router.get('/handoff', handoff.handler);

module.exports = router;