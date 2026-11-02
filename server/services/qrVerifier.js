/**
 * QR Verification Service  (FR5)
 * ------------------------------
 * 1. decodeQrFromImage(buffer)  — reads a QR code from an uploaded photo
 *    (sharp → raw RGBA pixels → jsQR). Tries the original image, then a
 *    downscaled + higher-contrast version for camera photos.
 * 2. extractCode(payload)       — accepts either a bare code
 *    ("SHOPO-ABC123"), a "SHOPO:<code>" payload or a verification URL
 *    ("https://.../verify?code=<code>" or ".../verify/<code>").
 * 3. verifyCode(code, userId)   — looks the code up in the QrCode registry
 *    and returns "Genuine" or "Potential Counterfeit" with reasons.
 */

const sharp = require('sharp');
const jsQR = require('jsqr');
const QrCode = require('../models/QrCode');

// A genuine label is normally scanned by a handful of people (buyer, family,
// reseller). If many different accounts scan the same code, the label has
// most likely been photocopied onto counterfeit goods.
const CLONE_THRESHOLD = parseInt(process.env.QR_CLONE_THRESHOLD, 10) || 5;

const decodeRaw = async (img) => {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
};

const decodeQrFromImage = async (buffer) => {
  const attempts = [
    () => sharp(buffer).rotate(),
    () => sharp(buffer).rotate().resize({ width: 1000, withoutEnlargement: true }).greyscale().normalise(),
    () => sharp(buffer).rotate().resize({ width: 600 }).greyscale().threshold(128)
  ];
  for (const make of attempts) {
    try {
      const out = await decodeRaw(make());
      if (out) return out;
    } catch (_) { /* try next */ }
  }
  return null;
};

const extractCode = (payload) => {
  if (!payload || typeof payload !== 'string') return '';
  const p = payload.trim();
  if (/^shopo:/i.test(p)) return p.slice(6).trim();
  try {
    const url = new URL(p);
    const q = url.searchParams.get('code');
    if (q) return q.trim();
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || p;
  } catch (_) {
    return p;
  }
};

/**
 * @returns {Promise<Object>} { status, isGenuine, confidence, code, reasons[], product? }
 */
const verifyCode = async (rawCode, userId) => {
  const code = extractCode(rawCode);
  if (!code) {
    return { status: 'Potential Counterfeit', isGenuine: false, confidence: 0, code: '', reasons: ['QR code is empty or unreadable.'] };
  }

  const record = await QrCode.findOne({ code });
  if (!record) {
    return {
      status: 'Potential Counterfeit',
      isGenuine: false,
      confidence: 90,
      code,
      reasons: ['This code is not registered in the ShopO-AI authenticity database.',
                'Genuine products carry a code issued by the brand. An unknown code is a strong counterfeit signal.']
    };
  }

  // Record the scan
  const now = new Date();
  const alreadyScanned = record.uniqueScanners.some(id => String(id) === String(userId));
  record.scanCount += 1;
  if (!record.firstScannedAt) record.firstScannedAt = now;
  record.lastScannedAt = now;
  if (userId && !alreadyScanned) record.uniqueScanners.push(userId);
  await record.save();

  const product = {
    productName: record.productName,
    brand: record.brand,
    manufacturer: record.manufacturer,
    category: record.category,
    batchNumber: record.batchNumber,
    manufacturedAt: record.manufacturedAt,
    authorizedSellers: record.authorizedSellers,
    scanCount: record.scanCount,
    uniqueScanners: record.uniqueScanners.length,
    firstScannedAt: record.firstScannedAt
  };

  if (record.status === 'revoked') {
    return {
      status: 'Potential Counterfeit', isGenuine: false, confidence: 95, code, product,
      reasons: [`This code was revoked by the brand${record.revokedReason ? `: ${record.revokedReason}` : '.'}`]
    };
  }

  if (record.uniqueScanners.length > CLONE_THRESHOLD) {
    return {
      status: 'Potential Counterfeit', isGenuine: false, confidence: 75, code, product,
      reasons: [`This code has been scanned by ${record.uniqueScanners.length} different accounts.`,
                'Each genuine item has its own code, so heavy re-use suggests the label was copied.']
    };
  }

  const reasons = ['Code is registered to this brand and is active.'];
  let confidence = 95;
  if (record.uniqueScanners.length > 1) {
    reasons.push(`Note: scanned by ${record.uniqueScanners.length} accounts so far (normal for resale / gifting).`);
    confidence = 85;
  }
  return { status: 'Genuine', isGenuine: true, confidence, code, product, reasons };
};

module.exports = { decodeQrFromImage, extractCode, verifyCode, CLONE_THRESHOLD };
