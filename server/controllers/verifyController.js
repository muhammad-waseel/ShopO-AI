/**
 * Verification Controller  (FR5: QR verification)
 *   POST /api/verify/qr           - verify a decoded QR value { code }
 *   POST /api/verify/qr-image     - upload a photo of a QR label; server decodes it
 *   GET  /api/verify/demo-codes   - demo codes for testing / presentation
 *   GET  /api/verify/qr/:code.png - QR image for a registered code
 *   POST /api/verify/qr/register  - (admin) register genuine product codes
 *   PATCH /api/verify/qr/:code    - (admin) revoke / reactivate a code
 */

const QRCode = require('qrcode');
const QrCode = require('../models/QrCode');
const VerificationHistory = require('../models/VerificationHistory');
const { decodeQrFromImage, verifyCode } = require('../services/qrVerifier');

const record = (userId, result) =>
  VerificationHistory.create({
    user: userId,
    method: 'qr',
    subject: result.code,
    category: result.product?.category || '',
    resultLabel: result.status,
    confidence: result.confidence,
    details: { product: result.product || null, reasons: result.reasons }
  }).catch(err => console.warn('⚠️ Could not save verification history:', err.message));

const verifyQr = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') return res.status(400).json({ message: 'QR code value is required.' });
    const result = await verifyCode(code, req.user.userId);
    await record(req.user.userId, result);
    res.json(result);
  } catch (error) {
    console.error('QR verify error:', error.message);
    res.status(500).json({ message: 'Error verifying QR code.' });
  }
};

const verifyQrImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please upload a photo of the QR code.' });
    const payload = await decodeQrFromImage(req.file.buffer);
    if (!payload) {
      return res.status(422).json({ message: 'No QR code found in the image. Make sure the code is in focus and fills most of the photo.' });
    }
    const result = await verifyCode(payload, req.user.userId);
    await record(req.user.userId, result);
    res.json({ ...result, decodedPayload: payload });
  } catch (error) {
    console.error('QR image verify error:', error.message);
    res.status(500).json({ message: 'Error reading the QR image.' });
  }
};

const getDemoCodes = async (req, res) => {
  try {
    const codes = await QrCode.find({}).sort({ createdAt: 1 }).limit(20)
      .select('code productName brand status uniqueScanners');
    res.json({
      codes: codes.map(c => ({
        code: c.code, productName: c.productName, brand: c.brand, status: c.status,
        uniqueScanners: c.uniqueScanners.length, imageUrl: `/api/verify/qr/${encodeURIComponent(c.code)}.png`
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching demo codes.' });
  }
};

const getQrImage = async (req, res) => {
  try {
    const code = req.params.code;
    const exists = await QrCode.exists({ code });
    if (!exists) return res.status(404).json({ message: 'Code not registered.' });
    const png = await QRCode.toBuffer(`SHOPO:${code}`, { width: 320, margin: 2 });
    res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=86400').send(png);
  } catch (error) {
    res.status(500).json({ message: 'Error generating QR image.' });
  }
};

const registerCodes = async (req, res) => {
  try {
    const items = Array.isArray(req.body.codes) ? req.body.codes : [req.body];
    const created = [];
    const errors = [];
    for (const it of items) {
      if (!it.code || !it.productName || !it.brand) {
        errors.push({ code: it.code || null, message: 'code, productName and brand are required' });
        continue;
      }
      try {
        created.push(await QrCode.create({
          code: String(it.code).trim(), productName: it.productName, brand: it.brand,
          manufacturer: it.manufacturer || it.brand, category: it.category || 'electronics',
          batchNumber: it.batchNumber || '', manufacturedAt: it.manufacturedAt || null,
          authorizedSellers: it.authorizedSellers || []
        }));
      } catch (err) {
        errors.push({ code: it.code, message: err.code === 11000 ? 'Code already registered' : err.message });
      }
    }
    res.status(created.length ? 201 : 400).json({ created: created.length, errors });
  } catch (error) {
    res.status(500).json({ message: 'Error registering codes.' });
  }
};

const updateCode = async (req, res) => {
  try {
    const { status, revokedReason } = req.body;
    if (!['active', 'revoked'].includes(status)) return res.status(400).json({ message: 'Status must be active or revoked.' });
    const c = await QrCode.findOneAndUpdate(
      { code: req.params.code },
      { status, revokedReason: status === 'revoked' ? (revokedReason || '') : '' },
      { new: true }
    );
    if (!c) return res.status(404).json({ message: 'Code not found.' });
    res.json({ message: `Code ${status}.`, code: c });
  } catch (error) {
    res.status(500).json({ message: 'Error updating code.' });
  }
};

module.exports = { verifyQr, verifyQrImage, getDemoCodes, getQrImage, registerCodes, updateCode };
