/**
 * Rate Limiter Middleware
 * ----------------------
 * Prevents abuse by limiting the number of requests per IP address.
 * Two limiters are configured:
 *   1. General API limiter: 300 requests per 15 minutes (API_RATE_LIMIT)
 *   2. Search limiter: 10 search requests per minute (scraping is expensive)
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter - applies to all routes
const apiLimiter = rateLimit({
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT, 10) || 300,  // requests per window
  message: {
    message: 'Too many requests. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limiter for search/scraping endpoints
const searchLimiter = rateLimit({
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: parseInt(process.env.SEARCH_RATE_LIMIT, 10) || 10,  // searches per minute
  message: {
    message: 'Too many search requests. Please wait a minute before searching again.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { apiLimiter, searchLimiter };
