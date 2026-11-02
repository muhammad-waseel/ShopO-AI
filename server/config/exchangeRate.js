/**
 * Exchange Rate Module
 * --------------------
 * Fetches and caches live currency exchange rates from free APIs.
 * Used primarily by the Daraz scraper to convert PKR → USD.
 *
 * Features:
 *   - Fetches live rates on server startup
 *   - Caches rates in memory (refreshes every 6 hours)
 *   - Falls back to hardcoded rate if all API calls fail
 *   - Two free APIs (no API key required):
 *       1. open.er-api.com (primary)
 *       2. fawazahmed0/currency-api on jsDelivr CDN (secondary)
 *
 * Usage:
 *   const { getRate, initExchangeRates } = require('./config/exchangeRate');
 *   await initExchangeRates(); // call once at startup
 *   const pkrPerUsd = getRate('USD', 'PKR'); // e.g. 280
 */

const axios = require('axios');

// --- Cache ---
const rateCache = {
  rates: {},           // e.g. { 'USD_PKR': 280, 'USD_INR': 83 }
  lastFetched: null,   // Date of last successful fetch
  source: 'fallback'   // Which API provided the current rates
};

// Hardcoded fallback rates (used when all APIs fail)
const FALLBACK_RATES = {
  'USD_PKR': 280,
  'USD_INR': 83,
  'USD_EUR': 0.92,
  'USD_GBP': 0.79
};

const REFRESH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

/**
 * Attempt to fetch rates from open.er-api.com (free, no key required).
 * Returns the full rates object keyed by currency code, or null on failure.
 */
const fetchFromOpenErApi = async () => {
  try {
    const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', {
      timeout: 10000
    });
    if (data && data.result === 'success' && data.rates) {
      return data.rates; // { PKR: 280, INR: 83, EUR: 0.92, ... }
    }
  } catch (err) {
    console.warn(`  ⚠️ [ExchangeRate] open.er-api.com failed: ${err.message}`);
  }
  return null;
};

/**
 * Attempt to fetch rates from fawazahmed0/currency-api on jsDelivr CDN.
 * This is a community-maintained, completely free API with no rate limits.
 */
const fetchFromCdnApi = async () => {
  try {
    const { data } = await axios.get(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      { timeout: 10000 }
    );
    if (data && data.usd) {
      // Convert keys to uppercase to match our format
      const rates = {};
      for (const [key, value] of Object.entries(data.usd)) {
        rates[key.toUpperCase()] = value;
      }
      return rates;
    }
  } catch (err) {
    console.warn(`  ⚠️ [ExchangeRate] CDN currency API failed: ${err.message}`);
  }
  return null;
};

/**
 * Fetch exchange rates from available APIs.
 * Tries primary API first, then secondary, then falls back to hardcoded rates.
 */
const fetchExchangeRates = async () => {
  console.log(`💱 [ExchangeRate] Fetching live exchange rates...`);

  // Try primary API
  let rates = await fetchFromOpenErApi();
  let source = 'open.er-api.com';

  // Try secondary API if primary failed
  if (!rates) {
    rates = await fetchFromCdnApi();
    source = 'cdn.jsdelivr.net/currency-api';
  }

  if (rates) {
    // Store relevant rate pairs
    if (rates.PKR) rateCache.rates['USD_PKR'] = rates.PKR;
    if (rates.INR) rateCache.rates['USD_INR'] = rates.INR;
    if (rates.EUR) rateCache.rates['USD_EUR'] = rates.EUR;
    if (rates.GBP) rateCache.rates['USD_GBP'] = rates.GBP;

    rateCache.lastFetched = new Date();
    rateCache.source = source;

    console.log(`💱 [ExchangeRate] Rates loaded from ${source}:`);
    console.log(`   1 USD = ${rateCache.rates['USD_PKR'] || '?'} PKR`);
    return true;
  }

  // All APIs failed — use fallback
  console.warn(`⚠️ [ExchangeRate] All APIs failed — using hardcoded fallback rates`);
  rateCache.rates = { ...FALLBACK_RATES };
  rateCache.source = 'fallback';
  rateCache.lastFetched = new Date();
  return false;
};

/**
 * Get the exchange rate for a currency pair.
 * 
 * @param {string} from - Source currency (e.g., 'USD')
 * @param {string} to - Target currency (e.g., 'PKR')
 * @returns {number} Exchange rate (e.g., 280 means 1 USD = 280 PKR)
 */
const getRate = (from, to) => {
  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  return rateCache.rates[key] || FALLBACK_RATES[key] || 0;
};

/**
 * Get cache metadata (for debugging / health checks).
 */
const getRateInfo = () => ({
  rates: { ...rateCache.rates },
  lastFetched: rateCache.lastFetched,
  source: rateCache.source
});

/**
 * Initialize exchange rates on server startup.
 * Fetches rates immediately and sets up a refresh interval.
 * Safe to call — never throws, never blocks server startup on failure.
 */
let refreshInterval = null;

const initExchangeRates = async () => {
  try {
    await fetchExchangeRates();
  } catch (err) {
    console.warn(`⚠️ [ExchangeRate] Init failed: ${err.message} — using fallback rates`);
    rateCache.rates = { ...FALLBACK_RATES };
    rateCache.source = 'fallback';
  }

  // Set up periodic refresh (every 6 hours)
  if (!refreshInterval) {
    refreshInterval = setInterval(async () => {
      try {
        await fetchExchangeRates();
      } catch (err) {
        console.warn(`⚠️ [ExchangeRate] Refresh failed: ${err.message}`);
      }
    }, REFRESH_INTERVAL);

    // Don't let the interval prevent the process from exiting
    if (refreshInterval.unref) refreshInterval.unref();
  }
};

module.exports = { initExchangeRates, getRate, getRateInfo, fetchExchangeRates };
