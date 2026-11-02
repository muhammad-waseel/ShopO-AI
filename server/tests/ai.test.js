/**
 * Unit tests for the AI / scoring modules (no database needed).
 */
const { analyzeReviews, analyzeReviewsAsync } = require('../ai/sentimentAnalyzer');
const { getVerdict } = require('../ai/verdictEngine');
const { rankProducts, scoreProduct } = require('../services/recommender');
const { validateEnv } = require('../config/validateEnv');

describe('Sentiment analysis (FR8)', () => {
  test('labels positive and negative reviews', () => {
    const r = analyzeReviews(['Amazing product, love it, excellent quality!', 'Terrible, broke after a day. Awful waste of money.', 'It is a phone.']);
    expect(r.positive).toBeGreaterThan(0);
    expect(r.negative).toBeGreaterThan(0);
    expect(r.totalReviews).toBe(3);
  });

  test('falls back to AFINN when no Hugging Face key is configured', async () => {
    delete process.env.HF_API_KEY;
    const r = await analyzeReviewsAsync(['great']);
    expect(r.engine).toMatch(/AFINN/);
  });

  test('no reviews → 0% everywhere, no fake default split', () => {
    const r = analyzeReviews([]);
    expect(r.totalReviews).toBe(0);
    expect([r.positive, r.neutral, r.negative]).toEqual([0, 0, 0]);
  });
});

describe('Verdict engine', () => {
  test('mostly negative reviews and a suspicious price lead to a worse verdict than positive ones', () => {
    const base = { productName: 'Wireless Earbuds', productPrice: 50, averagePrice: 50, sellerRating: 4.5, reviewCount: 200 };
    const good = getVerdict({ ...base, reviews: Array(10).fill('Excellent sound, great battery, love it') });
    const bad = getVerdict({ ...base, productPrice: 5, sellerRating: 1.5, reviewCount: 3, reviews: Array(10).fill('Fake product, terrible, broke, scam, awful') });
    expect(good.authenticityScore).toBeGreaterThan(bad.authenticityScore);
    expect(['Buy', 'Risky', 'Avoid']).toContain(good.verdict);
    expect(bad.verdict).not.toBe('Buy');
  });
});

describe('No reviews found', () => {
  test('sentiment and review scores are 0, not defaults', () => {
    const v = getVerdict({ productName: 'Earbuds', productPrice: 35, averagePrice: 50, sellerRating: 0, reviewCount: 6, reviews: [] });
    expect(v.breakdown.sentimentScore).toBe(0);
    expect(v.breakdown.reviewScore).toBe(0);
    expect(v.sentimentBreakdown).toEqual({ positive: 0, neutral: 0, negative: 0 });
    expect(v.breakdownDetails.sentimentScore.explanation).toMatch(/No reviews/);
  });

  test('scores normally once reviews are found', () => {
    const v = getVerdict({ productName: 'Earbuds', productPrice: 35, averagePrice: 50, sellerRating: 4.6, reviewCount: 6,
      reviews: ['Great sound, love it', 'Excellent battery', 'Amazing value', 'Good quality', 'Works perfectly', 'Very happy'] });
    expect(v.breakdown.sentimentScore).toBeGreaterThan(0);
    expect(v.breakdown.reviewScore).toBeGreaterThan(0);
  });
});

describe('Recommendation ranking (Test Case 3: sentiment demotes products)', () => {
  const products = [
    { name: 'A', price: 30, link: 'a', trustScore: 80, rating: 4.5 },
    { name: 'B', price: 28, link: 'b', trustScore: 80, rating: 4.5 },
    { name: 'C', price: 5, link: 'c', trustScore: 15, rating: 1, isCaution: true }
  ];

  test('marks exactly one non-caution Best Pick', () => {
    const ranked = rankProducts(products);
    const best = ranked.filter(p => p.isBestPick);
    expect(best).toHaveLength(1);
    expect(best[0].isCaution).toBeFalsy();
  });

  test('70% negative reviews demote an otherwise competitive product', () => {
    const sentiment = new Map([['b', { positive: 30, negative: 70 }], ['a', { positive: 80, negative: 10 }]]);
    const ranked = rankProducts(products, sentiment);
    const a = ranked.find(p => p.name === 'A');
    const b = ranked.find(p => p.name === 'B');
    expect(b.recommendationScore).toBeLessThan(a.recommendationScore);
    expect(a.isBestPick).toBe(true);
    expect(b.scoreBreakdown.sentimentSource).toBe('reviews');
  });

  test('scores are bounded 0-100', () => {
    const s = scoreProduct({ price: 0.01, trustScore: 500, rating: 9 }, 100);
    expect(s.recommendationScore).toBeLessThanOrEqual(100);
  });
});

describe('Environment validation', () => {
  test('reports missing required variables', () => {
    const saved = { ...process.env };
    delete process.env.MONGO_URI;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/MONGO_URI/);
    process.env = saved;
  });
});
