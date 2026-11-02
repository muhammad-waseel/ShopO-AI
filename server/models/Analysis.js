/**
 * Analysis Model
 * --------------
 * Stores AI analysis results for products. Each time a user clicks
 * "AI Analysis" on a product, the result is saved here for history.
 * 
 * Fields:
 *   - user: Who requested the analysis
 *   - productName/Price/Image/Link/Platform: Product being analyzed
 *   - authenticityScore: Overall score 0-100
 *   - verdict: "Buy", "Risky", or "Avoid"
 *   - suggestion: Human-readable AI suggestion text
 *   - breakdown: Individual scores for each factor (price, seller, review, sentiment)
 *   - sentimentBreakdown: Percentage of positive/neutral/negative reviews
 *   - reviews: Individual review texts with their sentiment scores
 */

const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Product information
  productName: { type: String, required: true },
  productPrice: { type: Number, required: true },
  productImage: { type: String, default: '' },
  productLink: { type: String, default: '' },
  platform: { type: String, required: true },
  averagePrice: { type: Number, default: 0 },

  // AI Analysis Results
  authenticityScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  verdict: {
    type: String,
    required: true,
    enum: ['Buy', 'Risky', 'Avoid']
  },
  suggestion: {
    type: String,
    required: true
  },

  // Score breakdown (each factor scored 0-25)
  breakdown: {
    priceScore: { type: Number, default: 0 },
    sellerScore: { type: Number, default: 0 },
    reviewScore: { type: Number, default: 0 },
    sentimentScore: { type: Number, default: 0 }
  },

  // Sentiment analysis results (percentages)
  sentimentBreakdown: {
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 }
  },

  // Individual review sentiments
  reviews: [{
    text: String,
    score: Number,
    label: { type: String, enum: ['positive', 'neutral', 'negative'] }
  }],

  // Cosine similarity analysis results
  cosineSimilarity: {
    duplicates: {
      duplicateCount: { type: Number, default: 0 },
      suspiciousPercentage: { type: Number, default: 0 },
      totalComparisons: { type: Number, default: 0 }
    },
    relevance: {
      averageRelevance: { type: Number, default: 0 },
      irrelevantCount: { type: Number, default: 0 },
      relevanceScore: { type: Number, default: 12 }
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Index for fetching user's analysis history efficiently
analysisSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Analysis', analysisSchema);
