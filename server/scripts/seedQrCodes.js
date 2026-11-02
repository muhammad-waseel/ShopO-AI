/**
 * Seed demo QR codes into the authenticity registry.
 *
 *   npm run seed            (from /server)
 *
 * Also called automatically on server start (only inserts codes that are
 * missing), so the QR verification feature works out of the box.
 *
 * Demo codes:
 *   SHOPO-NIKE-AM90-0001   Genuine
 *   SHOPO-SAMS-S24U-0002   Genuine
 *   SHOPO-APPL-APP2-0003   Genuine
 *   SHOPO-LORE-REV-0004    Genuine
 *   SHOPO-CASI-GSHK-0005   Revoked (reported stolen batch) → Potential Counterfeit
 *   Any other code (e.g. FAKE-12345) → Potential Counterfeit (unregistered)
 */

const QrCode = require('../models/QrCode');

const DEMO_CODES = [
  { code: 'SHOPO-NIKE-AM90-0001', productName: 'Nike Air Max 90', brand: 'Nike', manufacturer: 'Nike Inc.', category: 'fashion', batchNumber: 'NK-2026-03', manufacturedAt: new Date('2026-03-12'), authorizedSellers: ['Nike Store', 'Daraz Mall - Nike'] },
  { code: 'SHOPO-SAMS-S24U-0002', productName: 'Samsung Galaxy S24 Ultra 256GB', brand: 'Samsung', manufacturer: 'Samsung Electronics', category: 'electronics', batchNumber: 'SM-S928B-0126', manufacturedAt: new Date('2026-01-20'), authorizedSellers: ['Samsung Official', 'Amazon'] },
  { code: 'SHOPO-APPL-APP2-0003', productName: 'Apple AirPods Pro (2nd generation)', brand: 'Apple', manufacturer: 'Apple Inc.', category: 'electronics', batchNumber: 'MTJV3', manufacturedAt: new Date('2026-02-02'), authorizedSellers: ['Apple Store', 'Amazon'] },
  { code: 'SHOPO-LORE-REV-0004', productName: "L'Oréal Revitalift Night Cream 50ml", brand: "L'Oréal", manufacturer: "L'Oréal Paris", category: 'cosmetics', batchNumber: 'LR-55120', manufacturedAt: new Date('2026-04-18'), authorizedSellers: ["L'Oréal Official Store"] },
  { code: 'SHOPO-CASI-GSHK-0005', productName: 'Casio G-Shock GA-2100', brand: 'Casio', manufacturer: 'Casio Computer Co.', category: 'accessories', batchNumber: 'CS-GA21-09', manufacturedAt: new Date('2025-11-05'), status: 'revoked', revokedReason: 'batch reported stolen from distributor warehouse' }
];

const ensureDemoQrCodes = async () => {
  if (process.env.SEED_DEMO_QR === 'false') return 0;
  let inserted = 0;
  for (const c of DEMO_CODES) {
    const r = await QrCode.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });
    if (r.upsertedCount) inserted += 1;
  }
  if (inserted) console.log(`🏷️  Seeded ${inserted} demo QR code(s)`);
  return inserted;
};

module.exports = { ensureDemoQrCodes, DEMO_CODES };

if (require.main === module) {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGO_URI)
    .then(ensureDemoQrCodes)
    .then(n => { console.log(`Done (${n} inserted).`); return mongoose.disconnect(); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
