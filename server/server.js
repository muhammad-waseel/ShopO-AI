/**
 * Server Entry Point
 * ------------------
 *   1. Load environment variables from ../.env (or ./.env)
 *   2. Validate configuration (fail fast on missing MONGO_URI / JWT_SECRET)
 *   3. Connect to MongoDB
 *   4. Load exchange rates (PKR → USD for Daraz)
 *   5. Start the price-alert monitor (cron)
 *   6. Start listening
 */

const path = require('path');
const fs = require('fs');
const rootEnv = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(rootEnv) ? rootEnv : path.join(__dirname, '.env') });

const { validateEnv, printEnvReport } = require('./config/validateEnv');
const report = validateEnv();
printEnvReport(report);
if (!report.ok) process.exit(1);

const app = require('./app');
const connectDB = require('./config/db');
const { initExchangeRates } = require('./config/exchangeRate');
const { startPriceMonitor } = require('./services/priceMonitor');
const { ensureDemoQrCodes } = require('./scripts/seedQrCodes');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await initExchangeRates();
    await ensureDemoQrCodes();
    startPriceMonitor();

    app.listen(PORT, () => {
      console.log(`\n🚀 ShopO-AI Server running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`💊 Health: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
