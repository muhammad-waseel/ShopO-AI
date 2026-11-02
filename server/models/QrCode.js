/**
 * QrCode Model  (FR5: QR Code Scanning & Verification)
 * ----------------------------------------------------
 * The registry of genuine product codes issued by manufacturers / brands.
 * When a shopper scans a code it is looked up here:
 *
 *   - Not found            → "Potential Counterfeit" (unknown code)
 *   - Revoked              → "Potential Counterfeit" (code reported stolen/recalled)
 *   - Found, scanned many times from many accounts → "Potential Counterfeit"
 *                            (classic sign of a cloned/copied label)
 *   - Found and healthy    → "Genuine"
 *
 * This is the "QR database validation" described in report §8.2.3.
 */

const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  productName: { type: String, required: true },
  brand: { type: String, required: true },
  manufacturer: { type: String, default: '' },
  category: { type: String, default: 'electronics' },
  batchNumber: { type: String, default: '' },
  manufacturedAt: { type: Date, default: null },
  authorizedSellers: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  revokedReason: { type: String, default: '' },
  scanCount: { type: Number, default: 0 },
  uniqueScanners: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  firstScannedAt: { type: Date, default: null },
  lastScannedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('QrCode', qrCodeSchema);
