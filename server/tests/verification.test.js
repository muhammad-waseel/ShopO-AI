const request = require('supertest');
const QRCodeLib = require('qrcode');
const h = require('./helpers');
const app = require('../app');
const { ensureDemoQrCodes } = require('../scripts/seedQrCodes');
const { extractCode } = require('../services/qrVerifier');

let token;
beforeAll(h.connect);
beforeEach(async () => { await h.clear(); await ensureDemoQrCodes(); ({ token } = await h.registerUser(request, app)); });
afterAll(h.disconnect);
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

describe('QR code verification (FR5, Test Case 2)', () => {
  test('registered code → Genuine with product details', async () => {
    const res = await request(app).post('/api/verify/qr').set(auth()).send({ code: 'SHOPO:SHOPO-NIKE-AM90-0001' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Genuine');
    expect(res.body.product.brand).toBe('Nike');
  });

  test('unknown code → Potential Counterfeit', async () => {
    const res = await request(app).post('/api/verify/qr').set(auth()).send({ code: 'FAKE-12345' });
    expect(res.body.status).toBe('Potential Counterfeit');
    expect(res.body.isGenuine).toBe(false);
  });

  test('revoked code → Potential Counterfeit', async () => {
    const res = await request(app).post('/api/verify/qr').set(auth()).send({ code: 'SHOPO-CASI-GSHK-0005' });
    expect(res.body.status).toBe('Potential Counterfeit');
    expect(res.body.reasons[0]).toMatch(/revoked/);
  });

  test('a code scanned by many accounts is flagged as cloned', async () => {
    for (let i = 0; i < 6; i++) {
      const u = await h.registerUser(request, app, { email: `clone${i}@test.com` });
      await request(app).post('/api/verify/qr').set(auth(u.token)).send({ code: 'SHOPO-APPL-APP2-0003' });
    }
    const res = await request(app).post('/api/verify/qr').set(auth()).send({ code: 'SHOPO-APPL-APP2-0003' });
    expect(res.body.status).toBe('Potential Counterfeit');
    expect(res.body.reasons[0]).toMatch(/different accounts/);
  });

  test('decodes a QR code from an uploaded photo', async () => {
    const png = await QRCodeLib.toBuffer('SHOPO:SHOPO-SAMS-S24U-0002', { width: 400 });
    const res = await request(app).post('/api/verify/qr-image').set(auth()).attach('image', png, 'label.png');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Genuine');
    expect(res.body.decodedPayload).toBe('SHOPO:SHOPO-SAMS-S24U-0002');
  });

  test('photo without a QR code → 422', async () => {
    const sharp = require('sharp');
    const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    const res = await request(app).post('/api/verify/qr-image').set(auth()).attach('image', blank, 'blank.png');
    expect(res.status).toBe(422);
  });

  test('every verification is saved to VerificationHistory', async () => {
    await request(app).post('/api/verify/qr').set(auth()).send({ code: 'SHOPO-NIKE-AM90-0001' });
    await request(app).post('/api/verify/qr').set(auth()).send({ code: 'nope' });
    const res = await request(app).get('/api/history/verifications').set(auth());
    expect(res.body.verifications).toHaveLength(2);
    expect(res.body.verifications.map(v => v.resultLabel).sort()).toEqual(['Genuine', 'Potential Counterfeit']);
  });

  test('demo codes listing and public QR image', async () => {
    const list = await request(app).get('/api/verify/demo-codes').set(auth());
    expect(list.body.codes.length).toBe(5);
    const img = await request(app).get(list.body.codes[0].imageUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });

  test('only admins may register codes', async () => {
    const payload = { code: 'NEW-1', productName: 'Thing', brand: 'Brand' };
    expect((await request(app).post('/api/verify/qr/register').set(auth()).send(payload)).status).toBe(403);
    process.env.ADMIN_EMAILS = 'boss@test.com';
    const admin = await h.registerUser(request, app, { email: 'boss@test.com' });
    const res = await request(app).post('/api/verify/qr/register').set(auth(admin.token)).send(payload);
    expect(res.status).toBe(201);
    delete process.env.ADMIN_EMAILS;
  });

  test('extractCode handles prefixes and URLs', () => {
    expect(extractCode('SHOPO:ABC')).toBe('ABC');
    expect(extractCode('https://shop.example/verify?code=XYZ')).toBe('XYZ');
    expect(extractCode('https://shop.example/verify/QQ1')).toBe('QQ1');
    expect(extractCode('  RAW-1 ')).toBe('RAW-1');
  });
});
