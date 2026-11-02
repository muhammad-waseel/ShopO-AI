const express = require('express');
const auth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');
const { getAlerts, createAlert, updateAlert, deleteAlert, checkNow, markSeen } = require('../controllers/alertController');

const router = express.Router();
router.get('/', auth, getAlerts);
router.post('/', auth, createAlert);
router.post('/check', auth, searchLimiter, checkNow);
router.post('/mark-seen', auth, markSeen);
router.patch('/:id', auth, updateAlert);
router.delete('/:id', auth, deleteAlert);
module.exports = router;
