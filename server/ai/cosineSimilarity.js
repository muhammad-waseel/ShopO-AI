/**
 * Cosine Similarity Module
 * -------------------------
 * Uses TF-IDF (Term Frequency - Inverse Document Frequency) vectorization
 * and cosine similarity to:
 *   1. Detect duplicate/fake reviews (suspiciously similar review pairs)
 *   2. Check review-product relevance (are reviews actually about this product?)
 *
 * Uses the `natural` npm package for TF-IDF computation.
 *
 * Cosine Similarity = (A · B) / (||A|| * ||B||)
 *   - 1.0 = identical documents
 *   - 0.0 = completely unrelated
 *   - > 0.85 = suspiciously similar (potential fake/duplicate)
 *
 * Used by: verdictEngine.js during the analysis pipeline
 */

// Import only the TF-IDF module: the package root also loads an ESM-only
// sentiment lexicon that breaks require() on Node 18/20.
const TfIdf = require('natural/lib/natural/tfidf/tfidf');

/**
 * Build a TF-IDF vector for a document given a TfIdf instance and document index.
 * Returns a Map of term → tfidf score.
 */
const buildVector = (tfidf, docIndex) => {
  const vector = new Map();
  tfidf.listTerms(docIndex).forEach(item => {
    vector.set(item.term, item.tfidf);
  });
  return vector;
};

/**
 * Compute cosine similarity between two TF-IDF vectors.
 * @param {Map} vecA - TF-IDF vector A
 * @param {Map} vecB - TF-IDF vector B
 * @returns {number} Similarity score between 0 and 1
 */
const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Compute dot product (only terms present in both)
  for (const [term, scoreA] of vecA) {
    const scoreB = vecB.get(term) || 0;
    dotProduct += scoreA * scoreB;
    normA += scoreA * scoreA;
  }

  // Add remaining terms from vecB for its norm
  for (const [term, scoreB] of vecB) {
    normB += scoreB * scoreB;
    if (!vecA.has(term)) {
      // Already counted terms in vecA in the loop above
    }
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
};

/**
 * Detect duplicate/suspiciously similar reviews.
 *
 * Compares every pair of reviews using TF-IDF cosine similarity.
 * Reviews with similarity > 0.85 are flagged as potential duplicates.
 *
 * @param {string[]} reviews - Array of review text strings
 * @returns {Object} {
 *   duplicatePairs: [{ reviewA: string, reviewB: string, similarity: number }],
 *   duplicateCount: number,
 *   suspiciousPercentage: number (0-100),
 *   totalComparisons: number
 * }
 */
const detectDuplicateReviews = (reviews) => {
  if (!reviews || reviews.length < 2) {
    return {
      duplicatePairs: [],
      duplicateCount: 0,
      suspiciousPercentage: 0,
      totalComparisons: 0
    };
  }

  const SIMILARITY_THRESHOLD = 0.85;

  // Build TF-IDF model with all reviews as documents
  const tfidf = new TfIdf();
  reviews.forEach(review => {
    tfidf.addDocument((review || '').toLowerCase());
  });

  // Build vectors for each review
  const vectors = reviews.map((_, i) => buildVector(tfidf, i));

  // Compare all pairs
  const duplicatePairs = [];
  const flaggedIndices = new Set();

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);

      if (similarity >= SIMILARITY_THRESHOLD) {
        duplicatePairs.push({
          reviewA: (reviews[i] || '').substring(0, 100),
          reviewB: (reviews[j] || '').substring(0, 100),
          similarity: Math.round(similarity * 100) / 100
        });
        flaggedIndices.add(i);
        flaggedIndices.add(j);
      }
    }
  }

  const totalComparisons = (reviews.length * (reviews.length - 1)) / 2;
  const suspiciousPercentage = reviews.length > 0
    ? Math.round((flaggedIndices.size / reviews.length) * 100)
    : 0;

  return {
    duplicatePairs,
    duplicateCount: duplicatePairs.length,
    suspiciousPercentage,
    totalComparisons
  };
};

/**
 * Check how relevant reviews are to the product being reviewed.
 *
 * Computes TF-IDF cosine similarity between each review and the product name.
 * Reviews with very low similarity (< 0.05) may be generic/fake reviews
 * not actually about this specific product.
 *
 * @param {string[]} reviews - Array of review text strings
 * @param {string} productName - Name of the product
 * @returns {Object} {
 *   averageRelevance: number (0-1),
 *   irrelevantCount: number,
 *   irrelevantReviews: string[],
 *   relevanceScore: number (0-25 scale for scoring)
 * }
 */
const checkReviewRelevance = (reviews, productName) => {
  if (!reviews || reviews.length === 0 || !productName) {
    return {
      averageRelevance: 0,
      irrelevantCount: 0,
      irrelevantReviews: [],
      relevanceScore: 12 // Neutral — no data
    };
  }

  const RELEVANCE_THRESHOLD = 0.05;

  // Build TF-IDF: first document = product name, rest = reviews
  const tfidf = new TfIdf();
  tfidf.addDocument(productName.toLowerCase()); // doc index 0
  reviews.forEach(review => {
    tfidf.addDocument((review || '').toLowerCase());
  });

  // Get vector for product name
  const productVector = buildVector(tfidf, 0);

  // Compare each review against the product name
  const relevanceScores = [];
  const irrelevantReviews = [];

  reviews.forEach((review, i) => {
    const reviewVector = buildVector(tfidf, i + 1); // +1 because product name is doc 0
    const similarity = cosineSimilarity(productVector, reviewVector);
    relevanceScores.push(similarity);

    if (similarity < RELEVANCE_THRESHOLD) {
      irrelevantReviews.push((review || '').substring(0, 100));
    }
  });

  const averageRelevance = relevanceScores.length > 0
    ? Math.round((relevanceScores.reduce((sum, s) => sum + s, 0) / relevanceScores.length) * 100) / 100
    : 0;

  // Convert to a 0-25 score for the scoring system
  // High relevance (>0.15) = 25, moderate (0.08-0.15) = 18, low (0.03-0.08) = 12, very low (<0.03) = 5
  let relevanceScore;
  if (averageRelevance >= 0.15) {
    relevanceScore = 25;
  } else if (averageRelevance >= 0.08) {
    relevanceScore = 18;
  } else if (averageRelevance >= 0.03) {
    relevanceScore = 12;
  } else {
    relevanceScore = 5;
  }

  return {
    averageRelevance,
    irrelevantCount: irrelevantReviews.length,
    irrelevantReviews,
    relevanceScore
  };
};

module.exports = { detectDuplicateReviews, checkReviewRelevance, cosineSimilarity };
