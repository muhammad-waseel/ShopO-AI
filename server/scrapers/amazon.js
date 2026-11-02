/**
 * Amazon Scraper (Browser-based)
 * --------------
 * Scrapes product listings from Amazon.com using a real browser.
 * Direct port of the Flask app's Selenium approach to Puppeteer.
 * 
 * Strategy: Open browser → Go to Amazon → Type query → Submit → Extract
 * 
 * Amazon auto-detects location (Pakistan → PKR prices).
 * We detect the currency and format accordingly.
 */

const { getBrowser } = require('./browserPool');
const { getRate } = require('../config/exchangeRate');

const MAX_PRODUCTS = 8;

/**
 * Scrape Amazon using browser (type-and-search like Flask approach).
 */
const scrapeAmazon = async (query) => {
  console.log(`🔍 [Amazon] Opening browser for: "${query}"`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Go to Amazon homepage first (like Flask) to establish session
    await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Type search query in search box and submit (human-like)
    const searchInput = await page.$('#twotabsearchtextbox');
    if (searchInput) {
      await searchInput.click();
      await searchInput.type(query, { delay: 80 });
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.press('Enter');
    } else {
      // Fallback: navigate directly to search URL
      const formattedQuery = query.replace(/ /g, '+');
      await page.goto(`https://www.amazon.com/s?k=${formattedQuery}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Wait for results page
    await new Promise(r => setTimeout(r, 5000));

    // Check for CAPTCHA
    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('robot') || pageTitle.toLowerCase().includes('sorry')) {
      console.log(`  [Amazon] CAPTCHA detected: "${pageTitle}". Waiting...`);
      try {
        await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 20000 });
      } catch (e) {
        console.log(`  [Amazon] CAPTCHA did not resolve`);
        return [];
      }
    }

    // Check for "Something went wrong" and refresh (same as Flask)
    const content = await page.content();
    if (content.includes('Something went wrong')) {
      console.log(`  [Amazon] "Something went wrong" — refreshing...`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 5000));
    }

    // Wait for search results
    await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 15000 }).catch(() => { });

    // Scroll to load more
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 1000));

    // Extract products — pass query words so we can filter in-browser
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    const products = await page.evaluate((maxProducts, queryWords) => {
      const items = [];
      const results = document.querySelectorAll('[data-component-type="s-search-result"]');

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

      for (const el of results) {
        if (items.length >= maxProducts) break;

        try {
          // Skip sponsored / ad results — enhanced filtering
          // Check for sponsored markup
          const sponsoredEl = el.querySelector('[data-component-type="sp-sponsored-result"], .puis-label-popover-default, .s-label-popover-default');
          const elText = el.innerText || '';
          if (sponsoredEl || elText.toLowerCase().includes('sponsored')) continue;
          // Check for ad redirect links (pattern from ebay-scrapy-scraper)
          const adLink = el.querySelector('a[href*="/slredirect"], a[href*="aax-us-iad"], a[href*="/gp/slredirect"]');
          if (adLink) continue;

          // Get product name — try multiple approaches since Amazon layout varies
          const titleLink = el.querySelector('h2 a, h2 .a-link-normal');
          const h2 = el.querySelector('h2');
          let name = '';

          // 1. Try the span inside the title link (most reliable for full name)
          if (titleLink) {
            const titleSpan = titleLink.querySelector('span.a-text-normal, span.a-size-base-plus, span.a-size-medium, span');
            if (titleSpan) {
              name = titleSpan.textContent.trim();
            }
            // 2. Fallback to full link text if span gave us nothing or just a brand
            if (!name || name.split(' ').length <= 2) {
              name = titleLink.textContent.trim();
            }
          }
          // 3. Try aria-label on the link container (Amazon sometimes puts full name here)
          if ((!name || name.split(' ').length <= 2) && titleLink) {
            const ariaLabel = titleLink.getAttribute('aria-label') || '';
            if (ariaLabel.length > name.length) name = ariaLabel;
          }
          // 4. Fallback to h2 text
          if ((!name || name.split(' ').length <= 2) && h2) {
            const h2Text = h2.textContent.trim();
            if (h2Text.length > name.length) name = h2Text;
          }
          // 5. Last resort: title attribute on the image  
          if (!name || name.split(' ').length <= 2) {
            const imgEl = el.querySelector('.s-image');
            const imgAlt = imgEl ? (imgEl.getAttribute('alt') || '') : '';
            if (imgAlt.length > name.length) name = imgAlt;
          }

          if (!name) continue;

          // In-browser relevance check: product name must contain ALL significant
          // query words (not just one) and must NOT be an accessory
          const nameLower = name.toLowerCase();
          const significantWords = queryWords.filter(w => w.length >= 3 && !/^\\d+$/.test(w));
          if (significantWords.length > 0) {
            const matchCount = significantWords.filter(w => nameLower.includes(w)).length;
            const minRequired = significantWords.length <= 2 ? significantWords.length : significantWords.length - 1;
            if (matchCount < minRequired) continue;
          }
          // Check numeric query terms exist too (model numbers like "15")
          const queryNums = queryWords.filter(w => /^\\d+$/.test(w));
          if (queryNums.length > 0) {
            const hasNum = queryNums.some(n => nameLower.includes(n));
            if (!hasNum) continue;
          }
          // Reject accessories
          if (isAccessory(name)) continue;

          // Get price info (Amazon may show PKR or USD depending on location)
          let price = 0;
          let currencySymbol = '';

          const priceSymbolEl = el.querySelector('.a-price-symbol');
          currencySymbol = priceSymbolEl ? priceSymbolEl.textContent.trim() : '';

          const wholeEl = el.querySelector('.a-price-whole');
          const fractionEl = el.querySelector('.a-price-fraction');

          if (wholeEl) {
            const whole = wholeEl.textContent.replace(/[,\.]/g, '');
            const fraction = fractionEl ? fractionEl.textContent : '00';
            price = parseFloat(whole + '.' + fraction) || 0;
          }

          // Image
          const imgEl = el.querySelector('.s-image');
          const image = imgEl ? imgEl.src : '';

          // Link
          const linkEl = el.querySelector('h2 a') || el.querySelector('a.a-link-normal');
          const link = linkEl ? linkEl.href : '#';

          // Rating
          const ratingEl = el.querySelector('.a-icon-star-small .a-icon-alt, [data-cy="reviews-ratings-count"]');
          const ratingText = ratingEl ? ratingEl.textContent : '';
          const ratingMatch = ratingText.match(/([\d.]+)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

          // Review count
          const reviewEl = el.querySelector('[aria-label*="stars"] + span, .a-size-base.s-underline-text');
          const reviewText = reviewEl ? reviewEl.textContent.trim() : '';
          const reviewMatch = reviewText.match(/([\d,]+)/);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

          if (name && price > 0) {
            items.push({ name, price, currencySymbol, image, link, rating, reviewCount });
          }
        } catch (e) {
          continue;
        }
      }
      return items;
    }, MAX_PRODUCTS, queryWords);

    // Get exchange rate for PKR→USD conversion
    const pkrRate = getRate('USD', 'PKR');

    const result = products.map(p => {
      // Detect and convert PKR prices to USD
      const isPKR = p.currencySymbol.includes('PKR') || p.currencySymbol.includes('Rs');
      let priceUSD = p.price;
      
      if (isPKR && pkrRate > 0) {
        priceUSD = p.price / pkrRate;
        priceUSD = Math.round(priceUSD * 100) / 100; // round to 2 decimal places
      }

      const displayPrice = isPKR
        ? `$${priceUSD.toFixed(2)} (Rs. ${Math.round(p.price).toLocaleString()})`
        : `$${priceUSD.toFixed(2)}`;

      return {
        name: p.name,
        price: priceUSD,
        displayPrice,
        image: p.image,
        link: p.link,
        platform: 'Amazon',
        rating: p.rating,
        reviewCount: p.reviewCount,
        sellerRating: p.rating,
        ...(isPKR ? { originalPricePKR: p.price, exchangeRate: pkrRate } : {})
      };
    });

    console.log(`✅ [Amazon] Found ${result.length} products`);
    return result;

  } catch (error) {
    console.error(`❌ [Amazon] Error:`, error.message);
    return [];
  } finally {
    await page.close();
  }
};

module.exports = scrapeAmazon;
