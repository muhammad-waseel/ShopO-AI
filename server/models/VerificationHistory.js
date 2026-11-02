/**
 * VerificationHistory Model
 * -------------------------
 * Records every authenticity check a user performs (report §7.6.2):
 * image/logo verification and QR-code verification.
 *
 * Fields:
 *   - user, method ('image' | 'url' | 'qr')
 *   - subject: file name, image URL or QR code value
 *   - category: product category (image checks)
 *   - resultLabel: e.g. Genuine / Inconclusive / Counterfeit / Potential Counterfeit
 *   - confidence: 0-100
 *   - details: free-form extra info (model used, product data for QR, ...)
 */

const mongoose = require('mongoose');

const verificationHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  method: { type: String, enum: ['image', 'url', 'qr'], required: true },
  subject: { type: String, default: '' },
  category: { type: String, default: '' },
  resultLabel: { type: String, required: true },
  confidence: { type: Number, default: 0, min: 0, max: 100 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

verificationHistorySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationHistory', verificationHistorySchema);
