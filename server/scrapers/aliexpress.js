/**
 * AliExpress Scraper (Browser-based)
 * -----------------------------------
 * Scrapes product listings from AliExpress using a real browser.
 * 
 * Strategy: Open browser → Navigate to search URL → Wait → Extract from DOM
 * 
 * AliExpress heavily uses JavaScript rendering so browser-based
 * scraping is the only reliable method.
 * 
 * IMPORTANT: AliExpress search cards often display coupon amounts,
 * deposit prices, or accessory variant prices alongside the real price.
 * This scraper carefully filters out non-product prices to avoid
 * misidentifying a "$15 off" coupon as a "$15" product price.
 * 
 * Prices are converted to USD when possible.
 */

const { getBrowser } = require('./browserPool');
const { extractPriceFromUrl, convertToUSD } = require('./priceScraper');

const MAX_PRODUCTS = 8;

/**
 * Scrape AliExpress using browser.
 * Opens the search page, waits for JS rendering, extracts products.
 */
const scrapeAliExpress = async (query) => {
  console.log(`🔍 [AliExpress] Opening browser for: "${query}"`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set cookies for USD prices and English language
    await page.setCookie({
      name: 'aep_usuc_f',
      value: 'site=glo&c_tp=USD&region=US&b_locale=en_US',
      domain: '.aliexpress.com'
    });

    // Navigate to AliExpress search page
    const url = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Dismiss any login/registration modal that may appear
    try {
      const closeBtn = await page.$('div[class*="modal"] button[class*="close"], div[class*="overlay"] [class*="close"], .comet-modal-close');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) { /* no modal */ }

    // Scroll progressively to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 2000));
    }

    // Extract products from DOM (updated for current AliExpress 2025+ layout)
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    const products = await page.evaluate((maxProducts, queryWords) => {
      const items = [];

      // === In-browser accessory detection ===
      const ACCESSORY_WORDS = [
        'case', 'cases', 'cover', 'covers', 'protector', 'protectors',
        'screen protector', 'tempered glass', 'cable', 'cables',
        'charger', 'chargers', 'adapter', 'adapters', 'holder', 'holders',
        'stand', 'stands', 'mount', 'mounts', 'sticker', 'stickers',
        'skin', 'skins', 'decal', 'decals', 'film', 'films', 'pouch',
        'sleeve', 'sleeves', 'earphone', 'earphones', 'headphone',
        'headphones', 'earbud', 'earbuds', 'strap', 'straps', 'band',
        'bands', 'stylus', 'pen', 'cleaner', 'cloth', 'toolkit', 'repair',
        'bumper', 'bumpers', 'wallet', 'folio', 'armor', 'shield',
        'shell', 'shells', 'holster', 'holsters', 'grip', 'grips',
        'ring', 'kickstand', 'dock', 'wrap', 'wraps', 'lanyard'
      ];

      const isAccessory = (name) => {
        const lower = name.toLowerCase();
        // Check "for [product]" pattern
        const forMatch = lower.match(/^(.+?)\\bfor\\b\\s+(.+)/);
        if (forMatch) {
          const beforeFor = forMatch[1].trim();
          const afterFor = forMatch[2].trim();
          const sigWords = queryWords.filter(w => w.length >= 3);
          const afterHasQuery = sigWords.some(w => afterFor.includes(w));
          const beforeHasQuery = sigWords.some(w => beforeFor.includes(w));
          if (afterHasQuery && !beforeHasQuery) return true;
        }
        for (const kw of ACCESSORY_WORDS) {
          const regex = new RegExp('\\b' + kw + '\\b', 'i');
          if (regex.test(lower)) return true;
        }
        return false;
      };

      // Primary selector: current AliExpress layout uses a.search-card-item
      let cards = document.querySelectorAll('a.search-card-item');

      // Fallback selectors if primary doesn't match
      if (cards.length === 0) {
        cards = document.querySelectorAll(
          'a[href*="/item/"], [class*="search-card-item"], [class*="product-card"]'
        );
      }

      for (const card of cards) {
        if (items.length >= maxProducts) break;

        try {
          // Skip ads/promoted results
          const href = card.href || '';
          if (href.includes('search_p4p_id')) continue;
          const cardText = card.innerText || '';
          if (cardText.toLowerCase().includes('\nad\n') || cardText.toLowerCase().startsWith('ad\n')) continue;

          // Get product name from heading element (title or aria-label attribute)
          const headingEl = card.querySelector('div[role="heading"], [class*="title"], [class*="Title"], h1, h3');
          let name = '';
          if (headingEl) {
            name = headingEl.getAttribute('title')
              || headingEl.getAttribute('aria-label')
              || headingEl.textContent.trim();
          }

          // Fallback: get name from card text
          if (!name) {
            const lines = cardText.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length > 0) name = lines[0];
          }

          if (!name) continue;

          // In-browser relevance check — require ALL significant words + reject accessories
          const nameLower = name.toLowerCase();
          const significantWords = queryWords.filter(w => w.length >= 3 && !/^\\d+$/.test(w));
          if (significantWords.length > 0) {
            const matchCount = significantWords.filter(w => nameLower.includes(w)).length;
            const minRequired = significantWords.length <= 2 ? significantWords.length : significantWords.length - 1;
            if (matchCount < minRequired) continue;
          }
          // Check numeric query terms exist too  
          const queryNums = queryWords.filter(w => /^\\d+$/.test(w));
          if (queryNums.length > 0) {
            const hasNum = queryNums.some(n => nameLower.includes(n));
            if (!hasNum) continue;
          }
          // Reject accessories
          if (isAccessory(name)) continue;

          // Get price — CRITICAL: Must NOT pick up coupon/discount/deposit amounts.
          // AliExpress cards often show "$15 off" coupons, "deposit $X", or
          // "X% off" labels alongside the real price. We must filter these out.
          let price = 0;
          let isPKR = false;
          let originalPrice = 0;

          // Keywords that indicate a coupon/discount/deposit, NOT a real price
          const discountKeywords = [
            'off', 'coupon', 'save', 'deposit', 'discount', 'cashback',
            'voucher', 'bonus', 'welcome', 'new user', 'extra', 'coins',
            'reward', 'credit', 'first order', 'pieces,', 'piece,',
            'shipping', 'free shipping', 'delivery', 'tax'
          ];

          const isDiscountText = (text) => {
            const lower = (text || '').toLowerCase();
            return discountKeywords.some(kw => lower.includes(kw));
          };

          // Strategy 1: Find elements with aria-label containing currency
          // but NOT in a coupon/discount context
          const allEls = card.querySelectorAll('div[aria-label], span[aria-label]');
          for (const el of allEls) {
            const label = el.getAttribute('aria-label') || '';
            // Must contain a currency indicator to be a price
            if (label.match(/PKR|USD|US\s*\$|\$|Rs|€|EUR/i)) {
              // SKIP if this looks like a coupon/discount
              if (isDiscountText(label)) continue;
              // Also check parent context for discount keywords
              const parentText = (el.parentElement?.textContent || '').substring(0, 200);
              if (isDiscountText(parentText)) continue;

              const priceMatch = label.match(/([\d,]+\.?\d*)/);
              if (priceMatch) {
                const val = parseFloat(priceMatch[1].replace(/,/g, ''));
                if (val > 5) { // Filter out tiny numbers (coupon amounts, screen sizes)
                  price = val;
                  isPKR = label.includes('PKR') || label.includes('Rs');
                  break;
                }
              }
            }
          }

          // Strategy 2: Look for price-specific classes, skip discount elements
          if (price === 0) {
            const priceEls = card.querySelectorAll('[class*="price"], [class*="Price"]');
            for (const priceEl of priceEls) {
              const text = priceEl.textContent.trim();
              const cls = (priceEl.className || '').toLowerCase();
              
              // Skip elements that are clearly coupon/discount/original-price
              if (cls.includes('coupon') || cls.includes('off') || cls.includes('discount') ||
                  cls.includes('original') || cls.includes('del') || cls.includes('through')) continue;
              if (isDiscountText(text)) continue;

              // Must contain $ or currency sign to be a valid price
              if (text.match(/\$|PKR|Rs|€|US\s*\$/i)) {
                const allNums = text.match(/[\d,]+\.?\d*/g);
                if (allNums) {
                  // For search cards, take the FIRST reasonable number (current price)
                  // not the largest (which could be original/strikethrough price)
                  for (const numStr of allNums) {
                    const val = parseFloat(numStr.replace(/,/g, ''));
                    if (val > 5) {
                      price = val;
                      isPKR = text.includes('PKR') || text.includes('Rs');
                      break;
                    }
                  }
                  if (price > 0) break;
                }
              }
            }
          }

          // Strategy 3: Full card text scan — find prices with currency context
          // Only look at lines that have currency symbols AND no discount keywords
          if (price === 0) {
            const cardLines = cardText.split('\n').map(l => l.trim()).filter(l => l);
            const priceCandidates = [];
            for (const line of cardLines) {
              if (!line.match(/\$|PKR|Rs|€|US\s*\$/i)) continue;
              if (isDiscountText(line)) continue;
              
              const allPriceMatches = line.match(/[\d,]+\.?\d*/g);
              if (allPriceMatches) {
                for (const m of allPriceMatches) {
                  const val = parseFloat(m.replace(/,/g, ''));
                  if (val > 5) { // Minimum $5 to be a real product price
                    priceCandidates.push(val);
                  }
                }
              }
            }
            // Take the largest candidate (real product price is usually the biggest)
            if (priceCandidates.length > 0) {
              price = Math.max(...priceCandidates);
            }
          }

          // Get image
          const imgEl = card.querySelector('img');
          const image = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';

          // Get link
          const link = card.href || card.querySelector('a')?.href || '';

          // Get rating if available
          const ratingEl = card.querySelector('[class*="star"], [class*="rating"]');
          const ratingText = ratingEl ? ratingEl.textContent.trim() : '';
          const ratingMatch = ratingText.match(/([\d.]+)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

          // Get orders/sold count
          const soldEl = card.querySelector('[class*="sold"], [class*="order"]');
          const soldText = soldEl ? soldEl.textContent.trim() : '';
          const soldMatch = soldText.match(/([\d,]+)/);
          const reviewCount = soldMatch ? parseInt(soldMatch[1].replace(/,/g, '')) : 0;

          if (name && price > 0) {
            items.push({ name, price, isPKR, image, link, rating, reviewCount });
          }
        } catch (e) {
          continue;
        }
      }
      return items;
    }, MAX_PRODUCTS, queryWords);

    const result = products.map(p => {
      let finalPrice = p.price;
      let finalDisplayPrice;

      // Convert PKR to USD for consistent comparison
      if (p.isPKR) {
        // PKR to USD conversion (approximate: 1 USD ≈ 278 PKR)
        const usdPrice = Math.round(p.price * 0.0036 * 100) / 100;
        finalPrice = usdPrice;
        finalDisplayPrice = `$${usdPrice.toFixed(2)}`;
        console.log(`  💱 [AliExpress] Converted PKR ${Math.round(p.price)} → $${usdPrice.toFixed(2)} USD`);
      } else {
        finalDisplayPrice = `$${p.price.toFixed(2)}`;
      }

      // Try to extract price from product link URL parameters (most reliable source)
      if (p.link) {
        try {
          const fullLink = p.link.startsWith('//') ? `https:${p.link}` : p.link;
          const urlPriceData = extractPriceFromUrl(fullLink);
          if (urlPriceData && urlPriceData.priceUSD > 0) {
            // URL price is more reliable than card-scraped price
            // Use it if it's significantly different (the card price might be wrong)
            const urlUSD = urlPriceData.priceUSD;
            if (Math.abs(urlUSD - finalPrice) / Math.max(urlUSD, finalPrice) > 0.3) {
              console.log(`  🔄 [AliExpress] Card price $${finalPrice} differs from URL price $${urlUSD} — using URL price`);
              finalPrice = urlUSD;
              finalDisplayPrice = `$${urlUSD.toFixed(2)}`;
            }
          }
        } catch (e) { /* URL parsing failed — keep card price */ }
      }

      const { isPKR, ...rest } = p; // remove internal flag
      return {
        ...rest,
        price: finalPrice,
        displayPrice: finalDisplayPrice,
        image: p.image.startsWith('//') ? `https:${p.image}` : p.image,
        link: p.link.startsWith('//') ? `https:${p.link}` : p.link,
        platform: 'AliExpress',
        sellerRating: 0,
        priceSource: 'search-card' // Track where price came from
      };
    });

    console.log(`✅ [AliExpress] Found ${result.length} products`);
    return result;

  } catch (error) {
    const msg = error.message;
    if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('TIMEOUT') || msg.includes('ECONNRESET')) {
      console.error(`❌ [AliExpress] Network unreachable (site may be blocked or down)`);
    } else {
      console.error(`❌ [AliExpress] Error:`, msg);
    }
    return [];
  } finally {
    await page.close();
  }
};

module.exports = scrapeAliExpress;
