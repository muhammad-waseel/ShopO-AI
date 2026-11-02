const express = require('express');
const auth = require('../middleware/auth');
const c = require('../controllers/historyController');

const router = express.Router();
router.get('/searches', auth, c.getSearchHistory);
router.delete('/searches', auth, c.deleteSearchHistory);
router.delete('/searches/:id', auth, c.deleteSearchHistory);
router.get('/verifications', auth, c.getVerificationHistory);
module.exports = router;
