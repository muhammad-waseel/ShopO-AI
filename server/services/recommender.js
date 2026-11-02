/**
 * Recommendation Scoring
 * ----------------------
 * Composite score (0-100) used to pick the "Best Pick" in search results
 * and to rank personalised recommendations on the dashboard.
 *
 *   recommendationScore = 0.35 * priceScore      (cheaper than the median = better)
 *                       + 0.35 * trustScore      (rating, review volume, price sanity)
 *                       + 0.30 * sentimentScore  (review sentiment)
 *
 * sentimentScore comes from a saved AI analysis of the product when one
 * exists (positive% − negative%, mapped to 0-100). Otherwise the star
 * rating is used as a proxy for review sentiment.
 *
 * Products flagged as "Caution" (likely scams) are heavily penalised so
 * they are never recommended.
 */

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * @param {Object} product
 * @param {number} medianPrice
 * @param {Object|null} sentiment  { positive, negative } percentages from an Analysis
 */
const scoreProduct = (product, medianPrice, sentiment = null) => {
  // Price: 50 at the median, up to 100 when 50% cheaper, down to 0 when 2x the median.
  let priceScore = 50;
  if (medianPrice > 0 && product.price > 0) {
    const ratio = product.price / medianPrice;
    priceScore = ratio <= 1 ? clamp(50 + (1 - ratio) * 100) : clamp(50 - (ratio - 1) * 50);
  }
  const trustScore = clamp(product.trustScore || 0);

  let sentimentScore;
  let sentimentSource;
  if (sentiment && (sentiment.positive || sentiment.negative)) {
    sentimentScore = clamp(50 + (sentiment.positive - sentiment.negative) / 2);
    sentimentSource = 'reviews';
  } else if (product.rating > 0) {
    sentimentScore = clamp((product.rating / 5) * 100);
    sentimentSource = 'rating';
  } else {
    sentimentScore = 50;
    sentimentSource = 'none';
  }

  let score = 0.35 * priceScore + 0.35 * trustScore + 0.30 * sentimentScore;
  if (product.isCaution) score *= 0.4;
  return {
    recommendationScore: Math.round(score),
    scoreBreakdown: {
      price: Math.round(priceScore),
      trust: Math.round(trustScore),
      sentiment: Math.round(sentimentScore),
      sentimentSource
    }
  };
};

/**
 * Add recommendationScore / scoreBreakdown / isBestPick to a product list.
 * @param {Array} products
 * @param {Map<string,Object>} sentimentByLink  link → { positive, negative }
 */
const rankProducts = (products, sentimentByLink = new Map()) => {
  if (!products || !products.length) return [];
  const med = median(products.map(p => p.price).filter(p => p > 0));
  const scored = products.map(p => {
    const plain = typeof p.toObject === 'function' ? p.toObject() : { ...p };
    const key = (plain.link || '').split('?')[0];
    return { ...plain, ...scoreProduct(plain, med, sentimentByLink.get(key) || null), isBestPick: false };
  });
  let best = null;
  for (const p of scored) {
    if (p.isCaution) continue;
    if (!best || p.recommendationScore > best.recommendationScore) best = p;
  }
  if (best) best.isBestPick = true;
  return scored;
};

module.exports = { scoreProduct, rankProducts, median };
