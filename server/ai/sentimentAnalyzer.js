/**
 * Sentiment Analyzer
 * ------------------
 * Analyzes the sentiment of product reviews using the `sentiment` npm package.
 * Uses the AFINN-165 word list — a pre-built English sentiment lexicon that
 * assigns scores to ~3,300 words (e.g., "good" = +3, "terrible" = -5).
 * 
 * How it works:
 *   1. Each review text is tokenized into words
 *   2. Each word is looked up in the AFINN dictionary
 *   3. Scores are summed to get a total sentiment score per review
 *   4. Reviews are classified: positive (>1), neutral (-1 to 1), negative (<-1)
 *   5. Percentages are calculated for each category
 * 
 * No API key needed — runs entirely locally.
 */

const Sentiment = require('sentiment');
const sentiment = new Sentiment();

/**
 * Analyze a single review text and return its sentiment.
 * @param {string} text - Review text to analyze
 * @returns {Object} { text, score, comparative, label }
 */
const analyzeReview = (text) => {
  if (!text || typeof text !== 'string') {
    return { text: '', score: 0, comparative: 0, label: 'neutral' };
  }

  const result = sentiment.analyze(text);
  
  // Classify based on the raw score
  // score > 1  → positive (clearly positive words outweigh negative)
  // score < -1 → negative (clearly negative words outweigh positive)
  // -1 to 1    → neutral (balanced or no strong sentiment)
  let label;
  if (result.score > 1) {
    label = 'positive';
  } else if (result.score < -1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  return {
    text: text.substring(0, 200), // Truncate long reviews for storage
    score: result.score,
    comparative: result.comparative, // Score per word (normalized)
    label
  };
};

/**
 * Analyze an array of review texts and return aggregated results.
 * 
 * @param {string[]} reviews - Array of review text strings
 * @returns {Object} {
 *   positive: number (percentage),
 *   neutral: number (percentage),
 *   negative: number (percentage),
 *   averageScore: number,
 *   totalReviews: number,
 *   analyzedReviews: Array of { text, score, label }
 * }
 */
const analyzeReviews = (reviews) => {
  // Handle case where no reviews are available
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return {
      positive: 0,   // No reviews → nothing to analyze (no fake defaults)
      neutral: 0,
      negative: 0,
      averageScore: 0,
      totalReviews: 0,
      analyzedReviews: [],
      note: 'No reviews found — sentiment analysis not performed.'
    };
  }

  // Analyze each review
  const analyzedReviews = reviews
    .filter(r => r && typeof r === 'string' && r.trim().length > 0)
    .map(analyzeReview);

  if (analyzedReviews.length === 0) {
    return {
      positive: 0,
      neutral: 0,
      negative: 0,
      averageScore: 0,
      totalReviews: 0,
      analyzedReviews: [],
      note: 'Reviews were empty or could not be analyzed.'
    };
  }

  // Count sentiments
  const positiveCount = analyzedReviews.filter(r => r.label === 'positive').length;
  const neutralCount = analyzedReviews.filter(r => r.label === 'neutral').length;
  const negativeCount = analyzedReviews.filter(r => r.label === 'negative').length;
  const total = analyzedReviews.length;

  // Calculate percentages (rounded to whole numbers)
  const positive = Math.round((positiveCount / total) * 100);
  const neutral = Math.round((neutralCount / total) * 100);
  const negative = Math.round((negativeCount / total) * 100);

  // Calculate average sentiment score across all reviews
  const totalScore = analyzedReviews.reduce((sum, r) => sum + r.score, 0);
  const averageScore = Math.round((totalScore / total) * 100) / 100;

  return {
    positive,
    neutral,
    negative,
    averageScore,
    totalReviews: total,
    analyzedReviews
  };
};

/**
 * DistilBERT sentiment (Hugging Face Inference API)
 * -------------------------------------------------
 * When HF_API_KEY is configured, reviews are classified by
 * distilbert-base-uncased-finetuned-sst-2-english (the model described in
 * the project report). Each review gets a polarity in [-1, 1]:
 *   polarity = P(POSITIVE) - P(NEGATIVE)
 * and is labelled positive (> 0.3), negative (< -0.3) or neutral.
 *
 * If the key is missing or the API fails/times out, the AFINN lexicon
 * analyzer above is used instead (graceful degradation, NFR5).
 */
const HF_MODEL = process.env.HF_SENTIMENT_MODEL || 'distilbert-base-uncased-finetuned-sst-2-english';

const classifyWithDistilBert = async (texts) => {
  const axios = require('axios');
  const { data } = await axios.post(
    `https://api-inference.huggingface.co/models/${HF_MODEL}`,
    { inputs: texts.map(t => t.substring(0, 500)), options: { wait_for_model: true } },
    { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, timeout: 20000 }
  );
  // Response: one array of {label, score} per input
  return data.map((scores, i) => {
    const arr = Array.isArray(scores) ? scores : [scores];
    const pos = (arr.find(s => /pos/i.test(s.label)) || {}).score || 0;
    const neg = (arr.find(s => /neg/i.test(s.label)) || {}).score || 0;
    const polarity = Math.round((pos - neg) * 1000) / 1000;
    const label = polarity > 0.3 ? 'positive' : polarity < -0.3 ? 'negative' : 'neutral';
    // Scale to the AFINN-like range used elsewhere (-5..5) so downstream scoring is unchanged
    return { text: texts[i].substring(0, 200), score: Math.round(polarity * 5 * 100) / 100, comparative: polarity, label };
  });
};

const summarize = (analyzedReviews, engine) => {
  const total = analyzedReviews.length;
  const count = (l) => analyzedReviews.filter(r => r.label === l).length;
  return {
    positive: Math.round((count('positive') / total) * 100),
    neutral: Math.round((count('neutral') / total) * 100),
    negative: Math.round((count('negative') / total) * 100),
    averageScore: Math.round((analyzedReviews.reduce((s, r) => s + r.score, 0) / total) * 100) / 100,
    totalReviews: total,
    analyzedReviews,
    engine
  };
};

/**
 * Async analyzer: DistilBERT when available, AFINN otherwise.
 * @param {string[]} reviews
 */
const analyzeReviewsAsync = async (reviews) => {
  const clean = (reviews || []).filter(r => r && typeof r === 'string' && r.trim().length > 0);
  if (clean.length > 0 && process.env.HF_API_KEY) {
    try {
      const analyzed = await classifyWithDistilBert(clean.slice(0, 50));
      return summarize(analyzed, 'DistilBERT (Hugging Face)');
    } catch (err) {
      console.warn(`  ⚠️ DistilBERT sentiment unavailable (${err.message}) — falling back to AFINN`);
    }
  }
  return { ...analyzeReviews(reviews), engine: 'AFINN-165 lexicon' };
};

module.exports = { analyzeReviews, analyzeReview, analyzeReviewsAsync };
