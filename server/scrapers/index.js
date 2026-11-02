/**
 * Scraper Orchestrator
 * --------------------
 * Central module that coordinates all 4 platform scrapers.
 * 
 * Features:
 *   - Runs selected scrapers concurrently using Promise.allSettled()
 *   - Merges results from all platforms into a single array
 *   - Sorts products by price (ascending)
 *   - Tags the cheapest product as "Best Deal"
 *   - Filters out irrelevant products (cases, covers, accessories)
 *   - Gracefully handles individual scraper failures
 * 
 * Usage:
 *   const { scrapeAll } = require('./scrapers');
 *   const products = await scrapeAll('iPhone 15', ['ebay', 'amazon']);
 */

const scrapeEbay = require('./ebay');
const scrapeAliExpress = require('./aliexpress');
const scrapeAmazon = require('./amazon');
const scrapeDaraz = require('./daraz');

// Map platform names to their scraper functions
const scraperMap = {
  ebay: scrapeEbay,
  aliexpress: scrapeAliExpress,
  amazon: scrapeAmazon,
  daraz: scrapeDaraz
};

/**
 * Normalize search query for consistent results across platforms.
 * Inspired by ShopSense's normalize_product_name() function.
 * 
 * - Strips special characters that confuse search engines
 * - Normalizes whitespace
 * - Preserves model numbers and hyphens in product names
 * 
 * @param {string} query - Raw user search query
 * @returns {string} Cleaned query
 */
const normalizeQuery = (query) => {
  if (!query) return '';
  return query
    .replace(/[^a-zA-Z0-9\s\-+.]/g, ' ')  // Remove special chars except hyphens, plus, dots
    .replace(/\s+/g, ' ')                   // Collapse multiple spaces
    .trim();
};

/**
 * List of keywords that indicate a product is an accessory, not the main product.
 * Used by isRelevant() to filter out junk results.
 * (Ported from the original Python scraper's blocklist)
 * 
 * NOTE: These are matched as whole words (word boundaries) to avoid
 * false positives like "open" matching "pen".
 * Patterns use `s?` to match both singular and plural forms.
 * Additionally, certain compound phrases are whitelisted (e.g.,
 * "charging case", "battery case") since they describe product
 * components rather than accessories.
 */
const BLOCKED_KEYWORDS = [
  // Cases & covers
  'cases?', 'covers?', 'protectors?', 'screen protectors?', 'tempered glass',
  'bumpers?', 'wallets?', 'folios?', 'armou?rs?', 'shields?', 'shells?',
  'skins?', 'wraps?', 'pouche?s?', 'sleeves?', 'holsters?',
  // Cables & charging accessories
  'cables?', 'chargers?', 'adapte?rs?', 'dongles?', 'cords?',
  // Mounts & stands
  'holders?', 'stands?', 'mounts?', 'brackets?', 'cradles?',
  'grips?', 'rings?', 'kickstands?', 'docks?', 'docking stations?',
  // Screen & body protection
  'films?', 'stickers?', 'decals?', 'screen guards?',
  // Audio accessories
  'earphones?', 'headphones?', 'earbuds?', 'headsets?',
  // Straps & bands
  'straps?', 'bands?', 'lanyards?', 'wristbands?',
  // Tools & cleaning
  'styluse?s?', 'pens?', 'cleaners?', 'cloths?', 'toolkits?', 'repairs?',
  // Other accessories
  'replacement parts?', 'spare parts?', 'lens protectors?',
  'camera protectors?', 'back glass', 'battery replacement'
];

// Pre-compile blocked keyword regex patterns for word-boundary matching
const BLOCKED_REGEXES = BLOCKED_KEYWORDS.map(kw => new RegExp(`\\b${kw}\\b`, 'i'));

// Whitelisted compound phrases that should NOT trigger blocking.
// These describe legitimate product components, not accessories.
const WHITELIST_PHRASES = [
  'charging case', 'battery case', 'magsafe case', 'wireless charging case',
  'with case', 'includes case', 'and case', 'airpods case', 'airpod case',
  'pen display', 'pen tablet', 'pen monitor',    // art tablets, not stylus pens
  'band new', 'brand new',                        // "band" in "brand new"
  'film camera', 'film scanner',                  // "film" in photography gear
  'skin care', 'skincare',                        // "skin" in health products
  'ring light',                                   // "ring" in photography
  'ring doorbell',                                // Ring brand
  'armor all',                                    // brand name
  'cable tv', 'cable modem',                      // "cable" in services
  'dock connector',                               // built-in dock
  'galaxy watch band',                            // if searching for watch, band is part of it
];

/**
 * Check if a product is relevant to the search query.
 * Filters out accessories and unrelated items.
 * 
 * Logic (improved from successful GitHub product scrapers):
 *   1. Detect "for X" accessory pattern — products described as "for iPhone" are accessories
 *   2. Product name must not contain blocked keywords (singular+plural)
 *   3. ALL significant query words should appear in the product name
 *   4. Numbers from the query (e.g., model numbers like "15") 
 *      should appear in the product name near the brand
 *   5. Compute a relevance score based on token overlap
 * 
 * @param {string} productName - Name/title of the product
 * @param {string} searchQuery - Original search query
 * @returns {boolean} True if product seems relevant
 */
const isRelevant = (productName, searchQuery) => {
  const nameLower = productName.toLowerCase().trim();
  const queryLower = searchQuery.toLowerCase().trim();

  // === STEP 0: Detect "for [product]" accessory pattern ===
  // Products like "Case For iPhone 15", "Screen Protector for Samsung Galaxy S24"
  // start with an accessory word followed by "for" + the actual product name.
  // If the title starts with a non-query word before "for [query terms]", it's an accessory.
  // Also catches titles starting with "For iPhone..." and "Compatible with iPhone..."
  
  // Pattern A: Title starts with "For [product]" — almost always an accessory
  if (/^for\s+/i.test(nameLower)) {
    const afterFor = nameLower.replace(/^for\s+/i, '').trim();
    const queryTokens = queryLower.split(/\s+/).filter(w => w.length >= 3);
    const afterForMatchesQuery = queryTokens.some(w => afterFor.includes(w));
    if (afterForMatchesQuery) {
      console.log(`    🔍 Rejected "For [product]" pattern: "${productName.substring(0, 60)}"`);
      return false;
    }
  }
  
  // Pattern B: "Compatible with [product]" — always an accessory
  if (/compatible\s+with/i.test(nameLower)) {
    const afterCompat = nameLower.replace(/^.*compatible\s+with\s*/i, '').trim();
    const queryTokens = queryLower.split(/\s+/).filter(w => w.length >= 3);
    const afterCompatMatchesQuery = queryTokens.some(w => afterCompat.includes(w));
    if (afterCompatMatchesQuery) {
      console.log(`    🔍 Rejected "Compatible with" pattern: "${productName.substring(0, 60)}"`);
      return false;
    }
  }
  
  // Pattern C: "[accessory] for [product]" — accessory described for target product
  const forPatternMatch = nameLower.match(/^(.+?)\bfor\b\s+(.+)/i);
  if (forPatternMatch) {
    const beforeFor = forPatternMatch[1].trim();
    const afterFor = forPatternMatch[2].trim();
    // Check if the part AFTER "for" contains query terms (meaning the product is FOR our target)
    const queryTokens = queryLower.split(/\s+/).filter(w => w.length >= 3);
    const afterForMatchesQuery = queryTokens.some(w => afterFor.includes(w));
    // Check if the part BEFORE "for" does NOT contain core query terms
    const beforeForMatchesQuery = queryTokens.some(w => beforeFor.includes(w));
    if (afterForMatchesQuery && !beforeForMatchesQuery) {
      // Pattern: "[accessory] for [our product]" → this is an accessory
      console.log(`    🔍 Rejected "for" accessory pattern: "${productName.substring(0, 60)}"`);
      return false;
    }
  }

  // === STEP 1: Check blocked keywords (word-boundary, handles plurals) ===
  for (const regex of BLOCKED_REGEXES) {
    if (regex.test(nameLower)) {
      // Before blocking, check if a whitelist phrase explains the match
      const isWhitelisted = WHITELIST_PHRASES.some(phrase => nameLower.includes(phrase));
      if (!isWhitelisted) {
        return false;
      }
    }
  }

  // === STEP 2: ALL significant query words must appear in product name ===
  // This is stricter than "at least one" — if you search "iPhone 15 Pro Max",
  // ALL of ["iphone", "pro", "max"] must appear ("15" is handled by number check).
  const queryWords = queryLower.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
  if (queryWords.length > 0) {
    const matchCount = queryWords.filter(word => nameLower.includes(word)).length;
    // Require ALL query words to match (with tolerance for 1 missing word if query is long)
    const minRequired = queryWords.length <= 2 ? queryWords.length : queryWords.length - 1;
    if (matchCount < minRequired) {
      return false;
    }
  }

  // === STEP 3: Number/model proximity check ===
  const queryNumbers = queryLower.match(/\d+/g) || [];
  if (queryNumbers.length > 0) {
    const matchedWords = queryWords.filter(w => nameLower.includes(w));
    if (matchedWords.length > 0) {
      // Product has the right brand — verify the model number appears within
      // ~20 chars of the brand word (covers "iPhone 15", "Galaxy S23", etc.)
      const hasProximateNumber = queryNumbers.some(num =>
        matchedWords.some(word => {
          const idx = nameLower.indexOf(word);
          if (idx === -1) return false;
          const windowText = nameLower.substring(Math.max(0, idx - 5), idx + word.length + 20);
          return windowText.includes(num);
        })
      );
      if (!hasProximateNumber) return false;
    }
  }

  // === STEP 4: Relevance score check ===
  // Calculate token overlap ratio — how much of the query appears in the product name.
  // This catches edge cases where all words technically appear but the product is unrelated.
  const allQueryTokens = queryLower.split(/\s+/).filter(w => w.length >= 2);
  if (allQueryTokens.length >= 3) {
    const matchedTokens = allQueryTokens.filter(t => nameLower.includes(t));
    const overlapRatio = matchedTokens.length / allQueryTokens.length;
    // Require at least 60% token overlap for longer queries
    if (overlapRatio < 0.6) {
      return false;
    }
  }

  return true;
};

/**
 * Calculate a Trust Score (0-100) for a product based on:
 *   - Seller/product rating (40%)
 *   - Review count (30%)
 *   - Price deviation from average (30%)
 *
 * @param {Object} product - Product data
 * @param {number} averagePrice - Average price across all results
 * @returns {number} Trust score 0-100
 */
const calculateTrustScore = (product, averagePrice) => {
  // 1. Rating score (0-40): Higher rating = more trust
  const rating = product.rating || 0;
  const ratingScore = Math.min(40, (rating / 5) * 40);

  // 2. Review count score (0-30): More reviews = more trust
  const reviewCount = product.reviewCount || 0;
  let reviewScore;
  if (reviewCount >= 100) reviewScore = 30;
  else if (reviewCount >= 50) reviewScore = 25;
  else if (reviewCount >= 20) reviewScore = 20;
  else if (reviewCount >= 5) reviewScore = 12;
  else reviewScore = 3;

  // 3. Price deviation score (0-30): Prices too far from average are suspicious
  let priceScore = 15; // Default: neutral
  if (averagePrice > 0 && product.price > 0) {
    const deviation = (product.price - averagePrice) / averagePrice;
    if (deviation >= -0.15 && deviation <= 0.15) {
      priceScore = 30; // Price is close to average — good
    } else if (deviation >= -0.30 && deviation <= 0.30) {
      priceScore = 22; // Moderate deviation
    } else if (deviation < -0.30) {
      priceScore = 5;  // Way too cheap — suspicious
    } else {
      priceScore = 15; // Overpriced but not necessarily fake
    }
  }

  return Math.round(ratingScore + reviewScore + priceScore);
};

/**
 * Check if a product should be flagged as "Caution" (high scam probability).
 * Conditions: price >30% below average AND trust score < 40
 *
 * @param {Object} product - Product with trustScore and price
 * @param {number} averagePrice - Average price
 * @returns {{ isCaution: boolean, reason: string }}
 */
const checkCaution = (product, averagePrice) => {
  if (averagePrice <= 0 || product.price <= 0) {
    return { isCaution: false, reason: '' };
  }

  const priceDeviation = (averagePrice - product.price) / averagePrice;
  const isTooChep = priceDeviation > 0.30;
  const isLowTrust = product.trustScore < 40;

  if (isTooChep && isLowTrust) {
    return {
      isCaution: true,
      reason: `Price is ${Math.round(priceDeviation * 100)}% below average with low trust score (${product.trustScore}/100). High scam probability.`
    };
  }

  if (isTooChep) {
    return {
      isCaution: true,
      reason: `Price is ${Math.round(priceDeviation * 100)}% below average. Exercise caution.`
    };
  }

  return { isCaution: false, reason: '' };
};

/**
 * Main function: Scrape products from multiple platforms concurrently.
 * 
 * @param {string} query - Search term (e.g., "iPhone 15 Pro")
 * @param {string[]} platforms - Array of platform names to search
 * @returns {Object} { products: Array, platformResults: Object }
 */
const scrapeAll = async (query, platforms = ['ebay', 'aliexpress', 'amazon', 'daraz']) => {
  // Normalize query to prevent weird search results from special characters
  // (Inspired by ShopSense's normalize_product_name pattern)
  const normalizedQuery = normalizeQuery(query);
  const searchQuery = normalizedQuery || query; // fallback to raw if normalization blanks it
  console.log(`\n🛒 Starting search for: "${searchQuery}" on [${platforms.join(', ')}]`);

  // Create an array of scraper promises for selected platforms
  const scraperPromises = platforms
    .filter(p => scraperMap[p])
    .map(platform => ({
      platform,
      promise: scraperMap[platform](searchQuery)
    }));

  // Run all scrapers concurrently
  const results = await Promise.allSettled(
    scraperPromises.map(s => s.promise)
  );

  // Collect results and track per-platform stats
  let allProducts = [];
  const platformResults = {};

  results.forEach((result, index) => {
    const platformName = scraperPromises[index].platform;

    if (result.status === 'fulfilled' && result.value.length > 0) {
      platformResults[platformName] = {
        status: 'success',
        count: result.value.length
      };
      allProducts = allProducts.concat(result.value);
    } else {
      platformResults[platformName] = {
        status: 'failed',
        count: 0,
        error: result.reason?.message || 'No products found'
      };
    }
  });

  // ===== DEDUPLICATION =====
  // Remove duplicate products (same name from same platform, or same link).
  // Inspired by ebay-scrapy-scraper's data validation pipeline approach.
  {
    const seen = new Set();
    const beforeDedup = allProducts.length;
    allProducts = allProducts.filter(p => {
      // Deduplicate by link (most reliable)
      const key = p.link && p.link !== '#' ? p.link.split('?')[0] : `${p.platform}::${p.name.toLowerCase().substring(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (allProducts.length < beforeDedup) {
      console.log(`  🔄 Removed ${beforeDedup - allProducts.length} duplicate(s)`);
    }
  }

  // ===== RELEVANCE FILTERING =====
  // Filter out irrelevant products (accessories, cases, etc.)
  const beforeFilter = allProducts.length;
  allProducts = allProducts.filter(p => {
    const relevant = isRelevant(p.name, searchQuery);
    if (!relevant) {
      console.log(`  🚫 Filtered out: "${p.name.substring(0, 60)}" ($${p.price}) [${p.platform}]`);
    }
    return relevant;
  });
  if (allProducts.length < beforeFilter) {
    console.log(`  📊 Relevance filter removed ${beforeFilter - allProducts.length} of ${beforeFilter} products`);
  }

  // ===== PRICE OUTLIER DETECTION =====
  // Remove extreme price outliers that are likely scraping errors
  // (e.g., coupon amounts scraped as product prices).
  // A product priced at <5% of the median is almost certainly wrong.
  if (allProducts.length >= 3) {
    const sortedPrices = allProducts.map(p => p.price).sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    
    if (medianPrice > 0) {
      const beforeCount = allProducts.length;
      allProducts = allProducts.filter(p => {
        const ratio = p.price / medianPrice;
        // Flag products priced at <5% of median as likely scraping errors
        if (ratio < 0.05) {
          console.log(`  ⚠️ Removing price outlier: "${p.name.substring(0, 50)}" at $${p.price} (median: $${medianPrice.toFixed(2)}) — likely coupon/deposit amount`);
          return false;
        }
        return true;
      });
      if (allProducts.length < beforeCount) {
        console.log(`  📊 Removed ${beforeCount - allProducts.length} price outlier(s)`);
      }
    }
  }

  // Calculate average price for trust scoring
  const avgPrice = allProducts.length > 0
    ? allProducts.reduce((sum, p) => sum + p.price, 0) / allProducts.length
    : 0;

  // Add trust scores and caution flags to each product
  allProducts.forEach(product => {
    product.trustScore = calculateTrustScore(product, avgPrice);
    const caution = checkCaution(product, avgPrice);
    product.isCaution = caution.isCaution;
    product.cautionReason = caution.reason;

    // Calculate discount if originalPrice is available
    if (product.originalPrice && product.originalPrice > product.price) {
      product.discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
  });

  // Sort by price ascending (cheapest first)
  allProducts.sort((a, b) => a.price - b.price);

  // Tag "Best Deal" — highest trust-to-value ratio (trust / price)
  // Only consider non-cautioned products for best deal
  const safeCandidates = allProducts.filter(p => !p.isCaution);
  const candidates = safeCandidates.length > 0 ? safeCandidates : allProducts;

  if (candidates.length > 0) {
    let bestIdx = 0;
    let bestRatio = 0;
    candidates.forEach((p, i) => {
      const ratio = p.price > 0 ? p.trustScore / p.price : 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    });
    candidates[bestIdx].isBestDeal = true;
  }

  console.log(`✅ Search complete: ${allProducts.length} total products from ${Object.keys(platformResults).length} platforms\n`);

  return { products: allProducts, platformResults };
};

module.exports = { scrapeAll, isRelevant, calculateTrustScore, checkCaution, normalizeQuery };

