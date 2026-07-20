'use strict';

const express = require('express');
const ctrl = require('../controllers/authController');

const router = express.Router();

router.post('/init', ctrl.init);
router.get('/qr', ctrl.qr);
router.get('/qr.json', ctrl.qrJson);
router.get('/status', ctrl.status);
router.post('/logout', ctrl.logout);

module.exports = router;