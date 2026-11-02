const request = require('supertest');
const h = require('./helpers');

// Mock the scrapers so tests never hit real websites
jest.mock('../scrapers', () => {
  const actual = jest.requireActual('../scrapers');
  return {
    ...actual,
    scrapeAll: jest.fn(async (query) => ({
      products: require('./helpers').fakeProducts(query),
      platformResults: { amazon: { status: 'success', count: 1 }, ebay: { status: 'success', count: 1 }, aliexpress: { status: 'success', count: 1 }, daraz: { status: 'success', count: 1 } }
    }))
  };
});
const { scrapeAll } = require('../scrapers');
const app = require('../app');

let token;
beforeAll(h.connect);
beforeEach(async () => { await h.clear(); scrapeAll.mockClear(); ({ token } = await h.registerUser(request, app)); });
afterAll(h.disconnect);

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Multi-platform search & recommendation (FR3, FR4, TC_SEARCH_TXT_01, TC_COMPARE_01)', () => {
  test('requires a query and valid platforms', async () => {
    expect((await request(app).get('/api/products/search').set(auth())).status).toBe(400);
    expect((await request(app).get('/api/products/search?q=x&platforms=foo').set(auth())).status).toBe(400);
  });

  test('returns products from >=3 platforms with details and a Best Pick', async () => {
    const res = await request(app).get('/api/products/search?q=wireless earbuds').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.totalProducts).toBe(4);
    const platforms = new Set(res.body.products.map(p => p.platform));
    expect(platforms.size).toBeGreaterThanOrEqual(3);
    for (const p of res.body.products) {
      expect(p).toEqual(expect.objectContaining({ name: expect.any(String), price: expect.any(Number), image: expect.any(String), platform: expect.any(String) }));
      expect(p.recommendationScore).toBeGreaterThanOrEqual(0);
      expect(p.recommendationScore).toBeLessThanOrEqual(100);
    }
    expect(res.body.bestPick).toBeTruthy();
    expect(res.body.bestPick.isCaution).toBe(false);          // scams are never recommended
    expect(res.body.products.filter(p => p.isBestPick)).toHaveLength(1);
    expect(res.body.responseTimeMs).toBeLessThan(10000);       // NFR2
  });

  test('second identical search is served from cache', async () => {
    await request(app).get('/api/products/search?q=gaming mouse').set(auth());
    const res = await request(app).get('/api/products/search?q=gaming mouse').set(auth());
    expect(res.body.cached).toBe(true);
    expect(scrapeAll).toHaveBeenCalledTimes(1);
    const fresh = await request(app).get('/api/products/search?q=gaming mouse&forceRefresh=true').set(auth());
    expect(fresh.body.cached).toBe(false);
    expect(scrapeAll).toHaveBeenCalledTimes(2);
  });

  test('logs every search to SearchHistory (UC-3) with search type', async () => {
    await request(app).get('/api/products/search?q=laptop&searchType=voice').set(auth());
    const res = await request(app).get('/api/history/searches').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.searches).toHaveLength(1);
    expect(res.body.searches[0]).toEqual(expect.objectContaining({ query: 'laptop', searchType: 'voice', resultCount: 4 }));

    const del = await request(app).delete('/api/history/searches').set(auth());
    expect(del.body.deleted).toBe(1);
  });

  test('autocomplete suggests own history first, then popular searches', async () => {
    await request(app).get('/api/products/search?q=samsung galaxy watch').set(auth());
    const res = await request(app).get('/api/products/suggestions?q=sam').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0]).toEqual({ text: 'samsung galaxy watch', source: 'history' });
    expect(res.body.suggestions.some(s => s.source === 'popular')).toBe(true);
  });

  test('personalised recommendations come from search history (TC_AI_REC_01)', async () => {
    await request(app).get('/api/products/search?q=laptops').set(auth());
    const res = await request(app).get('/api/recommendations').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.basedOn).toBe('history');
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.recommendations[0].reason).toMatch(/laptops/);
    expect(res.body.recommendations.every(r => r.link !== 'https://aliexpress.com/p/3' || r.score < res.body.recommendations[0].score)).toBe(true);
  });

  test('dashboard aggregates stats in one call', async () => {
    await request(app).get('/api/products/search?q=power bank').set(auth());
    const res = await request(app).get('/api/dashboard').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.stats.searches).toBe(1);
    expect(res.body.recentSearches[0].query).toBe('power bank');
  });
});

describe('Image & voice search graceful degradation (FR6, FR7, NFR5)', () => {
  test('image search without a vision engine returns 503 + text fallback', async () => {
    jest.resetModules();
    const sharp = require('sharp');
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#888' } }).png().toBuffer();
    const saved = process.env.GOOGLE_VISION_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    const res = await request(app).post('/api/products/image-search').set(auth()).attach('image', png, 'shoe.png');
    process.env.GOOGLE_VISION_API_KEY = saved;
    // 200 if TensorFlow is installed locally, 503 + fallback otherwise
    if (res.status === 200) {
      expect(res.body.query).toEqual(expect.any(String));
    } else {
      expect(res.status).toBe(503);
      expect(res.body.fallback).toBe('text');
    }
  });

  test('image search rejects non-image uploads', async () => {
    const res = await request(app).post('/api/products/image-search').set(auth()).attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('voice transcription without STT key returns 503 + text fallback', async () => {
    delete process.env.GOOGLE_STT_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    const res = await request(app).post('/api/products/voice-search').set(auth()).attach('audio', Buffer.from('fake'), { filename: 'a.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(503);
    expect(res.body.fallback).toBe('text');
  });
});
