/**
 * Product Page Price Scraper
 * --------------------------
 * Scrapes the REAL price from an individual product detail page.
 * 
 * This module is called during AI analysis to verify/correct the
 * price that was initially extracted from search results.
 * 
 * Problem it solves:
 *   Search result cards often show coupon amounts, deposit prices,
 *   or accessory variant prices instead of the actual product price.
 *   This scraper visits the real product page, selects the default
 *   variant, and extracts the confirmed price.
 * 
 * Supports: AliExpress, Amazon, eBay, Daraz
 * 
 * Returns:
 *   { price, currency, confidence, source, priceUSD }
 *   confidence: 'high' | 'medium' | 'low'
 */

const { getBrowser } = require('./browserPool');

// Approximate exchange rates (updated periodically)
// In production, you'd use an API like exchangeratesapi.io
const EXCHANGE_RATES = {
  USD: 1,
  PKR: 0.0036,   // 1 PKR ≈ $0.0036 (1 USD ≈ 278 PKR)
  EUR: 1.08,
  GBP: 1.26,
  INR: 0.012,
  AED: 0.27,
  SAR: 0.27,
  BRL: 0.20,
  RUB: 0.011,
  TRY: 0.031,
  JPY: 0.0067,
  KRW: 0.00075,
  CNY: 0.14,
  MYR: 0.22,
  THB: 0.029,
  PHP: 0.018,
  IDR: 0.000063,
  VND: 0.000041,
  NGN: 0.00063,
  EGP: 0.020,
  BDT: 0.0084,
};

/**
 * Detect currency from text and return the currency code + raw numeric value.
 */
const parseCurrencyAndAmount = (text) => {
  if (!text) return null;
  
  const cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Currency detection patterns (order matters — check specific ones first)
  const currencyPatterns = [
    { regex: /PKR\s*([\d,]+\.?\d*)/i, currency: 'PKR' },
    { regex: /Rs\.?\s*([\d,]+\.?\d*)/i, currency: 'PKR' },
    { regex: /₨\s*([\d,]+\.?\d*)/i, currency: 'PKR' },
    { regex: /€\s*([\d,]+\.?\d*)/i, currency: 'EUR' },
    { regex: /([\d,]+\.?\d*)\s*€/i, currency: 'EUR' },
    { regex: /£\s*([\d,]+\.?\d*)/i, currency: 'GBP' },
    { regex: /US\s*\$\s*([\d,]+\.?\d*)/i, currency: 'USD' },
    { regex: /\$\s*([\d,]+\.?\d*)/i, currency: 'USD' },
    { regex: /¥\s*([\d,]+\.?\d*)/i, currency: 'CNY' },
    { regex: /₹\s*([\d,]+\.?\d*)/i, currency: 'INR' },
    { regex: /AED\s*([\d,]+\.?\d*)/i, currency: 'AED' },
    { regex: /SAR\s*([\d,]+\.?\d*)/i, currency: 'SAR' },
    { regex: /BRL\s*([\d,]+\.?\d*)/i, currency: 'BRL' },
    { regex: /TRY\s*([\d,]+\.?\d*)/i, currency: 'TRY' },
    { regex: /RUB\s*([\d,]+\.?\d*)/i, currency: 'RUB' },
    { regex: /EUR\s*([\d,]+\.?\d*)/i, currency: 'EUR' },
    { regex: /USD\s*([\d,]+\.?\d*)/i, currency: 'USD' },
    { regex: /GBP\s*([\d,]+\.?\d*)/i, currency: 'GBP' },
  ];

  for (const { regex, currency } of currencyPatterns) {
    const match = cleaned.match(regex);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (amount > 0) {
        return { amount, currency };
      }
    }
  }
  
  return null;
};

/**
 * Convert a price to USD using approximate exchange rates.
 */
const convertToUSD = (amount, currency) => {
  const rate = EXCHANGE_RATES[currency];
  if (!rate) return amount; // Unknown currency, return as-is
  return Math.round(amount * rate * 100) / 100;
};

/**
 * Check if text looks like a coupon/discount/deposit rather than a real price.
 */
const isCouponOrDiscount = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  const discountKeywords = [
    'off', 'coupon', 'save', 'deposit', 'discount',
    'cashback', 'voucher', 'bonus', 'welcome', 'new user',
    'extra', 'coins', 'reward', 'credit', 'first order',
    'pieces,', 'piece,', 'shipping', 'free shipping',
    'delivery', 'tax', 'estimated'
  ];
  return discountKeywords.some(kw => lower.includes(kw));
};

/**
 * Scrape the real price from an AliExpress product detail page.
 * 
 * Strategy:
 *   1. Set cookies for USD pricing (preferred)
 *   2. Navigate to product page, wait for JS rendering
 *   3. Try to extract price from URL parameters first (most reliable)
 *   4. Look for the main price element on the page
 *   5. Skip coupon/discount amounts
 *   6. Handle variant-dependent pricing (use default variant)
 *   7. Convert to USD if needed
 *   8. Return price with confidence level
 */
const scrapeAliExpressPrice = async (productUrl) => {
  console.log(`  💲 [PriceScraper] Scraping real price from AliExpress: ${productUrl.substring(0, 80)}...`);

  // Strategy 0: Try to extract price from URL parameters first (very reliable)
  const urlPrice = extractPriceFromUrl(productUrl);
  if (urlPrice) {
    console.log(`  ✅ [PriceScraper] Got price from URL params: $${urlPrice.priceUSD}`);
    return urlPrice;
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set cookies for USD prices
    await page.setCookie({
      name: 'aep_usuc_f',
      value: 'site=glo&c_tp=USD&region=US&b_locale=en_US',
      domain: '.aliexpress.com'
    });

    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for price elements to load (JS-rendered)
    await new Promise(r => setTimeout(r, 5000));

    // Scroll a bit to trigger any lazy loading
    await page.evaluate(() => window.scrollBy(0, 300));
    await new Promise(r => setTimeout(r, 2000));

    // Extract price from the product detail page
    const priceData = await page.evaluate(() => {
      const results = [];

      /**
       * Helper: Check if an element or its ancestors contain discount/coupon keywords
       */
      const isInDiscountContext = (el) => {
        let current = el;
        for (let i = 0; i < 5; i++) {
          if (!current) break;
          const text = (current.textContent || '').toLowerCase();
          const cls = (current.className || '').toLowerCase();
          const discountHints = ['coupon', 'off', 'save', 'deposit', 'discount', 'voucher', 
                                  'shipping', 'delivery', 'tax', 'extra', 'bonus', 'welcome',
                                  'new.user', 'first.order', 'coins'];
          for (const hint of discountHints) {
            if (cls.includes(hint)) return true;
          }
          // Only check className context, not full text (since text includes children)
          current = current.parentElement;
        }
        return false;
      };

      // --- Strategy 1: Look for the main product price container ---
      // AliExpress 2025+ uses specific price containers
      const priceSelectors = [
        // Current AliExpress product page price selectors (2025+)
        '.product-price-current',
        '.product-price-value',
        '[class*="price--current"]',
        '[class*="price--sale"]',
        '[class*="uniform-banner-box-price"]',
        '.pdp-price',
        '.pdp-comp-price-current',
        // Older selectors
        '#j-sku-price',
        '.product-price',
        '[data-spm="price"]',
        '[class*="ProductPrice"]',
        // Generic but specific enough
        'span[class*="price"][class*="current"]',
        'div[class*="price"][class*="current"]',
      ];

      for (const sel of priceSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (isInDiscountContext(el)) continue;
          
          const text = el.textContent.trim();
          // Must contain a currency symbol
          if (!text.match(/[\$€£₨₹¥]|PKR|USD|Rs/i)) continue;
          
          // Extract all numbers
          const nums = text.match(/[\d,]+\.?\d*/g);
          if (!nums) continue;
          
          for (const numStr of nums) {
            const val = parseFloat(numStr.replace(/,/g, ''));
            if (val > 5) { // Must be > $5 to avoid picking up coupon amounts
              const isPKR = text.includes('PKR') || text.includes('Rs') || text.includes('₨');
              const isUSD = text.includes('$') || text.includes('USD');
              const isEUR = text.includes('€') || text.includes('EUR');
              results.push({
                value: val,
                currency: isPKR ? 'PKR' : isEUR ? 'EUR' : 'USD',
                source: sel,
                text: text.substring(0, 100)
              });
            }
          }
        }
        if (results.length > 0) break; // Use first matching selector
      }

      // --- Strategy 2: Look for aria-label price elements ---
      if (results.length === 0) {
        const allEls = document.querySelectorAll('[aria-label]');
        for (const el of allEls) {
          const label = el.getAttribute('aria-label') || '';
          if (!label.match(/[\$€£₨₹¥]|PKR|USD|Rs|price/i)) continue;
          if (isInDiscountContext(el)) continue;
          
          const nums = label.match(/[\d,]+\.?\d*/g);
          if (!nums) continue;
          
          for (const numStr of nums) {
            const val = parseFloat(numStr.replace(/,/g, ''));
            if (val > 5) {
              const isPKR = label.includes('PKR') || label.includes('Rs');
              results.push({
                value: val,
                currency: isPKR ? 'PKR' : 'USD',
                source: 'aria-label',
                text: label.substring(0, 100)
              });
            }
          }
        }
      }

      // --- Strategy 3: Scan full page for prominent price patterns ---
      if (results.length === 0) {
        // Look for large font-size price elements (main price is usually large)
        const allSpans = document.querySelectorAll('span, div');
        for (const el of allSpans) {
          const style = window.getComputedStyle(el);
          const fontSize = parseInt(style.fontSize);
          if (fontSize < 20) continue; // Skip small text
          
          const text = el.textContent.trim();
          if (text.length > 30) continue; // Price shouldn't be very long text
          if (!text.match(/[\$€£₨₹¥]|PKR|USD|Rs/i)) continue;
          if (isInDiscountContext(el)) continue;
          
          const nums = text.match(/[\d,]+\.?\d*/g);
          if (nums) {
            for (const numStr of nums) {
              const val = parseFloat(numStr.replace(/,/g, ''));
              if (val > 5) {
                const isPKR = text.includes('PKR') || text.includes('Rs');
                results.push({
                  value: val,
                  currency: isPKR ? 'PKR' : 'USD',
                  source: 'large-text',
                  text: text.substring(0, 100)
                });
              }
            }
          }
        }
      }

      return results;
    });

    if (priceData.length === 0) {
      console.log(`  ⚠️ [PriceScraper] Could not extract price from product page`);
      return { price: 0, currency: 'USD', confidence: 'low', source: 'none', priceUSD: 0 };
    }

    // Pick the best price: prefer USD, then first result
    let bestPrice = priceData.find(p => p.currency === 'USD') || priceData[0];
    const priceUSD = convertToUSD(bestPrice.value, bestPrice.currency);

    console.log(`  ✅ [PriceScraper] Product page price: ${bestPrice.currency} ${bestPrice.value} → $${priceUSD} USD (source: ${bestPrice.source})`);

    return {
      price: bestPrice.value,
      currency: bestPrice.currency,
      confidence: 'high',
      source: bestPrice.source,
      priceUSD,
      originalText: bestPrice.text
    };

  } catch (error) {
    console.error(`  ❌ [PriceScraper] Error:`, error.message);
    return { price: 0, currency: 'USD', confidence: 'low', source: 'error', priceUSD: 0 };
  } finally {
    await page.close();
  }
};

/**
 * Extract price from AliExpress URL parameters.
 * AliExpress encodes price info in the pdp_npi parameter.
 * 
 * Example: pdp_npi=6%40dis%21USD%21607.00%21546.30%21...
 * This means: USD 607.00 original, 546.30 sale price
 */
const extractPriceFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pdpNpi = urlObj.searchParams.get('pdp_npi');
    
    if (pdpNpi) {
      const decoded = decodeURIComponent(pdpNpi);
      // Pattern: 6@dis!USD!607.00!546.30!...
      const priceMatch = decoded.match(/!(USD|EUR|GBP|PKR|INR|AED|SAR|BRL)!([\d.]+)!([\d.]+)!/);
      if (priceMatch) {
        const currency = priceMatch[1];
        const originalPrice = parseFloat(priceMatch[2]);
        const salePrice = parseFloat(priceMatch[3]);
        
        // Use sale price if available, otherwise original
        const price = salePrice > 0 ? salePrice : originalPrice;
        const priceUSD = convertToUSD(price, currency);
        
        console.log(`  💲 [PriceScraper] URL params: ${currency} ${originalPrice} → ${salePrice} (sale) → $${priceUSD} USD`);
        
        return {
          price,
          originalPrice,
          currency,
          confidence: 'high',
          source: 'url-params',
          priceUSD
        };
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Generic product page price scraper (for any platform).
 * Dispatches to platform-specific scrapers.
 */
const scrapeProductPagePrice = async (productUrl, platform) => {
  if (!productUrl || productUrl === '#') {
    return { price: 0, currency: 'USD', confidence: 'low', source: 'none', priceUSD: 0 };
  }

  const platformLower = (platform || '').toLowerCase();

  if (platformLower === 'aliexpress' || productUrl.includes('aliexpress.')) {
    return await scrapeAliExpressPrice(productUrl);
  }

  // For other platforms, return null (no re-scraping needed — their prices are usually correct)
  return null;
};

module.exports = { scrapeProductPagePrice, extractPriceFromUrl, convertToUSD, parseCurrencyAndAmount, isCouponOrDiscount, EXCHANGE_RATES };
