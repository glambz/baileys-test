'use strict';

const express = require('express');
const ctrl = require('../controllers/broadcastController');

const router = express.Router();

router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/:jobId', ctrl.get);
router.delete('/:jobId', ctrl.cancel);

module.exports = router;
