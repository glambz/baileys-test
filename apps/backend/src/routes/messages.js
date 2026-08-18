'use strict';

const express = require('express');
const ctrl = require('../controllers/messageController');

const router = express.Router();

router.post('/send', ctrl.send);

module.exports = router;