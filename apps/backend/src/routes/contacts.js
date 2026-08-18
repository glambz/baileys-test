'use strict';

const express = require('express');
const ctrl = require('../controllers/contactsController');

const router = express.Router();

router.get('/', ctrl.list);
router.post('/', ctrl.register);

module.exports = router;
