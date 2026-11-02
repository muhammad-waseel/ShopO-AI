/**
 * Wishlist Model  (FR9)
 * ---------------------
 * One document per saved product per user. Persisted across sessions.
 * A user cannot save the same product link twice (unique index).
 */

const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  displayPrice: { type: String, default: '' },
  image: { type: String, default: '' },
  link: { type: String, required: true },
  platform: { type: String, required: true },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  trustScore: { type: Number, default: 0 },
  query: { type: String, default: '' },        // search that found the product
  note: { type: String, default: '', maxlength: 300 }
}, { timestamps: true });

wishlistSchema.index({ user: 1, link: 1 }, { unique: true });
wishlistSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);
