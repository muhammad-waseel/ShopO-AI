/**
 * Wishlist Controller  (FR9)
 *   GET    /api/wishlist          - list saved products
 *   POST   /api/wishlist          - save a product
 *   DELETE /api/wishlist/:id      - remove by wishlist id
 *   DELETE /api/wishlist?link=... - remove by product link (used by the heart toggle)
 */

const Wishlist = require('../models/Wishlist');

const getWishlist = async (req, res) => {
  try {
    const items = await Wishlist.find({ user: req.user.userId }).sort({ createdAt: -1 });
    res.json({ items, total: items.length });
  } catch (error) {
    console.error('Wishlist error:', error.message);
    res.status(500).json({ message: 'Error fetching wishlist.' });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { name, price, displayPrice, image, link, platform, rating, reviewCount, trustScore, query, note } = req.body;
    if (!name || price === undefined || !link || !platform) {
      return res.status(400).json({ message: 'Product name, price, link and platform are required.' });
    }
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: 'Price must be a positive number.' });
    }
    const existing = await Wishlist.findOne({ user: req.user.userId, link });
    if (existing) {
      return res.status(200).json({ message: 'Already in your wishlist.', item: existing, alreadyExists: true });
    }
    const item = await Wishlist.create({
      user: req.user.userId, name, price: numericPrice, displayPrice: displayPrice || `$${numericPrice.toFixed(2)}`,
      image: image || '', link, platform, rating: rating || 0, reviewCount: reviewCount || 0,
      trustScore: trustScore || 0, query: query || '', note: note || ''
    });
    res.status(201).json({ message: 'Added to wishlist.', item });
  } catch (error) {
    console.error('Add wishlist error:', error.message);
    res.status(500).json({ message: 'Error adding to wishlist.' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const filter = { user: req.user.userId };
    if (req.params.id) filter._id = req.params.id;
    else if (req.query.link) filter.link = req.query.link;
    else return res.status(400).json({ message: 'Wishlist id or product link is required.' });

    const result = await Wishlist.findOneAndDelete(filter);
    if (!result) return res.status(404).json({ message: 'Item not found in wishlist.' });
    res.json({ message: 'Removed from wishlist.', id: result._id });
  } catch (error) {
    console.error('Remove wishlist error:', error.message);
    res.status(500).json({ message: 'Error removing from wishlist.' });
  }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
