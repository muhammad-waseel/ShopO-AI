const express = require('express');
const auth = require('../middleware/auth');
const { getWishlist, addToWishlist, removeFromWishlist } = require('../controllers/wishlistController');

const router = express.Router();
router.get('/', auth, getWishlist);
router.post('/', auth, addToWishlist);
router.delete('/', auth, removeFromWishlist);
router.delete('/:id', auth, removeFromWishlist);
module.exports = router;
