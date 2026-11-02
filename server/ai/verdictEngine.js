/**
 * Verdict Engine
 * --------------
 * Combines the authenticity score with sentiment analysis to produce
 * a final shopping verdict: "Buy", "Risky", or "Avoid".
 * 
 * This is the final step of the AI pipeline:
 *   Scraper → Authenticity Scorer → Sentiment Analyzer → Verdict Engine
 * 
 * Verdict Thresholds:
 *   Score >= 75 → "Buy"   (Green  ✅) — Product appears authentic and well-reviewed
 *   Score >= 45 → "Risky" (Yellow ⚠️) — Some warning signs, proceed with caution
 *   Score <  45 → "Avoid" (Red    ❌) — High risk of fake/scam product
 */

const { calculateAuthenticityScore } = require('./authenticityScorer');
const { analyzeReviews } = require('./sentimentAnalyzer');
const { detectDuplicateReviews, checkReviewRelevance } = require('./cosineSimilarity');

/**
 * Generate a human-readable suggestion based on the verdict and score.
 * This text is shown to the user as the AI's recommendation.
 * 
 * @param {string} verdict - "Buy", "Risky", or "Avoid"
 * @param {number} score - Authenticity score (0-100)
 * @param {Object} breakdown - Score breakdown from authenticityScorer
 * @returns {string} Human-readable suggestion text
 */
const generateSuggestion = (verdict, score, breakdown) => {
  // Find the weakest factor (lowest score relative to max)
  const factors = Object.entries(breakdown);
  const weakest = factors.reduce((min, [key, val]) => 
    (val.value / val.max < min.ratio) ? { name: key, ratio: val.value / val.max, explanation: val.explanation } : min,
    { name: '', ratio: 1, explanation: '' }
  );

  switch (verdict) {
    case 'Buy':
      return `This product scores ${score}/100 and appears to be authentic. ` +
             `All indicators look positive. It's generally safe to purchase this product. ` +
             `Tip: Always verify the seller's return policy before buying.`;
    
    case 'Risky':
      return `This product scores ${score}/100 — there are some warning signs. ` +
             `Main concern: ${weakest.explanation} ` +
             `We recommend comparing with other sellers and checking the return policy carefully.`;
    
    case 'Avoid':
      return `This product scores ${score}/100 — multiple red flags detected! ` +
             `Key issue: ${weakest.explanation} ` +
             `We strongly recommend avoiding this product and looking for alternatives from verified sellers.`;
    
    default:
      return `Analysis complete. Score: ${score}/100.`;
  }
};

/**
 * Main function: Run the complete AI analysis pipeline on a product.
 * 
 * Steps:
 *   1. Analyze review sentiments
 *   2. Calculate authenticity score using all 4 factors
 *   3. Determine verdict based on score
 *   4. Generate human-readable suggestion
 * 
 * @param {Object} params
 *   @param {number} params.productPrice - Price of the product
 *   @param {number} params.averagePrice - Average price of similar products
 *   @param {number} params.sellerRating - Seller rating (0-5 scale)
 *   @param {number} params.reviewCount - Number of reviews
 *   @param {string[]} params.reviews - Array of review text strings
 * @returns {Object} Complete analysis result
 */
const getVerdict = ({ productName, productPrice, averagePrice, sellerRating, reviewCount, reviews, priceVerified, priceNote, sentimentResult: precomputedSentiment }) => {
  // Step 1: Analyze review sentiments (may be precomputed by DistilBERT)
  const sentimentResult = precomputedSentiment || analyzeReviews(reviews || []);

  // Step 1.5: Cosine similarity analysis on reviews
  const reviewTexts = reviews || [];
  let cosineResults = { duplicates: null, relevance: null };
  if (reviewTexts.length >= 2) {
    cosineResults.duplicates = detectDuplicateReviews(reviewTexts);
    cosineResults.relevance = checkReviewRelevance(reviewTexts, productName || '');
  } else if (reviewTexts.length === 1) {
    cosineResults.relevance = checkReviewRelevance(reviewTexts, productName || '');
  }

  // Step 2: Calculate authenticity score
  // Use the actual scraped review count if it's higher than the search card count
  const actualReviewCount = Math.max(reviewCount || 0, reviewTexts.length);

  const { totalScore, breakdown } = calculateAuthenticityScore({
    productPrice,
    averagePrice,
    sellerRating,
    reviewCount: actualReviewCount,
    analyzedCount: sentimentResult.totalReviews || 0,
    sentimentData: {
      positive: sentimentResult.positive,
      neutral: sentimentResult.neutral,
      negative: sentimentResult.negative
    }
  });

  // Step 2.5: Apply cosine similarity penalty
  // If >30% of reviews are near-duplicates, reduce score (max -5 points)
  let cosinePenalty = 0;
  if (cosineResults.duplicates && cosineResults.duplicates.suspiciousPercentage > 30) {
    cosinePenalty = Math.min(5, Math.round(cosineResults.duplicates.suspiciousPercentage / 20));
  }
  const adjustedScore = Math.max(0, totalScore - cosinePenalty);

  // Step 3: Determine verdict based on adjusted score
  let verdict;
  if (adjustedScore >= 75) {
    verdict = 'Buy';
  } else if (adjustedScore >= 45) {
    verdict = 'Risky';
  } else {
    verdict = 'Avoid';
  }

  // Step 4: Generate human-readable suggestion
  let suggestion = generateSuggestion(verdict, adjustedScore, breakdown);

  // Step 5: If price was corrected/verified, append a note
  if (priceNote) {
    suggestion = `📌 Price Note: ${priceNote}\n\n${suggestion}`;
  }

  // Return complete analysis result
  return {
    verdict,
    authenticityScore: adjustedScore,
    suggestion,
    breakdown: {
      priceScore: breakdown.priceScore.value,
      sellerScore: breakdown.sellerScore.value,
      reviewScore: breakdown.reviewScore.value,
      sentimentScore: breakdown.sentimentScore.value
    },
    breakdownDetails: breakdown,
    sentimentBreakdown: {
      positive: sentimentResult.positive,
      neutral: sentimentResult.neutral,
      negative: sentimentResult.negative
    },
    sentimentDetails: {
      averageScore: sentimentResult.averageScore,
      totalReviews: sentimentResult.totalReviews,
      note: sentimentResult.note || null,
      engine: sentimentResult.engine || 'AFINN-165 lexicon'
    },
    analyzedReviews: sentimentResult.analyzedReviews || [],
    cosineSimilarity: {
      duplicates: cosineResults.duplicates || { duplicateCount: 0, suspiciousPercentage: 0, totalComparisons: 0 },
      relevance: cosineResults.relevance || { averageRelevance: 0, irrelevantCount: 0, relevanceScore: 12 },
      penalty: cosinePenalty
    },
    priceVerified: priceVerified || false
  };
};

module.exports = { getVerdict };
