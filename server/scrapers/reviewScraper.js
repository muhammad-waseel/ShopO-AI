/**
 * Review Scraper (v2)
 * -------------------
 * Scrapes actual user reviews/comments from individual product pages.
 * Called when the user clicks "AI Analysis" on a specific product.
 *
 * Supports: Amazon, eBay, AliExpress, Daraz
 * Falls back to generic review detection for unknown platforms.
 *
 * v2 Changes (Mar 2026):
 *   - Amazon: Navigates to dedicated /product-reviews/ASIN page (much more reliable)
 *   - AliExpress: Updated selectors for 2025+ layout, better tab activation
 *   - Daraz: Updated selectors for current Lazada-based layout
 *   - eBay: Better feedback/review extraction, broader selectors
 *   - All: Lowered min word count (5→3), added universal fallback,
 *     each scraper handles its own navigation for flexibility
 */

const { getBrowser } = require('./browserPool');

const MAX_REVIEWS = 15;

/**
 * Common seller reply text patterns.
 * Used inside page.evaluate() calls to filter out merchant responses.
 */
const SELLER_REPLY_PATTERNS_SRC = [
  'dear customer', 'dear buyer', 'dear valued', 'dear friend',
  'thank you for your review', 'thank you for your feedback',
  'thanks for your review', 'thanks for your feedback',
  'thank you for purchasing', 'thank you for choosing',
  'thank you for your support', 'thank you for shopping',
  'we are sorry', 'we apologize', 'we are glad', 'we appreciate',
  'please contact us', 'please feel free to contact',
  'please do not hesitate', 'please reach out',
  'our customer service', 'our support team', 'our team will',
  'seller response', 'seller\'s response', 'merchant response',
  'store response', 'official response', 'shop response',
  'if you have any question', 'if you have any problem',
  'if you need any help', 'if there is any issue',
  'we will provide', 'we will send', 'we will replace',
  'we hope you enjoy', 'we hope you like',
  'warranty', 'money back guarantee',
  'kindly contact', 'kindly reach',
];

/**
 * CSS class/attribute patterns that identify seller reply containers.
 * Used inside page.evaluate() to check if an element is a seller reply.
 */
const SELLER_REPLY_SELECTORS = [
  '[class*="reply"]', '[class*="Reply"]',
  '[class*="seller-response"]', '[class*="sellerResponse"]',
  '[class*="seller-reply"]', '[class*="sellerReply"]',
  '[class*="merchant-response"]', '[class*="merchantResponse"]',
  '[class*="store-response"]', '[class*="storeResponse"]',
  '[class*="shop-response"]', '[class*="shopResponse"]',
  '[class*="official-response"]', '[class*="officialResponse"]',
  '[class*="vendor-response"]', '[class*="vendorResponse"]',
  '[class*="brand-response"]', '[class*="brandResponse"]',
].join(', ');

/**
 * Detect platform from URL
 */
const detectPlatform = (url) => {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (lower.includes('amazon.')) return 'amazon';
  if (lower.includes('ebay.')) return 'ebay';
  if (lower.includes('aliexpress.')) return 'aliexpress';
  if (lower.includes('daraz.')) return 'daraz';
  return 'unknown';
};

/**
 * Scroll the page progressively to trigger lazy-loaded content.
 */
const autoScroll = async (page, sections = 5, delayMs = 1200) => {
  for (let i = 0; i < sections; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, delayMs));
  }
};

/**
 * Scrape reviews from a product page URL.
 *
 * @param {string} productUrl - URL to the product page
 * @param {string} [platformHint] - Optional platform hint
 * @returns {Promise<string[]>} Array of review text strings
 */
const scrapeReviews = async (productUrl, platformHint = '') => {
  if (!productUrl || productUrl === '#') {
    console.log('  📝 [ReviewScraper] No product URL provided');
    return [];
  }

  const platform = platformHint || detectPlatform(productUrl);
  console.log(`  📝 [ReviewScraper] Scraping reviews from ${platform}: ${productUrl.substring(0, 80)}...`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    let reviews = [];

    // Each platform scraper handles its own navigation
    if (platform === 'amazon') {
      reviews = await scrapeAmazonReviews(page, productUrl);
    } else if (platform === 'ebay') {
      reviews = await scrapeEbayReviews(page, productUrl);
    } else if (platform === 'aliexpress') {
      reviews = await scrapeAliExpressReviews(page, productUrl);
    } else if (platform === 'daraz') {
      reviews = await scrapeDarazReviews(page, productUrl);
    } else {
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await autoScroll(page, 6);
      reviews = await scrapeGenericReviews(page);
    }

    // If platform-specific found nothing, try universal fallback on current page
    if (reviews.length === 0) {
      console.log('  🔄 [ReviewScraper] Platform-specific found 0, trying universal fallback...');
      reviews = await universalReviewFallback(page);
    }

    console.log(`  ✅ [ReviewScraper] Found ${reviews.length} reviews from ${platform}`);
    return reviews;
  } catch (error) {
    console.error(`  ❌ [ReviewScraper] Error scraping ${platform}:`, error.message);
    return [];
  } finally {
    await page.close();
  }
};

// =====================================================================
//  AMAZON
// =====================================================================
/**
 * Amazon: Navigate to product page with session establishment.
 *
 * Key insight: Amazon blocks direct navigation to product/review pages
 * from non-US IPs (redirects to sign-in or homepage). The product search
 * scraper avoids this by going to the homepage first and searching.
 *
 * We use the same trick: navigate to amazon.com first to establish
 * session cookies, then navigate to the product page. This prevents
 * the geo-redirect.
 *
 * The dedicated /product-reviews/ASIN page is NOT used because it
 * requires Amazon sign-in from non-US locations.
 */
const scrapeAmazonReviews = async (page, productUrl) => {
  // Step 1: Establish Amazon session via homepage (same as search scraper)
  console.log('  📝 [Amazon] Establishing session via homepage...');
  await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Navigate to product page with established session
  console.log('  📝 [Amazon] Navigating to product page...');
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Check for redirect (sign-in, CAPTCHA, homepage bounce)
  const currentUrl = page.url();
  if (currentUrl.includes('/ap/signin') || currentUrl.includes('captcha')) {
    console.log('  ⚠️ [Amazon] Redirected to sign-in/captcha, cannot access product page');
    return [];
  }
  if (currentUrl === 'https://www.amazon.com/' || currentUrl === 'https://www.amazon.com') {
    console.log('  ⚠️ [Amazon] Redirected to homepage, product page not accessible');
    return [];
  }

  // Step 4: Deep scroll to trigger lazy-loading of review section
  // Amazon reviews are far below the fold and load lazily
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1000));
  }
  // Scroll back and down again (some elements only load on second pass)
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 1000));
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 800));
  }

  // Try expanding collapsed review text
  try {
    const expandBtns = await page.$$('[data-hook="expand-collapse"], [data-action="expand"], a[data-hook="review-body"] + span');
    for (const btn of expandBtns.slice(0, 5)) {
      await btn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    }
  } catch (e) { /* ignore */ }

  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    /**
     * Check if an element is inside a seller reply container
     * or if the text matches seller reply patterns.
     */
    const isSellerReply = (el, text) => {
      // Check if this element or any ancestor matches seller reply selectors
      try {
        if (el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      // Check text-based seller reply patterns
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const addText = (text, el) => {
      text = (text || '').trim()
        .replace(/\s+/g, ' ')
        .replace(/Read more$/i, '')
        .replace(/Helpful\s*\(\d+\)/gi, '')
        .replace(/Report$/i, '')
        .replace(/Verified Purchase/gi, '')
        .trim();
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 500) text = text.substring(0, 500);
      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(text);
    };

    // Comprehensive Amazon review selectors (product-reviews page + product page)
    const selectors = [
      // Primary: review body on /product-reviews/ page and product page
      '[data-hook="review-body"] span',
      '[data-hook="review-body"]',
      '.review-text-content span',
      '.review-text span',
      '.cr-original-review-content',
      // Container-scoped selectors
      '#cm-cr-dp-review-list .review-text-content span',
      '#cm_cr-review_list .review-text span',
      '#cm_cr-review_list .review-text-content span',
      // Individual review divs
      'div[id^="customer_review-"] .review-text-content span',
      'div[id^="customer_review-"] [data-hook="review-body"] span',
      'div[id^="review-"] .review-text-content span',
      // Alternative layouts
      '.a-section.review .reviewText span',
      '#customerReviews .review-text span',
      '.review-views .review-text',
      // Review cards on reviews page
      '[data-hook="review"] .review-text-content span',
      '[data-hook="review"] [data-hook="review-body"] span',
      // Top reviews widget
      '#reviewsMedley [data-hook="review-body"] span',
    ];

    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) addText(el.textContent, el);
        });
      } catch (e) { /* selector parse error */ }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

// =====================================================================
//  EBAY
// =====================================================================
/**
 * eBay: Item pages are individual seller listings — they typically have
 * seller feedback rather than product reviews. We scrape both.
 *
 * Some items also have a "Product Reviews" section (for catalog items).
 */
const scrapeEbayReviews = async (page, productUrl) => {
  // Navigate to product/item page
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Check for security/CAPTCHA page
  const title = await page.title();
  if (title.toLowerCase().includes('security') || title.toLowerCase().includes('pardon')) {
    console.log('  ⚠️ [eBay] Blocked by security page');
    return [];
  }

  // Scroll to trigger lazy-loading
  await autoScroll(page, 5, 1500);

  // Try clicking "See all reviews" or review tab links
  try {
    const links = await page.$$('a');
    for (const link of links) {
      const text = await page.evaluate(el => (el.textContent || '').trim().toLowerCase(), link);
      if (text.includes('see all') && (text.includes('review') || text.includes('feedback'))) {
        await link.click();
        await new Promise(r => setTimeout(r, 3000));
        await autoScroll(page, 3, 1000);
        break;
      }
    }
  } catch (e) { /* no link */ }

  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    const noisePatterns = [
      /^by\s+\S+/i,
      /[A-Z][a-z]{2}\s+\d{1,2},?\s*\d{4}/g,
      /Top\s+(favorable|critical)\s+review/gi,
      /Verified\s+purchase/gi,
      /Read\s+more$/i,
      /Helpful\s*\(\d+\)/gi,
      /^\s*(Used|Brand New|New|Pre-Owned)\s*$/gi,
      /More\s+information\s*[-–—]?\s*About\s+this\s+item/gi,
      /About this item/gi,
      /^\s*condition\s*$/gi,
    ];

    const isSellerReply = (el, text) => {
      try {
        if (el && el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const cleanText = (raw) => {
      let text = (raw || '').trim().replace(/\s+/g, ' ');
      for (const pattern of noisePatterns) {
        text = text.replace(pattern, '').trim();
      }
      text = text.replace(/^[\s\-–—:,;]+/, '').replace(/[\s\-–—:,;]+$/, '').trim();
      return text;
    };

    const addText = (text, el) => {
      text = cleanText(text);
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 300) text = text.substring(0, 300);
      const lower = text.toLowerCase();
      for (const existing of found) {
        const existLower = existing.toLowerCase();
        if (existLower.includes(lower) || lower.includes(existLower)) return;
      }
      const key = lower.substring(0, 40);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(text);
    };

    // 1. Product review body selectors (catalog items with reviews)
    const reviewBodySelectors = [
      '[itemprop="reviewBody"]',
      '.reviews--content .review--text',
      '.review-item-content .review-item-text',
      '.rvw-wrap .rvw-text',
      '[data-testid="review-text"]',
      '[data-testid="review-body"]',
    ];
    for (const sel of reviewBodySelectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) addText(el.textContent, el);
        });
      } catch (e) { /* skip */ }
    }

    // 2. Review cards — grab text portion from structured review blocks
    const reviewCardSelectors = [
      '.review-item',
      '[class*="review-item"]',
      '[class*="ReviewCard"]',
      '[class*="reviewCard"]',
      '[class*="rvw-card"]',
    ];
    for (const cardSel of reviewCardSelectors) {
      try {
        document.querySelectorAll(cardSel).forEach(card => {
          if (found.length >= maxReviews) return;
          // Skip seller reply cards
          try {
            if (card.closest(sellerReplySelectors)) return;
          } catch (e) { /* ignore */ }
          const textEl = card.querySelector(
            '[class*="text"], [class*="content"], [class*="body"], [class*="description"], p'
          );
          if (textEl) addText(textEl.textContent, textEl);
        });
      } catch (e) { /* skip */ }
    }

    // 3. Seller feedback comments (buyer feedback only, not seller responses)
    const feedbackSelectors = [
      '.fdbk-container .card__comment > span:first-child',
      '.fdbk-container .card__comment',
      '[data-test-id="fdbk-comment"]',
      '[data-testid="fdbk-comment"]',
      '.feedback-item .comment',
      '[class*="feedback"] [class*="comment"]',
      '[class*="fdbk"] [class*="comment"]',
    ];
    for (const sel of feedbackSelectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) addText(el.textContent, el);
        });
      } catch (e) { /* skip */ }
    }

    // 4. Item description summary (useful as context if no reviews)
    if (found.length === 0) {
      const descSelectors = [
        '#viTabs_0_is .ux-layout__item--id-DESCRIPTION',
        '.x-item-description',
        '[data-testid="item-description"]',
        '#desc_ifr', // iframe — won't work in evaluate, but try anyway
      ];
      for (const sel of descSelectors) {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (found.length < 3) {
              const text = el.textContent.trim();
              if (text.length > 30 && text.length < 500) addText(text, el);
            }
          });
        } catch (e) { /* skip */ }
      }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

// =====================================================================
//  ALIEXPRESS
// =====================================================================
/**
 * AliExpress: Reviews are behind a "Reviews" tab on the product page.
 * The tab must be clicked before reviews appear in the DOM.
 * AliExpress uses hashed CSS class names that change between builds,
 * so we use broader wildcard selectors.
 */
const scrapeAliExpressReviews = async (page, productUrl) => {
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Check for redirect
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('captcha')) {
    console.log('  ⚠️ [AliExpress] Redirected to login/captcha');
    return [];
  }

  // Scroll down to make the review tab visible
  await autoScroll(page, 5, 1200);

  // Try clicking the reviews/feedback tab using multiple approaches
  let tabClicked = false;

  // Approach 1: Find tab with "Review" text
  try {
    const clickResult = await page.evaluate(() => {
      const skipPhrases = ['my review', 'write a review', 'write review', 'login', 'sign in', 'account'];
      const isNavItem = (el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        if (skipPhrases.some(p => text.includes(p))) return true;
        return !!el.closest('header, nav, [class*="header"], [class*="nav"], [class*="account"]');
      };
      
      // Look for tabs/buttons/links containing "Review" or "Feedback"
      const candidates = document.querySelectorAll(
        '[role="tab"], [class*="tab"], [class*="Tab"], a[class*="tab"], div[class*="tab"], ' +
        'span[class*="tab"], button[class*="tab"]'
      );
      for (const el of candidates) {
        if (isNavItem(el)) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        if (text.includes('review') || text.includes('feedback') || text.includes('customer')) {
          el.click();
          return true;
        }
      }
      // Also try any clickable element with review-related text
      const allClickable = document.querySelectorAll('a, button, div[role="button"], span[role="button"]');
      for (const el of allClickable) {
        if (isNavItem(el)) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        if ((text.includes('review') || text.includes('feedback')) &&
            text.length < 50 && !text.includes('write')) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (clickResult) {
      tabClicked = true;
      console.log('  📝 [AliExpress] Clicked review tab');
      await new Promise(r => setTimeout(r, 3000));
      await autoScroll(page, 4, 1000);
    }
  } catch (e) { /* ignore */ }

  // Approach 2: Try Puppeteer handle-based clicking if in-page didn't work
  if (!tabClicked) {
    try {
      const tabs = await page.$$('[role="tab"], [class*="tab"], [class*="Tab"]');
      for (const tab of tabs) {
        const text = await page.evaluate(el => (el.textContent || '').trim().toLowerCase(), tab);
        if (text.includes('review') || text.includes('feedback')) {
          await tab.click();
          tabClicked = true;
          console.log('  📝 [AliExpress] Clicked review tab (handle)');
          await new Promise(r => setTimeout(r, 3000));
          await autoScroll(page, 4, 1000);
          break;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Approach 3: Scroll to bottom of page where reviews might auto-load
  if (!tabClicked) {
    console.log('  📝 [AliExpress] No review tab found, scrolling deep...');
    await autoScroll(page, 10, 1500);
  }

  // Wait a moment for review content to render
  try {
    await page.waitForSelector(
      '[class*="review"], [class*="Review"], [class*="feedback"], [class*="Feedback"]',
      { timeout: 5000 }
    );
  } catch (e) { /* timeout — continue anyway */ }

  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    const isSellerReply = (el, text) => {
      try {
        if (el && el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const addText = (text, el) => {
      text = (text || '').trim().replace(/\s+/g, ' ');
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 500) text = text.substring(0, 500);
      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) return;
      // Also reject near-duplicates
      for (const existing of found) {
        if (existing.toLowerCase().includes(key) || key.includes(existing.toLowerCase().substring(0, 50))) return;
      }
      seen.add(key);
      found.push(text);
    };

    // Comprehensive AliExpress review selectors
    const selectors = [
      // Old layout (still works on some pages)
      '.feedback-item .buyer-feedback span',
      '.buyer-review .buyer-feedback',
      '.feedback-list-wrap .buyer-feedback span',
      // New layout (hashed classes — use wildcard matching)
      '[class*="reviewItem"] [class*="content"]',
      '[class*="ReviewItem"] [class*="content"]',
      '[class*="reviewItem"] [class*="text"]',
      '[class*="review-content"]',
      '[class*="reviewContent"]',
      '[class*="review-text"]',
      '[class*="reviewText"]',
      '[class*="feedback-content"]',
      '[class*="feedbackContent"]',
      // Broader patterns
      '[class*="review"] [class*="content"]',
      '[class*="review"] [class*="text"]',
      '[class*="Review"] [class*="Content"]',
      '[class*="Review"] [class*="Text"]',
      // Try review blocks with paragraphs
      '[class*="review"] p',
      '[class*="Review"] p',
      '[class*="feedback"] p',
      // Evaluation (AliExpress sometimes uses this term)
      '[class*="evaluation"] [class*="content"]',
      '[class*="Evaluation"] [class*="content"]',
    ];

    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) {
            const text = el.textContent;
            // Skip if it looks like a metadata container (stars, dates, usernames)
            if (text && text.length > 15 && text.length < 1000) {
              addText(text, el);
            }
          }
        });
      } catch (e) { /* selector parse error */ }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

// =====================================================================
//  DARAZ
// =====================================================================
/**
 * Daraz: Lazada-based platform. Reviews are behind a "Ratings & Reviews" tab.
 * Uses React — the tab click must trigger state update, then review content loads.
 */
const scrapeDarazReviews = async (page, productUrl) => {
  // Daraz is React-based — use networkidle2 to wait for dynamic content
  await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Check if we got redirected to catalog/search (invalid URL)
  const currentUrl = page.url();
  if (currentUrl.includes('/catalog/') || currentUrl.includes('q=')) {
    console.log('  ⚠️ [Daraz] Redirected to catalog/search — product URL may be invalid');
    // Don't return yet — the catalog page might have some review snippets
  }

  // Scroll to make the review tab visible
  await autoScroll(page, 5, 1200);

  // Try clicking review tab using multiple approaches
  let tabClicked = false;

  // Approach 1: Use page.evaluate to find and click tab
  try {
    const clickResult = await page.evaluate(() => {
      // Words that indicate account/nav menu items (NOT product review tabs)
      const skipPhrases = ['my review', 'write a review', 'write review', 'login', 'sign in', 'sign up', 'account'];
      
      const isNavItem = (el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        if (skipPhrases.some(p => text.includes(p))) return true;
        // Skip if inside header/nav/account areas
        const parent = el.closest('header, nav, [class*="header"], [class*="nav"], [class*="account"], [class*="Header"], [class*="Nav"]');
        return !!parent;
      };
      
      // Daraz-specific tab selectors
      const tabSelectors = ['.pdp-tab-item', '.tab-item', '[class*="pdp-tab"]', '[class*="tab-item"]', '[role="tab"]', '[class*="Tab"]'];
      for (const sel of tabSelectors) {
        const tabs = document.querySelectorAll(sel);
        for (const tab of tabs) {
          if (isNavItem(tab)) continue;
          const text = (tab.textContent || '').trim().toLowerCase();
          if (text.includes('review') || text.includes('rating')) {
            tab.click();
            return true;
          }
        }
      }
      // Broader: any clickable element mentioning reviews (but NOT in nav/header)
      const allClickable = document.querySelectorAll('a, button, div[role="button"], span[class*="tab"]');
      for (const el of allClickable) {
        if (isNavItem(el)) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        if ((text.includes('review') || text.includes('rating')) && text.length < 50) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (clickResult) {
      tabClicked = true;
      console.log('  📝 [Daraz] Clicked review tab');
      await new Promise(r => setTimeout(r, 3000));
      await autoScroll(page, 3, 1000);
    }
  } catch (e) { /* ignore */ }

  // Approach 2: Puppeteer handle-based
  if (!tabClicked) {
    try {
      const tabs = await page.$$('.pdp-tab-item, [class*="tab"], [role="tab"]');
      for (const tab of tabs) {
        const text = await page.evaluate(el => (el.textContent || '').trim().toLowerCase(), tab);
        if (text.includes('review') || text.includes('rating')) {
          await tab.click();
          tabClicked = true;
          console.log('  📝 [Daraz] Clicked review tab (handle)');
          await new Promise(r => setTimeout(r, 3000));
          await autoScroll(page, 3, 1000);
          break;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // If no tab found, just scroll deep
  if (!tabClicked) {
    console.log('  📝 [Daraz] No review tab found, scrolling deep...');
    await autoScroll(page, 10, 1200);
  }

  // Wait for review content to potentially appear
  try {
    await page.waitForSelector(
      '.review-content-sl, [class*="review"], .mod-reviews, [class*="Review"]',
      { timeout: 5000 }
    );
  } catch (e) { /* timeout — continue */ }

  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    const isSellerReply = (el, text) => {
      try {
        if (el && el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const addText = (text, el) => {
      text = (text || '').trim().replace(/\s+/g, ' ');
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 500) text = text.substring(0, 500);
      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(text);
    };
    const selectors = [
      // Primary Daraz selectors
      '.review-content-sl',
      '.item-content .content',
      '.pdp-review-item .content',
      '.mod-reviews .item-content',
      '.mod-reviews .review-content',
      // Alternative class patterns
      '[class*="review-content"]',
      '[class*="reviewContent"]',
      '[class*="review-text"]',
      '[class*="reviewText"]',
      '[class*="review-body"]',
      '[class*="reviewBody"]',
      // Lazada-based patterns
      '.pdp-block__body .review',
      '.pdp-review-list .review-content',
      '.pdp-review .content',
      // Broader wildcard
      '[class*="review"] .content',
      '[class*="review"] .text',
      '[class*="Review"] .content',
      '[class*="Review"] p',
      // Review items
      '.review-item .content',
      '.review-item .review-text',
      '[class*="reviewItem"] [class*="content"]',
    ];

    // Daraz-specific: also explicitly skip seller reply containers
    const darazReplySelectors = [
      '.reply-content', '.reply-content-sl', '.seller-reply',
      '[class*="reply"]', '[class*="Reply"]',
      '.pdp-review-item .reply', '.mod-reviews .reply',
    ].join(', ');

    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) {
            // Skip if inside a Daraz reply container
            try {
              if (el.closest(darazReplySelectors)) return;
            } catch (e) { /* ignore */ }
            const text = el.textContent;
            if (text && text.length > 15 && text.length < 1000) {
              addText(text, el);
            }
          }
        });
      } catch (e) { /* selector parse error */ }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

// =====================================================================
//  GENERIC + FALLBACK
// =====================================================================

/**
 * Generic: Try common review selectors (for unknown platforms).
 */
const scrapeGenericReviews = async (page) => {
  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    const isSellerReply = (el, text) => {
      try {
        if (el && el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const addText = (text, el) => {
      text = (text || '').trim().replace(/\s+/g, ' ');
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 500) text = text.substring(0, 500);
      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(text);
    };

    const selectors = [
      '[itemprop="reviewBody"]',
      '[class*="review-text"]',
      '[class*="review-content"]',
      '[class*="review-body"]',
      '[class*="comment-text"]',
      '[class*="feedback-text"]',
      '[class*="reviewText"]',
      '[class*="reviewContent"]',
      '[class*="reviewBody"]',
      '.review p',
      '.comment-content',
      '[class*="review"] p',
      '[class*="Review"] p',
    ];

    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (found.length < maxReviews) addText(el.textContent, el);
        });
      } catch (e) { /* skip */ }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

/**
 * Universal Fallback:
 * When platform-specific selectors find nothing, this tries to find ANY
 * review-like content by looking for elements whose class/id/attributes
 * contain "review", "feedback", or "comment".
 *
 * Filters out navigational/header elements and only keeps actual text
 * content that looks like a user review.
 */
const universalReviewFallback = async (page) => {
  console.log('  🔄 [ReviewScraper] Running universal fallback...');
  return await page.evaluate((maxReviews, sellerReplySelectors, sellerReplyPatterns) => {
    const found = [];
    const seen = new Set();

    const isSellerReply = (el, text) => {
      try {
        if (el && el.closest(sellerReplySelectors)) return true;
      } catch (e) { /* invalid selector */ }
      if (text) {
        const lower = text.toLowerCase();
        for (const pattern of sellerReplyPatterns) {
          if (lower.startsWith(pattern) || lower.includes(pattern)) return true;
        }
      }
      return false;
    };

    const addText = (text, el) => {
      text = (text || '').trim().replace(/\s+/g, ' ');
      if (text.length < 15 || text.split(' ').length < 3) return;
      if (isSellerReply(el, text)) return;
      if (text.length > 500) text = text.substring(0, 500);

      // Skip obvious non-review text
      const lower = text.toLowerCase();
      if (lower.includes('write a review') || lower.includes('write review')) return;
      if (lower.includes('see all review') || lower.includes('view all review')) return;
      if (lower.includes('customer review') && text.length < 30) return;
      if (lower.includes('sort by') || lower.includes('filter by')) return;
      if (lower.includes('sign in') || lower.includes('log in')) return;
      if (lower.includes('add to cart') || lower.includes('buy now')) return;

      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      found.push(text);
    };

    // Find any element with review/feedback/comment in class or id
    const containers = document.querySelectorAll(
      '[class*="review"], [class*="Review"], [class*="feedback"], [class*="Feedback"], ' +
      '[class*="comment"], [class*="Comment"], [id*="review"], [id*="Review"], ' +
      '[class*="testimonial"], [class*="Testimonial"]'
    );

    for (const el of containers) {
      if (found.length >= maxReviews) break;

      const text = (el.textContent || '').trim();

      // Skip containers that are too large (likely wrapper divs) or too small
      if (text.length > 800 || text.length < 15) continue;

      // Skip if element has many children (likely a container, not a leaf)
      if (el.children.length > 10) continue;

      // Skip seller reply containers
      try {
        if (el.closest(sellerReplySelectors)) continue;
      } catch (e) { /* ignore */ }

      addText(text, el);
    }

    // Second pass: look for <p> tags inside any review-related parent
    if (found.length === 0) {
      const reviewParents = document.querySelectorAll(
        '[class*="review"], [class*="Review"], [class*="feedback"], [class*="Feedback"]'
      );
      for (const parent of reviewParents) {
        if (found.length >= maxReviews) break;
        const paragraphs = parent.querySelectorAll('p, span, div');
        for (const p of paragraphs) {
          if (found.length >= maxReviews) break;
          const text = (p.textContent || '').trim();
          if (text.length >= 20 && text.length <= 500 && p.children.length <= 3) {
            addText(text, p);
          }
        }
      }
    }

    return found;
  }, MAX_REVIEWS, SELLER_REPLY_SELECTORS, SELLER_REPLY_PATTERNS_SRC);
};

module.exports = { scrapeReviews, detectPlatform };
