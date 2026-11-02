/**
 * Daraz Scraper
 * -------------
 * Scrapes product listings from Daraz.pk.
 *
 * Strategy:
 *   Daraz is a fully Client-Side Rendered (CSR) SPA (Ice.js / Lazada platform).
 *   The initial HTML contains NO product data — products are fetched via mtop APIs
 *   and rendered by React after page load.
 *
 *   Therefore:
 *   1. HTTP scraping is attempted first as a quick check (for JSON-LD or embedded data),
 *      but will almost always return 0 results.
 *   2. PRIMARY: Puppeteer browser — loads the full page, waits for CSR to render
 *      product cards (~20-40 seconds), then extracts from the live DOM.
 *      Functional scripts are NOT blocked (needed for CSR rendering).
 *      Only analytics/tracking scripts, images, fonts, media are blocked.
 *
 * IMPORTANT: Daraz prices are in PKR (Pakistani Rupees).
 * All prices are converted to USD using live exchange rates
 * fetched via the exchangeRate module (with hardcoded fallback).
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { getRate } = require('../config/exchangeRate');

// Daraz needs its own headless browser — the shared browser pool uses visible mode
// in development which is slower and can cause CSR rendering issues.
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const MAX_PRODUCTS = 8;

// Fallback rate in case exchange rate module hasn't loaded
const FALLBACK_PKR_PER_USD = 280;

/**
 * Convert PKR to USD using live exchange rate.
 * Falls back to hardcoded rate if live rate unavailable.
 */
const convertPKRtoUSD = (pkr) => {
  const pkrPerUsd = getRate('USD', 'PKR') || FALLBACK_PKR_PER_USD;
  return Math.round((pkr / pkrPerUsd) * 100) / 100;
};

/**
 * Parse a PKR price string like "Rs. 195,509" or "Rs.195509" → number
 */
const parsePKRPrice = (text) => {
  if (!text) return 0;
  const cleaned = text
    .replace(/Rs\.?/gi, '')
    .replace(/PKR/gi, '')
    .replace(/₨/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
};

/**
 * Parse review count from text like "(3)", "3 Reviews", "(12)"
 */
const parseReviewCount = (text) => {
  if (!text) return 0;
  const match = text.match(/\((\d+)\)|(\d+)\s*review/i);
  return match ? parseInt(match[1] || match[2]) : 0;
};

/**
 * Parse rating from text like "4.5", "4.5 out of 5"
 */
const parseRating = (text) => {
  if (!text) return 0;
  const match = text.match(/([\d.]+)/);
  const val = match ? parseFloat(match[1]) : 0;
  return val > 5 ? 0 : val;
};

/**
 * Check if a product name is relevant to the search query.
 * Requires ALL significant query words AND filters out accessories.
 */
const isRelevant = (name, queryWords) => {
  const nameLower = (name || '').toLowerCase();
  const significantWords = queryWords.filter(w => w.length >= 2);
  if (significantWords.length === 0) return true;
  
  // All words must match
  if (!significantWords.every(w => nameLower.includes(w))) return false;
  
  // Check for accessory keywords
  const ACCESSORY_WORDS = [
    'case', 'cases', 'cover', 'covers', 'protector', 'protectors',
    'screen protector', 'tempered glass', 'cable', 'cables',
    'charger', 'chargers', 'adapter', 'adapters', 'holder', 'holders',
    'stand', 'stands', 'mount', 'mounts', 'sticker', 'stickers',
    'skin', 'skins', 'decal', 'film', 'films', 'pouch', 'sleeve',
    'sleeves', 'earphone', 'earphones', 'headphone', 'headphones',
    'earbud', 'earbuds', 'strap', 'straps', 'band', 'bands',
    'bumper', 'bumpers', 'wallet', 'folio', 'armor', 'shield',
    'shell', 'shells', 'holster', 'grip', 'grips', 'ring', 'wrap'
  ];
  for (const kw of ACCESSORY_WORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(nameLower)) return false;
  }
  
  // Check "for [product]" pattern
  const forMatch = nameLower.match(/^(.+?)\bfor\b\s+(.+)/);
  if (forMatch) {
    const beforeFor = forMatch[1].trim();
    const afterFor = forMatch[2].trim();
    const sigWords = queryWords.filter(w => w.length >= 3);
    const afterHasQuery = sigWords.some(w => afterFor.includes(w));
    const beforeHasQuery = sigWords.some(w => beforeFor.includes(w));
    if (afterHasQuery && !beforeHasQuery) return false;
  }
  
  return true;
};

/**
 * USER-AGENT rotation — use different UAs for retries to avoid fingerprinting.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

/**
 * QUICK ATTEMPT: Scrape Daraz via HTTP (for JSON-LD / embedded script data).
 * Daraz is CSR, so this usually returns 0 results. Kept as a fast first attempt.
 */
const scrapeDarazHttp = async (query) => {
  console.log(`  📡 [Daraz] Quick HTTP check for: "${query}"`);

  const url = `https://www.daraz.pk/catalog/?q=${encodeURIComponent(query)}`;
  let html = null;

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.daraz.pk/',
      }
    });
    html = response.data;
  } catch (err) {
    console.log(`  ⚠️ [Daraz] HTTP failed: ${err.message}`);
    return [];
  }

  if (!html) return [];

  const $ = cheerio.load(html);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

  // Try JSON-LD structured data
  const items = [];
  try {
    $('script[type="application/ld+json"]').each((i, script) => {
      if (items.length >= MAX_PRODUCTS) return false;
      try {
        const data = JSON.parse($(script).html());
        if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement) {
            if (items.length >= MAX_PRODUCTS) break;
            const product = item.item || item;
            if (!product.name || !isRelevant(product.name, queryWords)) continue;
            const offers = product.offers ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) : {};
            const pricePKR = parseFloat(offers.price || offers.lowPrice || 0);
            if (pricePKR < 100) continue;
            items.push({
              name: product.name, pricePKR,
              image: Array.isArray(product.image) ? product.image[0] : (product.image || ''),
              link: (product.url || offers.url || '').startsWith('http') ? (product.url || offers.url) : `https://www.daraz.pk${product.url || offers.url || ''}`,
              rating: product.aggregateRating ? parseFloat(product.aggregateRating.ratingValue || 0) : 0,
              reviewCount: product.aggregateRating ? parseInt(product.aggregateRating.reviewCount || product.aggregateRating.ratingCount || 0) : 0,
            });
          }
        }
      } catch (e) { /* malformed JSON-LD */ }
    });
  } catch (e) { /* no JSON-LD */ }

  if (items.length > 0) {
    console.log(`  ✅ [Daraz] HTTP/JSON-LD found ${items.length} items`);
  } else {
    console.log(`  ℹ️ [Daraz] HTTP returned 0 items (expected — page is CSR)`);
  }
  return items;
};

/**
 * PRIMARY: Scrape Daraz via Puppeteer browser.
 *
 * Daraz is a fully CSR app. The product grid renders ~20-40 seconds after
 * DOMContentLoaded via mtop API calls + React rendering.
 *
 * Key design decisions based on live diagnostics:
 * - DO NOT block functional scripts (CSR needs all JS to render products)
 * - Only block analytics/tracking (google-analytics, facebook, clarity, hotjar, mmstat)
 * - Block images/fonts/media to speed up loading
 * - Wait up to 45s for product cards to appear
 * - Use data-qa-locator="product-item" as primary selector (confirmed in live DOM)
 * - Fallback to a[href*="/products/"] link scanning
 */
const scrapeDarazBrowser = async (query, attempt = 1) => {
  console.log(`  🌐 [Daraz] Browser scrape (attempt ${attempt}) for: "${query}"`);

  // Launch a fresh headless browser for Daraz CSR rendering
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();

  try {
    const ua = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1366, height: 768 });

    // NOTE: Request interception is deliberately DISABLED for Daraz.
    // Daraz is a CSR app that requires all scripts (including some that appear to be
    // tracking) to properly initialize the React/Ice.js framework and render products.
    // Blocking any resources can prevent the product grid from loading.
    // The page will be heavier but will actually render products.

    const searchUrl = `https://www.daraz.pk/catalog/?q=${encodeURIComponent(query)}`;
    console.log(`    Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`    DOMContentLoaded fired — waiting for CSR product rendering...`);

    // Wait for product cards to appear via CSR (up to 45s)
    let cardsFound = false;
    try {
      await page.waitForSelector(
        '[data-qa-locator="product-item"], a[href*="/products/"]',
        { timeout: 45000 }
      );
      cardsFound = true;
      console.log(`    Product elements detected in DOM`);
    } catch (e) {
      console.warn(`    ⚠️ Product elements not found after 45s`);
    }

    // Give extra time for all cards to finish rendering
    if (cardsFound) {
      await new Promise(r => setTimeout(r, 3000));
    } else {
      // Last resort: wait more even if selector didn't fire
      await new Promise(r => setTimeout(r, 10000));
    }

    // Gentle scrolls to trigger lazy-loading of more cards
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Dismiss modals/banners
    try {
      for (const sel of ['[class*="modal"] [class*="close"]', '[aria-label="Close"]', 'button[class*="close"]']) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 500)); break; }
      }
    } catch (e) { /* no modal */ }

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    // Extract products from the rendered DOM
    const products = await page.evaluate((maxProducts, queryWords) => {
      const items = [];
      const seen = new Set();

      const parsePKR = (text) => {
        if (!text) return 0;
        const cleaned = text.replace(/Rs\.?/gi, '').replace(/PKR/gi, '')
          .replace(/₨/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
        const m = cleaned.match(/^(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      };

      const isDiscountText = (text) =>
        ['% off', 'coins save', 'voucher', 'cashback', 'extra', 'sold'].some(k =>
          (text || '').toLowerCase().includes(k));

      const isRelevantName = (name) => {
        const nameLower = name.toLowerCase();
        const sig = queryWords.filter(w => w.length >= 2);
        if (sig.length > 0 && !sig.every(w => nameLower.includes(w))) return false;
        
        // In-browser accessory check
        const accWords = [
          'case', 'cases', 'cover', 'covers', 'protector', 'protectors',
          'screen protector', 'tempered glass', 'cable', 'cables',
          'charger', 'chargers', 'adapter', 'holder', 'stand', 'mount',
          'sticker', 'skin', 'skins', 'decal', 'film', 'pouch', 'sleeve',
          'earphone', 'headphone', 'earbud', 'strap', 'band',
          'bumper', 'wallet', 'folio', 'armor', 'shield', 'shell',
          'holster', 'grip', 'ring', 'wrap', 'lanyard'
        ];
        for (const kw of accWords) {
          const regex = new RegExp('\\b' + kw + '\\b', 'i');
          if (regex.test(nameLower)) return false;
        }
        
        // Check "for [product]" pattern
        const forMatch = nameLower.match(/^(.+?)\bfor\b\s+(.+)/);
        if (forMatch) {
          const beforeFor = forMatch[1].trim();
          const afterFor = forMatch[2].trim();
          const sigWords = queryWords.filter(w => w.length >= 3);
          const afterHasQuery = sigWords.some(w => afterFor.includes(w));
          const beforeHasQuery = sigWords.some(w => beforeFor.includes(w));
          if (afterHasQuery && !beforeHasQuery) return false;
        }
        
        return true;
      };

      // ===== Strategy 1: data-qa-locator="product-item" cards =====
      const cards = document.querySelectorAll('[data-qa-locator="product-item"]');

      for (const card of cards) {
        if (items.length >= maxProducts) break;
        try {
          // Get product link
          const linkEl = card.querySelector('a[href*="/products/"]');
          if (!linkEl) continue;
          const link = linkEl.href;
          if (seen.has(link)) continue;
          seen.add(link);

          // Get all text lines from card
          const allText = card.innerText || '';
          const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
          if (!lines.length) continue;

          // Title: first substantial line that isn't a price/discount/short text
          let name = '';
          for (const line of lines) {
            if (line.match(/^Rs\.?|^₨|^\d+%|^Coins|^Free/i)) continue;
            if (line.length >= 10) { name = line; break; }
          }
          // Fallback: try title-like elements
          if (!name) {
            const titleEl = card.querySelector('[class*="title"], [class*="Title"], [class*="name"], h2, h3');
            if (titleEl) name = titleEl.textContent.trim();
          }
          if (!name || name.length < 5 || !isRelevantName(name)) continue;

          // Price: find PKR price text
          let pricePKR = 0;
          for (const line of lines) {
            if (line.match(/Rs\.?|₨|PKR/i) && !isDiscountText(line)) {
              const v = parsePKR(line);
              if (v >= 100) { pricePKR = v; break; }
            }
          }
          if (!pricePKR) continue;

          // Image
          const imgEl = card.querySelector('img');
          const image = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';

          // Rating and review count from card text
          let rating = 0;
          let reviewCount = 0;
          for (const line of lines) {
            // Match standalone rating like "4.5" or "4.8"
            const rMatch = line.match(/^([\d.]+)$/);
            if (rMatch) {
              const v = parseFloat(rMatch[1]);
              if (v > 0 && v <= 5) { rating = v; continue; }
            }
            // Match review count like "(23)" or "(161)"
            const rcMatch = line.match(/^\((\d+)\)$/);
            if (rcMatch) { reviewCount = parseInt(rcMatch[1]); }
          }

          items.push({ name, pricePKR, image, link, rating, reviewCount });
        } catch (e) { continue; }
      }

      // ===== Strategy 2: Scan product links (fallback if no cards) =====
      if (items.length === 0) {
        for (const a of document.querySelectorAll('a[href*="/products/"]')) {
          if (items.length >= maxProducts) break;
          const href = a.href;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          // Walk up to find the containing card
          const container = a.closest('[data-qa-locator], [data-tracking], [class*="card"], li')
            || a.parentElement?.parentElement?.parentElement;
          if (!container) continue;

          const text = container.innerText || '';
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

          let name = '';
          for (const line of lines) {
            if (line.match(/^Rs\.?|^₨|^\d+%|^Coins|^Free/i)) continue;
            if (line.length >= 10 && isRelevantName(line)) { name = line; break; }
          }
          if (!name) continue;

          let pricePKR = 0;
          for (const line of lines) {
            if (line.match(/Rs\.?|₨|PKR/i) && !isDiscountText(line)) {
              const v = parsePKR(line);
              if (v >= 100) { pricePKR = v; break; }
            }
          }
          if (!pricePKR) continue;

          const img = container.querySelector('img');
          items.push({
            name, pricePKR,
            image: img ? (img.src || '') : '',
            link: href, rating: 0, reviewCount: 0
          });
        }
      }

      return items;
    }, MAX_PRODUCTS, queryWords);

    console.log(`  ✅ [Daraz] Browser found ${products.length} raw items`);
    return products;

  } finally {
    await page.close();
    await browser.close();
  }
};

/**
 * Main entry point: Scrape Daraz products.
 * Tries quick HTTP check first, then browser (primary method).
 * Browser retries once on failure (different UA).
 */
const scrapeDaraz = async (query) => {
  console.log(`🔍 [Daraz] Searching for: "${query}"`);

  let rawProducts = [];

  // --- Quick HTTP check (usually returns 0 for CSR pages) ---
  try {
    rawProducts = await scrapeDarazHttp(query);
  } catch (httpErr) {
    console.log(`  ℹ️ [Daraz] HTTP check failed: ${httpErr.message}`);
  }

  // --- Primary: Puppeteer browser (required for CSR) ---
  if (rawProducts.length === 0) {
    try {
      rawProducts = await scrapeDarazBrowser(query, 1);
    } catch (err1) {
      console.warn(`  ⚠️ [Daraz] Browser attempt 1 failed: ${err1.message}`);

      // Retry once with different UA
      try {
        await new Promise(r => setTimeout(r, 3000));
        rawProducts = await scrapeDarazBrowser(query, 2);
      } catch (err2) {
        const msg = err2.message;
        if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('ECONNRESET')) {
          console.error(`❌ [Daraz] Network unreachable (site may be blocked or down)`);
        } else {
          console.error(`❌ [Daraz] Browser error:`, msg);
        }
        return [];
      }
    }
  }

  if (rawProducts.length === 0) {
    console.log(`⚠️ [Daraz] No products found for "${query}"`);
    return [];
  }

  // --- Convert PKR → USD and build final product objects ---
  const result = rawProducts.map(p => {
    const pricePKR = p.pricePKR || p.price || 0;
    const priceUSD = convertPKRtoUSD(pricePKR);

    return {
      name: p.name,
      price: priceUSD,
      displayPrice: `Rs. ${Math.round(pricePKR).toLocaleString()} (~$${priceUSD.toFixed(0)})`,
      originalPricePKR: pricePKR,
      exchangeRate: `1 USD = ${getRate('USD', 'PKR') || FALLBACK_PKR_PER_USD} PKR`,
      image: (p.image || '').startsWith('//') ? `https:${p.image}` : (p.image || ''),
      link: p.link || '#',
      platform: 'Daraz',
      rating: p.rating || 0,
      reviewCount: p.reviewCount || 0,
      sellerRating: p.rating || 0,
      priceCurrency: 'PKR',
      priceSource: 'search-card'
    };
  });

  console.log(`✅ [Daraz] Found ${result.length} products (prices converted PKR→USD)`);
  return result;
};

module.exports = scrapeDaraz;
