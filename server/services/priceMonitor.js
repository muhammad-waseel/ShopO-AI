/**
 * Price Monitor  (Notification Service, report §10.2)
 * ---------------------------------------------------
 * Cron-driven job that re-checks the price of every active PriceAlert.
 *
 *   Schedule:  PRICE_CHECK_CRON (default every 30 minutes: "*\/30 * * * *")
 *
 * For each alert:
 *   1. Try to read the live price from the product page (priceScraper)
 *   2. If that fails, re-search the platform with the saved query and
 *      take the price of the matching / cheapest product
 *   3. Update currentPrice / lowestPrice
 *   4. If currentPrice <= targetPrice → status = 'triggered',
 *      send email/SMS (services/notifier) and show an in-app notification
 */

const cron = require('node-cron');
const PriceAlert = require('../models/PriceAlert');
const User = require('../models/User');
const notifier = require('./notifier');

let task = null;
let running = false;

/**
 * Fetch the current USD price for an alert. Returns a number or null.
 * Split out (and overridable) so tests can inject a fake price source.
 */
let priceFetcher = async (alert) => {
  const { scrapeProductPagePrice } = require('../scrapers/priceScraper');
  if (alert.productLink && alert.productLink !== '#') {
    try {
      const r = await scrapeProductPagePrice(alert.productLink, alert.platform);
      if (r && r.priceUSD > 0 && r.confidence !== 'low') return r.priceUSD;
    } catch (_) { /* fall through to re-search */ }
  }
  if (alert.query) {
    const { scrapeAll } = require('../scrapers');
    const { products } = await scrapeAll(alert.query, [alert.platform.toLowerCase()]);
    if (products.length) {
      const exact = products.find(p => p.link && alert.productLink && p.link.split('?')[0] === alert.productLink.split('?')[0]);
      if (exact) return exact.price;
      const sameName = products.find(p => p.name.toLowerCase() === alert.productName.toLowerCase());
      if (sameName) return sameName.price;
    }
  }
  return null;
};

const setPriceFetcher = (fn) => { priceFetcher = fn; };

/**
 * Evaluate a single alert against a new price. Exported for unit tests.
 */
const evaluateAlert = async (alert, newPrice) => {
  alert.lastCheckedAt = new Date();
  alert.checkCount += 1;
  if (newPrice == null || !(newPrice > 0)) {
    alert.lastError = 'Could not fetch current price';
    await alert.save();
    return { triggered: false };
  }
  alert.lastError = '';
  alert.currentPrice = Math.round(newPrice * 100) / 100;
  alert.lowestPrice = alert.lowestPrice > 0 ? Math.min(alert.lowestPrice, alert.currentPrice) : alert.currentPrice;

  if (alert.status === 'active' && alert.currentPrice <= alert.targetPrice) {
    alert.status = 'triggered';
    alert.triggeredAt = new Date();
    alert.seen = false;
    const user = await User.findById(alert.user);
    if (user) {
      alert.notificationChannels = await notifier.sendPriceDropNotification(user, alert);
      alert.notified = true;
    }
    await alert.save();
    console.log(`🔔 Alert triggered: "${alert.productName}" now $${alert.currentPrice} (target $${alert.targetPrice})`);
    return { triggered: true };
  }
  await alert.save();
  return { triggered: false };
};

/**
 * Check all active alerts (or only those of one user).
 */
const checkAlerts = async ({ userId = null, alertId = null } = {}) => {
  if (running && !userId && !alertId) return { checked: 0, triggered: 0, skipped: true };
  running = true;
  let checked = 0, triggered = 0;
  try {
    const filter = { status: 'active' };
    if (userId) filter.user = userId;
    if (alertId) filter._id = alertId;
    const alerts = await PriceAlert.find(filter).sort({ lastCheckedAt: 1 }).limit(100);
    for (const alert of alerts) {
      let price = null;
      try {
        price = await priceFetcher(alert);
      } catch (err) {
        console.warn(`⚠️ Price check failed for "${alert.productName}": ${err.message}`);
      }
      const r = await evaluateAlert(alert, price);
      checked += 1;
      if (r.triggered) triggered += 1;
    }
  } finally {
    running = false;
  }
  if (checked) console.log(`⏱️  Price monitor: checked ${checked} alert(s), ${triggered} triggered`);
  return { checked, triggered };
};

const startPriceMonitor = () => {
  if (task || process.env.DISABLE_PRICE_MONITOR === 'true') return;
  const schedule = process.env.PRICE_CHECK_CRON || '*/30 * * * *';
  if (!cron.validate(schedule)) {
    console.warn(`⚠️ Invalid PRICE_CHECK_CRON "${schedule}" — price monitor disabled`);
    return;
  }
  task = cron.schedule(schedule, () => {
    checkAlerts().catch(err => console.error('Price monitor error:', err.message));
  });
  console.log(`⏱️  Price monitor scheduled (${schedule})`);
};

const stopPriceMonitor = () => { if (task) { task.stop(); task = null; } };

module.exports = { startPriceMonitor, stopPriceMonitor, checkAlerts, evaluateAlert, setPriceFetcher };
