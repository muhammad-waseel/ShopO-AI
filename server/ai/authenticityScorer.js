/**
 * Authenticity Scorer
 * -------------------
 * Rule-based scoring system to detect potentially fake products.
 * Uses a transparent, explainable formula with 4 weighted factors.
 * 
 * Total Score: 0-100 (sum of 4 sub-scores, each 0-25)
 * 
 * Factors:
 *   1. Price Score (0-25): Is the price reasonable compared to average?
 *   2. Seller Score (0-25): How reputable is the seller?
 *   3. Review Score (0-25): Does the product have enough reviews?
 *   4. Sentiment Score (0-25): Are the reviews generally positive?
 * 
 * This is the CORE AI LOGIC of the FYP — no external API needed.
 * Everything is formula-based and fully explainable.
 */

/**
 * Calculate Price Score (0-25).
 * Compares the product's price against the average price of similar products.
 * 
 * Logic:
 *   - If price < 40% of average → Very suspicious (score: 0-5)
 *   - If price is 40-60% of average → Somewhat suspicious (score: 5-15)
 *   - If price is 60-120% of average → Normal range (score: 20-25)
 *   - If price > 120% of average → Overpriced but likely real (score: 15-20)
 * 
 * @param {number} productPrice - Price of the product being analyzed
 * @param {number} averagePrice - Average price of similar products
 * @returns {Object} { score: number, explanation: string }
 */
const calculatePriceScore = (productPrice, averagePrice) => {
  // If we don't have enough data to compare
  if (!averagePrice || averagePrice <= 0) {
    return {
      score: 12, // Neutral — can't determine
      explanation: 'Not enough price data available for comparison.'
    };
  }

  const priceRatio = productPrice / averagePrice;

  if (priceRatio < 0.4) {
    // Suspiciously cheap — likely fake or scam
    const score = Math.round(priceRatio * 12.5); // 0-5
    return {
      score: Math.max(0, score),
      explanation: `Price is ${Math.round((1 - priceRatio) * 100)}% below average — suspiciously cheap!`
    };
  } else if (priceRatio < 0.6) {
    // Below average — somewhat suspicious
    const score = Math.round(5 + (priceRatio - 0.4) * 50); // 5-15
    return {
      score,
      explanation: `Price is ${Math.round((1 - priceRatio) * 100)}% below average — below typical range.`
    };
  } else if (priceRatio <= 1.2) {
    // Normal price range — most likely authentic
    const score = Math.round(20 + (1 - Math.abs(1 - priceRatio)) * 5); // 20-25
    return {
      score: Math.min(25, score),
      explanation: `Price is within normal market range (${Math.round(priceRatio * 100)}% of average).`
    };
  } else {
    // Overpriced — probably real but expensive
    const score = Math.round(20 - (priceRatio - 1.2) * 10); // 15-20
    return {
      score: Math.max(15, Math.min(20, score)),
      explanation: `Price is ${Math.round((priceRatio - 1) * 100)}% above average — premium pricing.`
    };
  }
};

/**
 * Calculate Seller Score (0-25).
 * Based on the seller's reputation rating.
 * 
 * @param {number} sellerRating - Seller rating (0-5 scale)
 * @returns {Object} { score: number, explanation: string }
 */
const calculateSellerScore = (sellerRating) => {
  if (!sellerRating || sellerRating <= 0) {
    return {
      score: 10, // Neutral — no data
      explanation: 'Seller rating data not available.'
    };
  }

  if (sellerRating >= 4.5) {
    return { score: 25, explanation: `Excellent seller rating: ${sellerRating}/5 ⭐` };
  } else if (sellerRating >= 4.0) {
    return { score: 20, explanation: `Good seller rating: ${sellerRating}/5 ⭐` };
  } else if (sellerRating >= 3.5) {
    return { score: 15, explanation: `Average seller rating: ${sellerRating}/5 ⭐` };
  } else if (sellerRating >= 3.0) {
    return { score: 10, explanation: `Below average seller rating: ${sellerRating}/5 ⚠️` };
  } else {
    return { score: 5, explanation: `Poor seller rating: ${sellerRating}/5 — be cautious!` };
  }
};

/**
 * Calculate Review Score (0-25).
 * Based on how many reviews the product has.
 * More reviews = more trustworthy (generally).
 * 
 * @param {number} reviewCount - Number of reviews/ratings
 * @returns {Object} { score: number, explanation: string }
 */
const calculateReviewScore = (reviewCount, analyzedCount = 0) => {
  if (!reviewCount || reviewCount <= 0) {
    return {
      score: 0,
      explanation: 'No reviews found — 0 points.'
    };
  }

  // The store reports reviews but none could be read from the product page:
  // we can't confirm they exist, so no points are given.
  if (!analyzedCount || analyzedCount <= 0) {
    return {
      score: 0,
      explanation: `Store lists ${reviewCount} review(s) but no review text could be found — 0 points.`
    };
  }

  if (reviewCount > 500) {
    return { score: 25, explanation: `${reviewCount} reviews — very well-reviewed product.` };
  } else if (reviewCount > 100) {
    return { score: 20, explanation: `${reviewCount} reviews — good amount of feedback.` };
  } else if (reviewCount > 20) {
    return { score: 15, explanation: `${reviewCount} reviews — moderate feedback available.` };
  } else if (reviewCount > 5) {
    return { score: 10, explanation: `Only ${reviewCount} reviews — limited feedback.` };
  } else {
    return { score: 5, explanation: `Only ${reviewCount} review(s) — very little feedback.` };
  }
};

/**
 * Calculate Sentiment Score (0-25).
 * Based on the sentiment analysis results of product reviews.
 * 
 * @param {Object} sentimentData - Output from sentimentAnalyzer
 *   { positive: %, neutral: %, negative: % }
 * @returns {Object} { score: number, explanation: string }
 */
const calculateSentimentScore = (sentimentData, analyzedCount) => {
  // No review text was analyzed → no sentiment, no points (no neutral defaults)
  if (!sentimentData || !analyzedCount || analyzedCount <= 0) {
    return {
      score: 0,
      explanation: 'No reviews to analyze — sentiment score is 0.'
    };
  }

  const { positive, negative } = sentimentData;

  if (positive >= 70) {
    return { score: 25, explanation: `${positive}% positive reviews — overwhelmingly positive!` };
  } else if (positive >= 50) {
    return { score: 20, explanation: `${positive}% positive reviews — mostly positive feedback.` };
  } else if (positive >= 30) {
    return { score: 15, explanation: `${positive}% positive reviews — mixed feedback.` };
  } else if (negative >= 50) {
    return { score: 5, explanation: `${negative}% negative reviews — buyers are unhappy!` };
  } else {
    return { score: 10, explanation: `${positive}% positive reviews — below average sentiment.` };
  }
};

/**
 * Main function: Calculate the full authenticity score for a product.
 * 
 * @param {Object} params
 *   @param {number} params.productPrice - Product price
 *   @param {number} params.averagePrice - Average price from similar products
 *   @param {number} params.sellerRating - Seller rating (0-5)
 *   @param {number} params.reviewCount - Number of reviews
 *   @param {number} params.analyzedCount - Reviews whose text was actually analyzed
 *   @param {Object} params.sentimentData - Sentiment analysis results
 * @returns {Object} Full scoring breakdown
 */
const calculateAuthenticityScore = ({ productPrice, averagePrice, sellerRating, reviewCount, analyzedCount = 0, sentimentData }) => {
  const price = calculatePriceScore(productPrice, averagePrice);
  const seller = calculateSellerScore(sellerRating);
  const review = calculateReviewScore(reviewCount, analyzedCount);
  const sentiment = calculateSentimentScore(sentimentData, analyzedCount);

  const totalScore = price.score + seller.score + review.score + sentiment.score;

  return {
    totalScore,
    breakdown: {
      priceScore: { value: price.score, max: 25, explanation: price.explanation },
      sellerScore: { value: seller.score, max: 25, explanation: seller.explanation },
      reviewScore: { value: review.score, max: 25, explanation: review.explanation },
      sentimentScore: { value: sentiment.score, max: 25, explanation: sentiment.explanation }
    }
  };
};

module.exports = { calculateAuthenticityScore };
