/**
 * PriceAlert Model  (FR10)
 * ------------------------
 * A user sets a target price for a product. The price monitor
 * (services/priceMonitor.js) periodically re-checks the price and, once
 * currentPrice <= targetPrice, marks the alert as triggered and sends an
 * email (and optional SMS) notification.
 *
 * Status lifecycle: active → triggered  (or → paused by the user)
 */

const mongoose = require('mongoose');

const priceAlertSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productName: { type: String, required: true, trim: true },
  productLink: { type: String, default: '' },
  productImage: { type: String, default: '' },
  platform: { type: String, required: true },
  query: { type: String, default: '' },          // used to re-search if the link can't be scraped
  targetPrice: { type: Number, required: true, min: 0 },
  initialPrice: { type: Number, required: true, min: 0 },
  currentPrice: { type: Number, required: true, min: 0 },
  lowestPrice: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'triggered', 'paused'], default: 'active' },
  lastCheckedAt: { type: Date, default: null },
  checkCount: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  triggeredAt: { type: Date, default: null },
  notified: { type: Boolean, default: false },
  notificationChannels: { type: [String], default: [] },  // e.g. ['email', 'sms']
  seen: { type: Boolean, default: false }                   // in-app notification read flag
}, { timestamps: true });

priceAlertSchema.index({ user: 1, createdAt: -1 });
priceAlertSchema.index({ status: 1, lastCheckedAt: 1 });

module.exports = mongoose.model('PriceAlert', priceAlertSchema);
