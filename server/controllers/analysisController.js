/**
 * Analysis Controller
 * -------------------
 * Handles AI product analysis and history retrieval.
 * 
 * Functions:
 *   - analyzeProduct: Run AI analysis on a product (authenticity + sentiment)
 *   - getHistory: Fetch user's past analyses
 *   - getAnalysisById: Fetch a single analysis by ID
 */

const Analysis = require('../models/Analysis');
const { getVerdict } = require('../ai/verdictEngine');
const { analyzeReviewsAsync } = require('../ai/sentimentAnalyzer');
const VerificationHistory = require('../models/VerificationHistory');
const { scrapeReviews } = require('../scrapers/reviewScraper');
const { scrapeProductPagePrice } = require('../scrapers/priceScraper');
const axios = require('axios');

/**
 * POST /api/analysis/analyze
 * 
 * Run the AI analysis pipeline on a product.
 * 
 * Request Body:
 *   - productName: Name of the product (required)
 *   - productPrice: Price of the product (required)
 *   - productImage: Image URL (optional)
 *   - productLink: Product page URL (optional)
 *   - platform: Platform name (required)
 *   - averagePrice: Average price from search results (optional)
 *   - sellerRating: Seller's rating 0-5 (optional)
 *   - reviewCount: Number of reviews (optional)
 *   - reviews: Array of review text strings (optional)
 * 
 * Returns: Complete analysis with verdict, scores, and sentiment
 */
const analyzeProduct = async (req, res) => {
  try {
    const {
      productName,
      productPrice,
      productImage,
      productLink,
      platform,
      averagePrice,
      sellerRating,
      reviewCount,
      reviews
    } = req.body;

    // Validate required fields
    if (!productName || !productPrice || !platform) {
      return res.status(400).json({
        message: 'Product name, price, and platform are required.'
      });
    }

    // Run the AI analysis pipeline
    console.log(`🤖 Analyzing: "${productName}" ($${productPrice}) from ${platform}`);

    // ===== PRICE VERIFICATION STEP =====
    // For AliExpress products, the search-card price is often wrong
    // (coupon amounts, deposit prices, accessory variant prices).
    // We re-scrape the actual product page to get the confirmed price.
    let confirmedPrice = parseFloat(productPrice);
    let priceVerified = false;
    let priceSource = 'search-card';
    let priceNote = null;

    if (productLink && productLink !== '#') {
      try {
        const platformLower = (platform || '').toLowerCase();
        // Only re-scrape price for AliExpress (other platforms are usually accurate)
        if (platformLower === 'aliexpress' || productLink.includes('aliexpress.')) {
          console.log(`  🔍 Verifying price from product page...`);
          const pagePrice = await scrapeProductPagePrice(productLink, platform);

          if (pagePrice && pagePrice.priceUSD > 0 && pagePrice.confidence !== 'low') {
            const searchPrice = confirmedPrice;
            const pageUSD = pagePrice.priceUSD;

            // If prices differ significantly, the page price is more reliable
            const priceDiffRatio = Math.abs(pageUSD - searchPrice) / Math.max(pageUSD, searchPrice);

            if (priceDiffRatio > 0.3) {
              console.log(`  ⚠️ Search price ($${searchPrice}) differs significantly from page price ($${pageUSD})`);
              console.log(`  ✅ Using verified page price: $${pageUSD}`);
              confirmedPrice = pageUSD;
              priceVerified = true;
              priceSource = pagePrice.source;
              priceNote = `Price corrected from $${searchPrice.toFixed(2)} to $${pageUSD.toFixed(2)} after verifying product page. ` +
                          `The search result showed a coupon/discount amount, not the real product price.`;
            } else {
              console.log(`  ✅ Price verified: search ($${searchPrice}) ≈ page ($${pageUSD})`);
              priceVerified = true;
              priceSource = 'verified';
            }
          } else {
            console.log(`  ⚠️ Could not verify price from product page — using search price`);
            // If search price seems suspiciously low, flag it
            const avgP = parseFloat(averagePrice) || 0;
            if (avgP > 0 && confirmedPrice < avgP * 0.1) {
              priceNote = 'Price data uncertain — the displayed price may be a coupon or deposit amount, not the actual product price. Manual verification required.';
              console.log(`  ⚠️ ${priceNote}`);
            }
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ Price verification failed:`, err.message);
      }
    }

    // Scrape real user reviews from the product page
    let reviewTexts = reviews || [];
    if ((!reviewTexts.length || reviewTexts.length === 0) && productLink && productLink !== '#') {
      try {
        console.log(`  📝 Scraping real reviews from product page...`);
        reviewTexts = await scrapeReviews(productLink, platform.toLowerCase());
        console.log(`  ✅ Scraped ${reviewTexts.length} real reviews from ${platform}`);
      } catch (err) {
        console.warn(`  ⚠️ Review scraping failed:`, err.message);
      }
    }

    // If no reviews were scraped, the analysis will proceed using
    // rating and review count data only — no fake reviews are generated.
    if (reviewTexts.length === 0) {
      console.log(`  📝 No reviews found — analysis will rely on rating/count data only`);
    }

    const sentimentResult = await analyzeReviewsAsync(reviewTexts);

    const analysisResult = getVerdict({
      sentimentResult,
      productName,
      productPrice: confirmedPrice,
      averagePrice: parseFloat(averagePrice) || 0,
      sellerRating: parseFloat(sellerRating) || 0,
      reviewCount: parseInt(reviewCount) || 0,
      reviews: reviewTexts,
      priceVerified,
      priceNote
    });

    // Save analysis to database for history
    const analysis = new Analysis({
      user: req.user.userId,
      productName,
      productPrice: confirmedPrice,
      productImage: productImage || '',
      productLink: productLink || '',
      platform,
      averagePrice: parseFloat(averagePrice) || 0,
      authenticityScore: analysisResult.authenticityScore,
      verdict: analysisResult.verdict,
      suggestion: analysisResult.suggestion,
      breakdown: analysisResult.breakdown,
      sentimentBreakdown: analysisResult.sentimentBreakdown,
      reviews: analysisResult.analyzedReviews.map(r => ({
        text: r.text,
        score: r.score,
        label: r.label
      })),
      cosineSimilarity: {
        duplicates: {
          duplicateCount: analysisResult.cosineSimilarity?.duplicates?.duplicateCount || 0,
          suspiciousPercentage: analysisResult.cosineSimilarity?.duplicates?.suspiciousPercentage || 0,
          totalComparisons: analysisResult.cosineSimilarity?.duplicates?.totalComparisons || 0
        },
        relevance: {
          averageRelevance: analysisResult.cosineSimilarity?.relevance?.averageRelevance || 0,
          irrelevantCount: analysisResult.cosineSimilarity?.relevance?.irrelevantCount || 0,
          relevanceScore: analysisResult.cosineSimilarity?.relevance?.relevanceScore || 12
        }
      }
    });

    await analysis.save();
    console.log(`✅ Analysis saved: ${analysisResult.verdict} (${analysisResult.authenticityScore}/100)`);

    // Return full analysis result
    res.json({
      analysisId: analysis._id,
      productName,
      productPrice: confirmedPrice,
      originalSearchPrice: parseFloat(productPrice),
      priceVerified,
      priceSource,
      priceNote,
      productImage,
      productLink,
      platform,
      ...analysisResult
    });

  } catch (error) {
    console.error('Analysis error:', error.message);
    res.status(500).json({
      message: 'An error occurred during analysis. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/analysis/history?page=1&limit=10
 * 
 * Fetch the current user's past analyses.
 * Sorted by most recent first. Paginated.
 * 
 * Query Parameters:
 *   page - Page number (default: 1)
 *   limit - Results per page (default: 10, max: 50)
 */
const getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await Analysis.countDocuments({ user: req.user.userId });

    // Fetch analyses for this user, sorted by newest first
    const analyses = await Analysis.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-reviews'); // Exclude individual reviews from list view

    res.json({
      analyses,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalResults: total,
        hasMore: skip + limit < total
      }
    });
  } catch (error) {
    console.error('History error:', error.message);
    res.status(500).json({ message: 'Error fetching analysis history.' });
  }
};

/**
 * GET /api/analysis/:id
 * 
 * Fetch a single analysis by its MongoDB ID.
 * Only returns the analysis if it belongs to the current user.
 */
const getAnalysisById = async (req, res) => {
  try {
    const analysis = await Analysis.findOne({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!analysis) {
      return res.status(404).json({ message: 'Analysis not found.' });
    }

    res.json(analysis);
  } catch (error) {
    console.error('Get analysis error:', error.message);
    res.status(500).json({ message: 'Error fetching analysis.' });
  }
};

/**
 * Store an image verification in VerificationHistory (report §7.6.2).
 */
const saveVerification = (userId, method, subject, category, result) =>
  VerificationHistory.create({
    user: userId,
    method,
    subject: String(subject || '').substring(0, 500),
    category,
    resultLabel: result.status || 'Inconclusive',
    confidence: Math.max(0, Math.min(100, Math.round(result.confidenceScore || 0))),
    details: { modelUsed: result.modelUsed, classifications: result.classificationResults || [] }
  }).catch(err => console.warn('⚠️ Could not save verification history:', err.message));

/**
 * POST /api/analysis/verify-image
 * 
 * Verify a product image for authenticity using AI analysis.
 * Accepts multipart form data with image file and category.
 */
const verifyImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file.' });
    }

    const { category } = req.body;
    const validCategories = ['electronics', 'fashion', 'cosmetics', 'accessories'];

    if (!category || !validCategories.includes(category.toLowerCase())) {
      return res.status(400).json({
        message: 'Please select a valid category: electronics, fashion, cosmetics, or accessories.'
      });
    }

    console.log(`🔍 Verifying uploaded image: "${req.file.originalname}" in category "${category}"`);

    const { verifyProductImage } = require('../ai/imageVerifier');

    const result = await verifyProductImage({
      imageBuffer: req.file.buffer,
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      originalName: req.file.originalname,
      category: category.toLowerCase()
    });

    console.log(`✅ Verification complete: ${result.status} (${result.confidenceScore}%) — Model: ${result.modelUsed}`);

    await saveVerification(req.user.userId, 'image', req.file.originalname, category.toLowerCase(), result);
    res.json(result);
  } catch (error) {
    console.error('Image verification error:', error.message);
    res.status(500).json({
      message: 'An error occurred during image verification. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/analysis/verify-url
 * 
 * Verify a product image by its URL. Downloads the image server-side
 * and runs the image verifier on it. Used by ProductDetail page.
 */
const verifyImageUrl = async (req, res) => {
  try {
    const { imageUrl, category } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: 'Image URL is required.' });
    }

    const validCategories = ['electronics', 'fashion', 'cosmetics', 'accessories'];
    const cat = (category || 'electronics').toLowerCase();

    console.log(`🔍 Verifying image from URL: "${imageUrl.substring(0, 80)}..." in category "${cat}"`);

    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const imageBuffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const fileSize = imageBuffer.length;

    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const originalName = urlParts[urlParts.length - 1].split('?')[0] || 'product-image';

    const { verifyProductImage } = require('../ai/imageVerifier');

    const result = await verifyProductImage({
      imageBuffer,
      fileSize,
      mimetype: contentType,
      originalName,
      category: validCategories.includes(cat) ? cat : 'electronics'
    });

    console.log(`✅ URL verification complete: ${result.status} (${result.confidenceScore}%) — Model: ${result.modelUsed}`);

    await saveVerification(req.user.userId, 'url', imageUrl, cat, result);
    res.json(result);
  } catch (error) {
    console.error('URL image verification error:', error.message);

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(408).json({ message: 'Image download timed out. Please try again.' });
    }

    res.status(500).json({
      message: 'Failed to verify image. The image URL may be inaccessible.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { analyzeProduct, getHistory, getAnalysisById, verifyImage, verifyImageUrl };

