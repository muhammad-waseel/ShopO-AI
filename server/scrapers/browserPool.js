/**
 * Browser Pool Manager
 * --------------------
 * Manages a shared Puppeteer browser instance for scraping.
 * 
 * Like the original Flask app (Selenium), this opens a REAL browser
 * with anti-detection measures. In development mode, the browser
 * is visible (non-headless) so you can see it working — just like
 * how the Flask + Selenium version worked.
 * 
 * Uses puppeteer-extra with stealth plugin to avoid bot detection.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin (same idea as Flask's --disable-blink-features=AutomationControlled)
puppeteer.use(StealthPlugin());

let browser = null;
let idleTimer = null;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// In development: visible browser. In production: headless.
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Get or create a shared Puppeteer browser instance.
 * Opens a visible browser in dev mode (like the Flask app did with Selenium).
 */
const getBrowser = async () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  if (!browser || !browser.isConnected()) {
    console.log(`🌐 Launching browser (${isDev ? 'visible' : 'headless'})...`);
    browser = await puppeteer.launch({
      headless: isDev ? false : 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--lang=en-US,en',
        '--window-size=1280,800',
        '--start-maximized'
      ],
      defaultViewport: null  // Use full window size (like Flask's maximize_window)
    });

    // Hide webdriver property (same as Flask's navigator.webdriver override)
    browser.on('targetcreated', async (target) => {
      try {
        const page = await target.page();
        if (page) {
          await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          });
        }
      } catch (e) { /* target destroyed before page() resolved — safe to ignore */ }
    });
  }

  // Auto-close after 5 minutes of inactivity
  idleTimer = setTimeout(async () => {
    await closeBrowser();
  }, IDLE_TIMEOUT);

  return browser;
};

/**
 * Close the shared browser instance.
 */
const closeBrowser = async () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    try {
      await browser.close();
      console.log('🌐 Browser closed (idle timeout).');
    } catch (e) { /* already closed */ }
    browser = null;
  }
};

module.exports = { getBrowser, closeBrowser };
