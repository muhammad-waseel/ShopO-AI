/**
 * Test helpers: connect to a throw-away database.
 *
 * Uses MONGO_URI_TEST when set (CI service container / local mongod),
 * otherwise starts an in-memory MongoDB via mongodb-memory-server.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_for_jest_runs_123';
process.env.DISABLE_PRICE_MONITOR = 'true';

const mongoose = require('mongoose');
let memServer = null;

const connect = async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
  }
  const dbName = `shopo_test_${process.pid}_${Date.now()}`;
  await mongoose.connect(uri, { dbName });
};

const clear = async () => {
  const cols = await mongoose.connection.db.collections();
  await Promise.all(cols.map(c => c.deleteMany({})));
};

const disconnect = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }
  if (memServer) await memServer.stop();
};

const registerUser = async (request, app, overrides = {}) => {
  const body = { name: 'Syed Mujtaba', email: `user${Math.random().toString(36).slice(2, 8)}@test.com`, password: 'secret123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  return { token: res.body.token, user: res.body.user, body, res };
};

// Fake scraped products used by search tests
const fakeProducts = (query = 'wireless earbuds') => [
  { name: `${query} pro max`, price: 49.99, displayPrice: '$49.99', image: 'https://img/1.jpg', link: 'https://amazon.com/p/1', platform: 'Amazon', rating: 4.6, reviewCount: 820, trustScore: 88, isCaution: false },
  { name: `${query} lite`, price: 19.99, displayPrice: '$19.99', image: 'https://img/2.jpg', link: 'https://ebay.com/p/2', platform: 'eBay', rating: 4.1, reviewCount: 45, trustScore: 62, isCaution: false },
  { name: `${query} budget`, price: 4.5, displayPrice: '$4.50', image: 'https://img/3.jpg', link: 'https://aliexpress.com/p/3', platform: 'AliExpress', rating: 2.0, reviewCount: 2, trustScore: 20, isCaution: true, cautionReason: 'too cheap' },
  { name: `${query} standard`, price: 34.0, displayPrice: 'Rs. 9,520', image: 'https://img/4.jpg', link: 'https://daraz.pk/p/4', platform: 'Daraz', rating: 4.3, reviewCount: 130, trustScore: 79, isCaution: false }
];

module.exports = { connect, clear, disconnect, registerUser, fakeProducts };
