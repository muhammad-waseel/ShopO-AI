/**
 * SearchHistory Model  (UC-3: Log Search History)
 * ------------------------------------------------
 * Permanent log of every search a user performs. Unlike the `Search`
 * cache (which expires after 1 hour), this collection is kept so it can
 * power the History page, autocomplete suggestions and personalised
 * recommendations.
 *
 * Fields:
 *   - user, query, searchType (text | image | voice), platforms
 *   - resultCount: number of products returned
 *   - topProducts: a small snapshot of the best products (used by recommendations)
 */

const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
  name: String,
  price: Number,
  displayPrice: String,
  image: String,
  link: String,
  platform: String,
  rating: Number,
  reviewCount: Number,
  trustScore: Number,
  recommendationScore: Number
}, { _id: false });

const searchHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true, trim: true, lowercase: true },
  searchType: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
  platforms: { type: [String], default: [] },
  resultCount: { type: Number, default: 0 },
  topProducts: { type: [snapshotSchema], default: [] }
}, { timestamps: true });

searchHistorySchema.index({ user: 1, createdAt: -1 });
searchHistorySchema.index({ query: 1 });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
