/**
 * Search Model
 * ------------
 * Caches search results in MongoDB to avoid repeated scraping.
 * Each document stores a search query and the scraped products.
 * 
 * TTL Index: Documents auto-delete after 1 hour (3600 seconds)
 * so that product data stays relatively fresh.
 * 
 * Fields:
 *   - user: Reference to the user who performed the search
 *   - query: The search term (e.g., "iPhone 15")
 *   - platforms: Which platforms were searched
 *   - products: Array of product objects returned from scrapers
 *   - createdAt: When this search was cached (used for TTL expiry)
 */

const mongoose = require('mongoose');

// Sub-schema for individual product items
const productItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  displayPrice: { type: String, required: true },
  image: { type: String, default: '' },
  link: { type: String, default: '' },
  platform: { type: String, required: true },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  sellerRating: { type: Number, default: 0 },
  isBestDeal: { type: Boolean, default: false },
  trustScore: { type: Number, default: 0 },
  isCaution: { type: Boolean, default: false },
  cautionReason: { type: String, default: '' },
  discount: { type: Number, default: 0 },
  originalPrice: { type: Number, default: 0 },
  originalPricePKR: { type: Number, default: 0 },
  exchangeRate: { type: String, default: '' }
}, { _id: true }); // Each product gets its own _id for referencing

const searchSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  query: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  platforms: {
    type: [String],
    default: ['aliexpress', 'ebay', 'amazon', 'daraz']
  },
  products: [productItemSchema],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // TTL: auto-delete after 1 hour (3600 seconds)
  }
});

// Index for fast cache lookups: find by query + platforms combination
searchSchema.index({ query: 1, platforms: 1, createdAt: -1 });

module.exports = mongoose.model('Search', searchSchema);
