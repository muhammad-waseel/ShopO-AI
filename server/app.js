/**
 * Express Application
 * -------------------
 * Builds the Express app (middleware + routes). Kept separate from
 * server.js so the API can be tested with Supertest without opening a port.
 *
 * API Routes:
 *   /api/auth            - register, login, me, profile, password
 *   /api/products        - search, suggestions, image-search, voice-search
 *   /api/analysis        - AI analysis, image verification, analysis history
 *   /api/verify          - QR code verification
 *   /api/wishlist        - wishlist (FR9)
 *   /api/alerts          - price alerts (FR10)
 *   /api/history         - search & verification history
 *   /api/dashboard       - unified dashboard summary
 *   /api/recommendations - personalised recommendations
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware/rateLimiter');
const auth = require('./middleware/auth');
const { getDashboard, getRecommendations } = require('./controllers/historyController');
const { getRateInfo } = require('./config/exchangeRate');
const { validateEnv } = require('./config/validateEnv');

const app = express();

// Behind a reverse proxy (Render, Nginx, Heroku) so rate limiting sees the real IP
app.set('trust proxy', 1);

// ===== SECURITY & PARSING =====
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // React build uses inline styles; CSP can be tightened per deployment
}));

// RENDER_EXTERNAL_URL is set automatically on Render
const allowedOrigins = (process.env.CLIENT_URL || [process.env.RENDER_EXTERNAL_URL, 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001'].filter(Boolean).join(','))
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(null, false)),
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);

// ===== API ROUTES =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/verify', require('./routes/verify'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/history', require('./routes/history'));
app.get('/api/dashboard', auth, getDashboard);
app.get('/api/recommendations', auth, getRecommendations);

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const env = validateEnv();
  res.json({
    status: 'OK',
    message: 'ShopO-AI Server is running!',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    features: env.features,
    exchangeRates: getRateInfo().source,
    timestamp: new Date().toISOString()
  });
});

// ===== SERVE REACT BUILD (production / single-container deploy) =====
const clientBuild = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(path.join(clientBuild, 'index.html'))) {
  app.use(express.static(clientBuild, { maxAge: '7d', index: false }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

// ===== ERROR HANDLING =====
app.use('/api', (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Multer / upload validation errors → 400 with a readable message
  if (err && (err.name === 'MulterError' || /allowed|Unsupported audio/.test(err.message || ''))) {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body.' });
  }
  console.error('Server Error:', err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
