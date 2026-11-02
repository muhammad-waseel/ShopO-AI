/**
 * Product Routes
 * --------------
 * API endpoints for product search functionality.
 * All routes require authentication.
 *
 * Endpoints:
 *   GET  /api/products/search        - Search products across platforms
 *   GET  /api/products/suggestions   - Autocomplete suggestions
 *   POST /api/products/image-search  - Detect a search query from a photo
 *   POST /api/products/voice-search  - Transcribe recorded audio to a query
 */

const express = require('express');
const multer = require('multer');
const { searchProducts, getSuggestions, imageSearch, voiceTranscribe } = require('../controllers/productController');
const auth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WEBP images are allowed.'), false);
  }
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || file.mimetype === 'video/webm') cb(null, true);
    else cb(new Error('Unsupported audio format.'), false);
  }
});

/**
 * GET /api/products/search?q=iPhone+15&platforms=ebay,amazon,aliexpress,daraz
 * Rate limited: max 10 requests per minute
 */
router.get('/search', auth, searchLimiter, searchProducts);
router.get('/suggestions', auth, getSuggestions);
router.post('/image-search', auth, searchLimiter, imageUpload.single('image'), imageSearch);
router.post('/voice-search', auth, searchLimiter, audioUpload.single('audio'), voiceTranscribe);

module.exports = router;
