const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/verifyController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WEBP images are allowed.'), false);
  }
});

router.post('/qr', auth, c.verifyQr);
router.post('/qr-image', auth, upload.single('image'), c.verifyQrImage);
router.get('/demo-codes', auth, c.getDemoCodes);
router.get('/qr/:code.png', c.getQrImage);          // public so <img> tags work
router.post('/qr/register', auth, requireAdmin, c.registerCodes);
router.patch('/qr/:code', auth, requireAdmin, c.updateCode);
module.exports = router;
