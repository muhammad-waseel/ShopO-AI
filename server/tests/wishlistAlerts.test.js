const request = require('supertest');
const h = require('./helpers');
const app = require('../app');
const PriceAlert = require('../models/PriceAlert');
const monitor = require('../services/priceMonitor');
const notifier = require('../services/notifier');

let token;
beforeAll(h.connect);
beforeEach(async () => { await h.clear(); ({ token } = await h.registerUser(request, app, { email: 'alerts@test.com' })); });
afterAll(h.disconnect);
const auth = () => ({ Authorization: `Bearer ${token}` });

const product = { name: 'AirPods Pro 2', price: 199.99, link: 'https://amazon.com/airpods', platform: 'Amazon', image: 'x.jpg' };

describe('Wishlist (FR9)', () => {
  test('add, list, prevent duplicates, remove', async () => {
    const add = await request(app).post('/api/wishlist').set(auth()).send(product);
    expect(add.status).toBe(201);
    const again = await request(app).post('/api/wishlist').set(auth()).send(product);
    expect(again.body.alreadyExists).toBe(true);

    const list = await request(app).get('/api/wishlist').set(auth());
    expect(list.body.total).toBe(1);

    const rm = await request(app).delete(`/api/wishlist?link=${encodeURIComponent(product.link)}`).set(auth());
    expect(rm.status).toBe(200);
    expect((await request(app).get('/api/wishlist').set(auth())).body.total).toBe(0);
  });

  test('validates input and isolates users', async () => {
    expect((await request(app).post('/api/wishlist').set(auth()).send({ name: 'x' })).status).toBe(400);
    const add = await request(app).post('/api/wishlist').set(auth()).send(product);
    const other = await h.registerUser(request, app, { email: 'other@test.com' });
    const res = await request(app).delete(`/api/wishlist/${add.body.item._id}`).set({ Authorization: `Bearer ${other.token}` });
    expect(res.status).toBe(404);
  });
});

describe('Price alerts (FR10, Test Case 5)', () => {
  const create = (target, current = 899) => request(app).post('/api/alerts').set(auth()).send({
    productName: 'Laptop', productLink: 'https://ebay.com/laptop', platform: 'eBay', query: 'laptop', targetPrice: target, currentPrice: current
  });

  test('creates, pauses, re-targets and deletes an alert', async () => {
    const res = await create(800);
    expect(res.status).toBe(201);
    expect(res.body.alert.status).toBe('active');
    const id = res.body.alert._id;
    expect((await request(app).patch(`/api/alerts/${id}`).set(auth()).send({ status: 'paused' })).body.alert.status).toBe('paused');
    expect((await request(app).patch(`/api/alerts/${id}`).set(auth()).send({ targetPrice: 750 })).body.alert.targetPrice).toBe(750);
    expect((await request(app).patch(`/api/alerts/${id}`).set(auth()).send({ targetPrice: -1 })).status).toBe(400);
    expect((await request(app).delete(`/api/alerts/${id}`).set(auth())).status).toBe(200);
  });

  test('rejects invalid target prices', async () => {
    expect((await create(0)).status).toBe(400);
    expect((await create('abc')).status).toBe(400);
  });

  test('triggers and notifies when the price drops to the target ($800 → $799)', async () => {
    const spy = jest.spyOn(notifier, 'sendPriceDropNotification');
    await create(800);
    monitor.setPriceFetcher(async () => 799);
    const res = await request(app).post('/api/alerts/check').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(1);
    const alert = await PriceAlert.findOne({});
    expect(alert.status).toBe('triggered');
    expect(alert.currentPrice).toBe(799);
    expect(alert.notified).toBe(true);
    expect(alert.notificationChannels).toContain('in-app');
    expect(spy).toHaveBeenCalledTimes(1);

    const list = await request(app).get('/api/alerts').set(auth());
    expect(list.body.unseenTriggered).toBe(1);
    await request(app).post('/api/alerts/mark-seen').set(auth());
    expect((await request(app).get('/api/alerts').set(auth())).body.unseenTriggered).toBe(0);
    spy.mockRestore();
  });

  test('does not trigger when price stays above target and records fetch failures', async () => {
    await create(800);
    monitor.setPriceFetcher(async () => 850);
    await monitor.checkAlerts();
    let alert = await PriceAlert.findOne({});
    expect(alert.status).toBe('active');
    expect(alert.lowestPrice).toBe(850);
    monitor.setPriceFetcher(async () => null);
    await monitor.checkAlerts();
    alert = await PriceAlert.findOne({});
    expect(alert.lastError).toMatch(/Could not fetch/);
    expect(alert.checkCount).toBe(2);
  });

  test('alert created at/below current price is triggered immediately', async () => {
    const res = await create(900, 850);
    expect(res.body.alert.status).toBe('triggered');
  });
});
