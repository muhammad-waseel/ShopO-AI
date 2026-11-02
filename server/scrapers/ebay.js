/**
 * eBay Scraper (Browser-based)
 * ----------------------------
 * Scrapes product listings from eBay using a real browser.
 * 
 * Strategy: Open browser → Go to eBay homepage → Type query in search box
 *           → Press Enter → Wait for results → Extract from DOM
 * 
 * Going to the homepage first and typing the search avoids CAPTCHA
 * that eBay triggers when you hit the search URL directly.
 */

const { getBrowser } = require('./browserPool');

const MAX_PRODUCTS = 8;

/**
 * Scrape eBay using browser — type-and-search approach.
 */
const scrapeEbay = async (query) => {
  console.log(`🔍 [eBay] Opening browser for: "${query}"`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Go to eBay homepage (avoids CAPTCHA from direct search URL)
    await page.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Type search query in search box and submit
    await page.waitForSelector('#gh-ac', { timeout: 10000 });
    await page.click('#gh-ac');            // Click the search input
    await page.type('#gh-ac', query, { delay: 80 }); // Type slowly (human-like)
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('Enter');    // Submit search

    // Step 3: Wait for search results page to load
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Check if we got blocked
    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('security') || pageTitle.toLowerCase().includes('pardon')) {
      console.log(`  [eBay] Blocked: "${pageTitle}"`);
      return [];
    }

    // Step 4: Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1000));

    // Step 5: Extract products from DOM
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    const products = await page.evaluate((maxProducts, queryWords) => {
      const items = [];

      // === In-browser relevance helpers ===
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
        'ring', 'kickstand', 'dock', 'wrap', 'wraps', 'lanyard',
        'replacement part', 'spare part', 'lens protector', 'camera protector'
      ];

      const isAccessory = (name) => {
        const lower = name.toLowerCase();
        // Check "for [product]" pattern — accessory described as being FOR a product
        const forMatch = lower.match(/^(.+?)\bfor\b\s+(.+)/);
        if (forMatch) {
          const beforeFor = forMatch[1].trim();
          const afterFor = forMatch[2].trim();
          const sigWords = queryWords.filter(w => w.length >= 3);
          const afterHasQuery = sigWords.some(w => afterFor.includes(w));
          const beforeHasQuery = sigWords.some(w => beforeFor.includes(w));
          if (afterHasQuery && !beforeHasQuery) return true;
        }
        // Check accessory keywords (word boundaries)
        for (const kw of ACCESSORY_WORDS) {
          const regex = new RegExp('\\b' + kw + '\\b', 'i');
          if (regex.test(lower)) return true;
        }
        return false;
      };

      const isRelevant = (name) => {
        const lower = name.toLowerCase();
        // ALL significant query words (3+ chars, non-numeric) must appear
        const sigWords = queryWords.filter(w => w.length >= 3 && !/^\d+$/.test(w));
        if (sigWords.length > 0) {
          const matched = sigWords.filter(w => lower.includes(w)).length;
          const minRequired = sigWords.length <= 2 ? sigWords.length : sigWords.length - 1;
          if (matched < minRequired) return false;
        }
        // Numeric query terms must also appear
        const nums = queryWords.filter(w => /^\d+$/.test(w));
        if (nums.length > 0) {
          const hasNum = nums.some(n => lower.includes(n));
          if (!hasNum) return false;
        }
        return true;
      };

      // Strategy 1: New eBay layout (2025+) — li[id^="item"] with .s-card
      const newCards = document.querySelectorAll('li[id^="item"]');
      if (newCards.length > 0) {
        for (const card of newCards) {
          if (items.length >= maxProducts) break;

          // Skip sponsored/ad results (from ebay-scrapy-scraper pattern)
          const linkEls = card.querySelectorAll('a');
          let isSponsored = false;
          for (const a of linkEls) {
            const href = a.href || '';
            if (href.includes('/slredirect/') || href.includes('ebay.com/e/') || href.includes('pulsar.ebay.')) {
              isSponsored = true;
              break;
            }
          }
          if (isSponsored) continue;
          const cardText = (card.innerText || '').toLowerCase();
          if (cardText.includes('sponsored') && cardText.indexOf('sponsored') < 50) continue;

          const titleEl = card.querySelector('.s-card__title, [class*="card__title"]');
          const subtitleEl = card.querySelector('.s-card__subtitle, [class*="card__subtitle"]');
          const priceEl = card.querySelector('.s-card__price, [class*="card__price"]');
          const imgEl = card.querySelector('img');
          const linkEl = card.querySelector('a');

          let name = titleEl ? titleEl.textContent.trim() : '';
          const subtitle = subtitleEl ? subtitleEl.textContent.trim() : '';
          
          // Clean up junk text eBay appends to titles
          name = name.replace(/Opens in a new window or tab/gi, '').replace(/^New Listing/i, '').trim();
          const cleanSub = subtitle.replace(/Opens in a new window or tab/gi, '').replace(/^New Listing/i, '').trim();
          // Only append subtitle if it adds meaningful new info (not mostly repeating the title)
          const titleWords = new Set(name.toLowerCase().split(/\s+/));
          const subWords = cleanSub.toLowerCase().split(/\s+/);
          const newWords = subWords.filter(w => w.length > 2 && !titleWords.has(w));
          const fullName = (cleanSub && newWords.length > subWords.length * 0.3) ? (name + ' ' + cleanSub).trim() : name;
          const priceText = priceEl ? priceEl.textContent.trim() : '';
          const image = imgEl ? imgEl.src : '';
          const link = linkEl ? linkEl.href : '';

          if (!name || !priceText) continue;

          // Filter out accessories and irrelevant products
          if (!isRelevant(fullName) || isAccessory(fullName)) continue;

          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

          if (price > 0) {
            // Extract condition info (from ebay-scrapy-scraper's condition standardization)
            let condition = 'Unknown';
            const conditionEl = card.querySelector('[class*="condition"], [class*="SECONDARY_INFO"]');
            const condText = conditionEl ? conditionEl.textContent.trim().toLowerCase() : cardText;
            if (condText.includes('brand new') || condText.includes('new (other)') || condText.match(/\bnew\b/)) condition = 'New';
            else if (condText.includes('refurbished') || condText.includes('renewed')) condition = 'Refurbished';
            else if (condText.includes('pre-owned') || condText.includes('used')) condition = 'Used';
            else if (condText.includes('open box')) condition = 'Open Box';
            else if (condText.includes('for parts')) condition = 'For Parts';

            // Extract seller feedback if available
            let sellerRating = 0;
            const feedbackEl = card.querySelector('[class*="seller"], [class*="feedback"]');
            if (feedbackEl) {
              const fbMatch = feedbackEl.textContent.match(/(\d+\.?\d*)%/);
              if (fbMatch) sellerRating = parseFloat(fbMatch[1]);
            }

            items.push({ name: fullName, price, image, link, condition, sellerRating });
          }
        }
      }

      // Strategy 2: Old eBay layout fallback (.s-item)
      if (items.length === 0) {
        const oldCards = document.querySelectorAll('.s-item');
        for (const el of oldCards) {
          if (items.length >= maxProducts) break;

          const nameEl = el.querySelector('.s-item__title');
          const priceEl = el.querySelector('.s-item__price');
          const imgEl = el.querySelector('.s-item__image-img');
          const linkEl = el.querySelector('.s-item__link');

          let name = nameEl ? nameEl.textContent.trim() : '';
          name = name.replace(/Opens in a new window or tab/gi, '').replace(/^New Listing/i, '').trim();
          const priceText = priceEl ? priceEl.textContent.trim() : '';
          const image = imgEl ? imgEl.src : '';
          const link = linkEl ? linkEl.href : '';

          if (!name || name === 'Shop on eBay' || !priceText) continue;

          // Filter out accessories and irrelevant products
          if (!isRelevant(name) || isAccessory(name)) continue;

          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

          if (price > 0) {
            items.push({ name, price, image, link });
          }
        }
      }

      // Strategy 3: Generic fallback — grab all visible product-like cards
      if (items.length === 0) {
        const allCards = document.querySelectorAll('[class*="srp-results"] li, [class*="search-results"] li');
        for (const card of allCards) {
          if (items.length >= maxProducts) break;
          const text = card.innerText || '';
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) continue;

          const name = lines[0];
          let priceText = '';
          for (const line of lines) {
            if (line.includes('$') || line.includes('USD')) {
              priceText = line;
              break;
            }
          }
          const priceMatch = priceText.match(/[\d,]+\.?\d*/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

          const imgEl = card.querySelector('img');
          const linkEl = card.querySelector('a');

          if (name && price > 0) {
            // Filter out accessories and irrelevant products
            if (isRelevant(name) && !isAccessory(name)) {
              items.push({
                name,
                price,
                image: imgEl ? imgEl.src : '',
                link: linkEl ? linkEl.href : ''
              });
            }
          }
        }
      }

      return items;
    }, MAX_PRODUCTS, queryWords);

    const result = products.map(p => ({
      ...p,
      displayPrice: `$${p.price.toFixed(2)}`,
      platform: 'eBay',
      rating: 0,
      reviewCount: 0,
      sellerRating: p.sellerRating || 0,
      condition: p.condition || 'Unknown'
    }));

    console.log(`✅ [eBay] Found ${result.length} products`);
    return result;

  } catch (error) {
    console.error(`❌ [eBay] Error:`, error.message);
    return [];
  } finally {
    await page.close();
  }
};

module.exports = scrapeEbay;
