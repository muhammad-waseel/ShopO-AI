/**
 * Environment Validation
 * ----------------------
 * Runs on startup (report §10.4) so missing/malformed configuration is
 * reported clearly instead of failing later at runtime.
 *
 *   Required: MONGO_URI, JWT_SECRET
 *   Optional features are listed as enabled/disabled.
 */

const validateEnv = () => {
  const errors = [];
  const warnings = [];

  if (!process.env.MONGO_URI) errors.push('MONGO_URI is not set (e.g. mongodb://localhost:27017/shopo-ai)');
  else if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URI)) errors.push('MONGO_URI must start with mongodb:// or mongodb+srv://');

  if (!process.env.JWT_SECRET) errors.push('JWT_SECRET is not set');
  else if (process.env.JWT_SECRET.length < 16) warnings.push('JWT_SECRET is shorter than 16 characters — use a long random value in production');

  if (process.env.NODE_ENV === 'production' && /smartshop_ai_secret_key|change_me/i.test(process.env.JWT_SECRET || '')) {
    errors.push('JWT_SECRET is still the example value — set a unique secret for production');
  }

  const features = {
    'Email alerts (SMTP)': !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    'SMS alerts (Twilio)': !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
    'Google Cloud Vision (image search)': !!process.env.GOOGLE_VISION_API_KEY,
    'Google Speech-to-Text (voice fallback)': !!(process.env.GOOGLE_STT_API_KEY || process.env.GOOGLE_VISION_API_KEY),
    'DistilBERT sentiment (Hugging Face)': !!process.env.HF_API_KEY
  };

  return { ok: errors.length === 0, errors, warnings, features };
};

const printEnvReport = (report) => {
  report.warnings.forEach(w => console.warn(`⚠️  ${w}`));
  console.log('🔧 Optional integrations:');
  for (const [name, on] of Object.entries(report.features)) {
    console.log(`   ${on ? '✅' : '➖'} ${name}${on ? '' : ' (not configured — fallback in use)'}`);
  }
  if (!report.ok) {
    console.error('\n❌ Configuration errors:');
    report.errors.forEach(e => console.error(`   • ${e}`));
    console.error('   Copy .env.example to .env and fill in the values.\n');
  }
};

module.exports = { validateEnv, printEnvReport };
