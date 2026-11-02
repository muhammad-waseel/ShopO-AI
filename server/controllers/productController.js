/**
 * Product Controller
 * ------------------
 * Handles product search requests (text, image and voice).
 *
 * Search flow:
 *   1. Check if forceRefresh is requested — if so, skip cache
 *   2. Check MongoDB cache for recent identical search
 *   3. If cache hit → return cached products (with cachedAt timestamp)
 *   4. If cache miss or forceRefresh → run scrapers, update cache
 *   5. Rank products (price + trust + sentiment) and mark one "Best Pick"
 *   6. Log the search to SearchHistory (UC-3)
 *
 * Functions:
 *   - searchProducts:  GET  /api/products/search
 *   - getSuggestions:  GET  /api/products/suggestions   (autocomplete)
 *   - imageSearch:     POST /api/products/image-search  (FR6)
 *   - voiceTranscribe: POST /api/products/voice-search  (FR7 fallback)
 */

const Search = require('../models/Search');
const SearchHistory = require('../models/SearchHistory');
const Analysis = require('../models/Analysis');
const { scrapeAll, normalizeQuery } = require('../scrapers');
const { rankProducts } = require('../services/recommender');
const { imageToQuery } = require('../services/imageSearch');
const { transcribe } = require('../services/speechToText');

const VALID_PLATFORMS = ['aliexpress', 'ebay', 'amazon', 'daraz'];

// Popular product searches used to seed autocomplete for new users
const POPULAR_SEARCHES = [
  'iphone 15', 'iphone 15 pro', 'samsung galaxy s24', 'samsung galaxy watch', 'airpods pro 2',
  'wireless earbuds', 'bluetooth speaker', 'gaming mouse', 'mechanical keyboard', 'dell xps 13',
  'macbook air', 'gaming laptop', 'smart watch', 'power bank', 'usb c charger', 'nike running shoes',
  'adidas sneakers', 'ray ban sunglasses', 'casio watch', 'backpack', 'perfume', 'hair dryer',
  'ps5 controller', 'xiaomi redmi note 13', 'infinix hot 40', 'oneplus 12', 'kindle paperwhite',
  'jbl flip 6', 'sony wh-1000xm5', 'logitech webcam', 'external ssd 1tb', 'monitor 27 inch'
];

/**
 * Build a link → sentiment map from analyses saved for these products,
 * so the ranking can use real review sentiment where available.
 */
const getSentimentMap = async (products) => {
  const links = products.map(p => (p.link || '').split('?')[0]).filter(l => l && l !== '#');
  if (!links.length) return new Map();
  const regexes = links.slice(0, 200).map(l => new RegExp('^' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Only analyses that actually contained reviews carry real sentiment
  const analyses = await Analysis.find({ productLink: { $in: regexes }, 'reviews.0': { $exists: true } })
    .sort({ createdAt: -1 })
    .select('productLink sentimentBreakdown')
    .lean();
  const map = new Map();
  for (const a of analyses) {
    const key = (a.productLink || '').split('?')[0];
    if (!map.has(key)) map.set(key, a.sentimentBreakdown);
  }
  return map;
};

const logSearch = async (userId, query, searchType, platforms, ranked) => {
  try {
    const top = [...ranked]
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 5)
      .map(p => ({
        name: p.name, price: p.price, displayPrice: p.displayPrice, image: p.image, link: p.link,
        platform: p.platform, rating: p.rating, reviewCount: p.reviewCount, trustScore: p.trustScore,
        recommendationScore: p.recommendationScore
      }));
    await SearchHistory.create({
      user: userId, query, searchType, platforms, resultCount: ranked.length, topProducts: top
    });
  } catch (err) {
    console.warn('⚠️ Could not log search history:', err.message);
  }
};

/**
 * GET /api/products/search?q=iPhone+15&platforms=ebay,amazon&forceRefresh=true&searchType=text
 */
const searchProducts = async (req, res) => {
  try {
    const { q, platforms, forceRefresh } = req.query;
    const searchType = ['text', 'image', 'voice'].includes(req.query.searchType) ? req.query.searchType : 'text';

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required.' });
    }
    if (q.length > 200) {
      return res.status(400).json({ message: 'Search query is too long.' });
    }

    const query = normalizeQuery(q.trim().toLowerCase()) || q.trim().toLowerCase();
    const shouldRefresh = forceRefresh === 'true';

    const platformList = platforms
      ? platforms.split(',').map(p => p.trim().toLowerCase())
      : VALID_PLATFORMS;
    const filteredPlatforms = platformList.filter(p => VALID_PLATFORMS.includes(p));

    if (filteredPlatforms.length === 0) {
      return res.status(400).json({ message: 'No valid platforms selected.' });
    }

    const started = Date.now();
    let products, platformResults = {}, cached = false, cachedAt = null;

    // Step 1: Check cache (skip if forceRefresh)
    if (!shouldRefresh) {
      const cachedSearch = await Search.findOne({
        query,
        platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
      }).sort({ createdAt: -1 });

      if (cachedSearch) {
        console.log(`📦 Cache hit for "${query}" — returning cached results`);
        products = cachedSearch.products.map(p => p.toObject());
        cached = true;
        cachedAt = cachedSearch.createdAt;
      }
    } else {
      console.log(`🔄 Force refresh for "${query}" — bypassing cache`);
    }

    // Step 2: Run scrapers (cache miss or force refresh)
    if (!cached) {
      const result = await scrapeAll(query, filteredPlatforms);
      products = result.products;
      platformResults = result.platformResults;

      if (products.length > 0) {
        await Search.deleteMany({
          query,
          platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
        });
        await Search.create({ user: req.user.userId, query, platforms: filteredPlatforms, products });
      }
    }

    // Step 3: Rank and pick the recommended product
    const sentimentMap = await getSentimentMap(products);
    const ranked = rankProducts(products, sentimentMap);
    const bestPick = ranked.find(p => p.isBestPick) || null;

    // Step 4: Log search history
    await logSearch(req.user.userId, query, searchType, filteredPlatforms, ranked);

    res.json({
      query,
      products: ranked,
      bestPick,
      cached,
      cachedAt,
      platformResults,
      totalProducts: ranked.length,
      responseTimeMs: Date.now() - started
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      message: 'An error occurred while searching. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/products/suggestions?q=iph
 * Autocomplete: the user's own past searches first, then searches that are
 * popular across all users, then a built-in list of popular products.
 */
const getSuggestions = async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 15);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = q ? new RegExp('(^|\\s)' + escaped) : null;
    const [mineDocs, popular] = await Promise.all([
      SearchHistory.find({ user: req.user.userId, ...(regex && { query: regex }) })
        .sort({ createdAt: -1 }).limit(50).select('query').lean(),
      SearchHistory.aggregate([
        { $match: regex ? { query: regex } : {} },
        { $group: { _id: '$query', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
      ])
    ]);
    const mine = [...new Set(mineDocs.map(d => d.query))].map(qq => ({ _id: qq }));

    const out = [];
    const seen = new Set();
    const push = (text, source) => {
      if (!text || seen.has(text) || out.length >= limit) return;
      seen.add(text);
      out.push({ text, source });
    };
    mine.forEach(m => push(m._id, 'history'));
    popular.forEach(p => push(p._id, 'trending'));
    POPULAR_SEARCHES
      .filter(s => !q || s.startsWith(q) || s.includes(' ' + q) || s.includes(q))
      .forEach(s => push(s, 'popular'));

    res.json({ suggestions: out });
  } catch (error) {
    console.error('Suggestions error:', error.message);
    res.json({ suggestions: [] });
  }
};

/**
 * POST /api/products/image-search  (multipart: image)
 * Returns the query detected from the photo. The client then runs a normal
 * search with searchType=image. If no vision engine is available the API
 * returns 503 with fallback: 'text' so the UI can switch to text search.
 */
const imageSearch = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please upload an image.' });
    const result = await imageToQuery(req.file.buffer, req.file.mimetype);
    console.log(`🖼️  Image search → "${result.query}" via ${result.engine}`);
    res.json(result);
  } catch (error) {
    if (error.status === 503) {
      return res.status(503).json({ message: error.message, fallback: 'text' });
    }
    console.error('Image search error:', error.message);
    res.status(500).json({ message: 'Could not process the image. Please try text search.', fallback: 'text' });
  }
};

/**
 * POST /api/products/voice-search  (multipart: audio)
 * Server-side transcription for browsers without the Web Speech API.
 */
const voiceTranscribe = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please record some audio.' });
    const result = await transcribe(req.file.buffer, req.file.mimetype);
    if (!result.transcript) {
      return res.status(422).json({ message: "Sorry, we couldn't understand that. Please try again or type your search." });
    }
    res.json(result);
  } catch (error) {
    if (error.status === 503) {
      return res.status(503).json({ message: error.message, fallback: 'text' });
    }
    console.error('Voice search error:', error.message);
    res.status(500).json({ message: 'Voice search failed. Please type your search.', fallback: 'text' });
  }
};

module.exports = { searchProducts, getSuggestions, imageSearch, voiceTranscribe, POPULAR_SEARCHES };
