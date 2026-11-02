# 🛒 ShopO-AI — AI-Powered Price Intelligence & Product Authenticity Engine

Final Year Project, BS Software Engineering, FAST-NUCES Peshawar (2021–2026).
Syed Ahmad Mujtaba Shah (21P-8313) · Muhammad Waseel (22P-9147) · Supervisor: Dr. Usman Wajid Khan.

ShopO-AI compares prices across **Amazon, eBay, AliExpress and Daraz** in real time, checks whether a product is **genuine** (QR code registry and CNN image analysis), recommends the **best option** using price, seller trust and review sentiment, and supports **text, voice and image search**. Users get a **dashboard**, **wishlist** and **email price-drop alerts**.

---

## Features (mapped to the report's requirements)

| Req. | Feature | Where |
|---|---|---|
| FR1, FR2 | Register / login (JWT, bcrypt), persistent session | `/login`, `/register` |
| TC_PROFILE_01 | Edit name, phone, notification settings, default platforms, change password | `/profile` |
| FR3, FR4 | Multi-platform scraping with image, title, price, rating, seller trust | `/results` |
| Feature 2 | Sort (price, rating, trust, AI score), filter (platform, price range, rating, hide risky), grid and comparison-table views | `/results` |
| §7.3.1 | **AI Best Pick** highlighted, scored on price + trust + sentiment | `/results` |
| FR5 | **QR verification**: live camera scan, photo upload or typed code; registry lookup flags unknown, revoked and cloned codes as "Potential Counterfeit" | `/verify?mode=qr` |
| §7.5 | Image / logo authenticity (MobileNet CNN, TensorFlow.js) | `/verify` |
| Feature 3 | Seller credibility badges (Trusted / Average / Low trust / Unverified) | product cards |
| Feature 4 | Text search with **autocomplete** (your history, trending, popular) | search bar |
| FR6 | **Image search**: photo → Google Vision or MobileNet → product query | 📷 in search bar |
| FR7 | **Voice search**: browser Web Speech API, with Google Speech-to-Text fallback | 🎤 in search bar |
| FR8 | Review sentiment: **DistilBERT** (Hugging Face) or AFINN fallback | AI Analysis page |
| TC_AI_REC_01 | Personalised recommendations from search history | `/dashboard` |
| FR9 | Wishlist, kept across sessions | ♥ buttons, `/wishlist` |
| FR10 | **Price alerts**: cron monitor every 30 min, email (Nodemailer) and optional SMS (Twilio), in-app badge | 🔔 buttons, `/alerts` |
| UC-3 | Permanent search history (text / voice / image) | `/history?tab=searches` |
| §7.6.2 | Verification history (QR and image checks) | `/history?tab=verifications` |
| Feature 7 | Unified dashboard | `/dashboard` |
| NFR1 | bcrypt password hashing, Helmet security headers, rate limiting, JWT | server |
| NFR5 | Graceful degradation: if vision or speech APIs fail, the user is told and text search keeps working | search bar |
| §9.1 | 44 automated tests (Jest + Supertest), GitHub Actions CI, Docker | `server/tests`, `.github/` |
| §10.4 | Config validation on startup | `server/config/validateEnv.js` |

---

## Quick start (local)

**Prerequisites:** Node.js 18 or newer, and MongoDB (local install, or a free MongoDB Atlas cluster).

```bash
# 1. Install everything
npm run install-all

# 2. Configure
cp .env.example .env        # Windows: copy .env.example .env
#    then edit .env and set at least MONGO_URI and JWT_SECRET

# 3. Run backend (port 5000) and frontend (port 3000) together
npm run dev
```

Open **http://localhost:3000**, create an account, and you will land on the dashboard.

> **TensorFlow on Windows:** `@tensorflow/tfjs-node` is an *optional* dependency. If it fails to install, everything still works: image verification uses heuristic analysis, and image search uses Google Vision if you set a key.

### Run with Docker (one command, includes MongoDB)

```bash
docker compose up --build      # → http://localhost:5000
```

### Deploy online (Render + MongoDB Atlas, free)

1. **Database:** create a free M0 cluster on MongoDB Atlas. Add a database user, allow access from anywhere (`0.0.0.0/0`) under *Network Access*, and copy the connection string (`mongodb+srv://...`). Add `/shopo-ai` before the `?` so it names the database.
2. **App:** on render.com, go to **New → Blueprint**, connect this GitHub repo and click **Apply**. When asked, paste the Atlas string into `MONGO_URI`. `JWT_SECRET` is generated automatically.
3. Wait for the build (about 10 minutes the first time). The site will be at `https://shopo-ai-xxxx.onrender.com`.

On the free plan the app sleeps after 15 minutes without visitors, and the first visit afterwards takes about a minute to wake it.

### Run the tests

```bash
npm test                        # uses an in-memory MongoDB automatically
# or point at a real server:
MONGO_URI_TEST=mongodb://localhost:27017 npm test
```

---

## Optional integrations (`.env`)

Everything works without these. Each one improves a feature:

| Variable(s) | Enables | Without it |
|---|---|---|
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Real price-alert emails (Gmail: `smtp.gmail.com`, port 465, App Password) | Email text is printed to the server log; in-app alert still shown |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS alerts (user enables in Profile) | No SMS |
| `GOOGLE_VISION_API_KEY` | Accurate image search (web best-guess + logo detection) | Local MobileNet classification |
| `GOOGLE_STT_API_KEY` | Voice search in Firefox (server transcription) | Chrome/Edge/Safari still use built-in speech recognition |
| `HF_API_KEY` | DistilBERT review sentiment | AFINN-165 lexicon |
| `ADMIN_EMAILS` | Accounts that may register new QR codes via the API | — |

Check what is active at **`/api/health`**.

---

## Demo QR codes

Five codes are seeded automatically. Open **Verify → QR Code** to click them, download them, or scan them from another screen with your camera:

| Code | Result |
|---|---|
| `SHOPO-NIKE-AM90-0001` | Genuine (Nike Air Max 90) |
| `SHOPO-SAMS-S24U-0002` | Genuine (Samsung Galaxy S24 Ultra) |
| `SHOPO-APPL-APP2-0003` | Genuine (AirPods Pro 2) |
| `SHOPO-LORE-REV-0004` | Genuine (L'Oréal Revitalift) |
| `SHOPO-CASI-GSHK-0005` | Potential Counterfeit (revoked batch) |
| anything else, e.g. `FAKE-12345` | Potential Counterfeit (unregistered) |

If more than `QR_CLONE_THRESHOLD` (default 5) different accounts scan the same code, it is flagged as a likely **cloned label**.

---

## Project structure

```
├── client/                React SPA
│   └── src/
│       ├── pages/         Home, Dashboard, Results, ProductDetail, VerifyProduct,
│       │                  Wishlist, Alerts, History, Profile, Login, Register
│       ├── components/    SearchBar (autocomplete/voice/image), ProductCard,
│       │                  QrVerifier, PriceAlertModal, WishlistButton, charts…
│       └── context/       AuthContext, UserDataContext (wishlist + alert badge)
├── server/                Express API
│   ├── app.js / server.js Express app / startup (env check, DB, cron)
│   ├── routes, controllers
│   ├── models/            User, Search (cache), SearchHistory, Analysis,
│   │                      VerificationHistory, Wishlist, PriceAlert, QrCode
│   ├── scrapers/          Amazon, eBay, AliExpress, Daraz (Cheerio + Puppeteer)
│   ├── ai/                sentiment (DistilBERT/AFINN), authenticity scorer,
│   │                      verdict engine, cosine similarity, MobileNet verifier
│   ├── services/          priceMonitor (cron), notifier (email/SMS),
│   │                      recommender, imageSearch, speechToText, qrVerifier
│   ├── scripts/           seedQrCodes.js, diagnostics/
│   └── tests/             Jest + Supertest suites (44 tests)
├── Dockerfile, docker-compose.yml
└── .github/workflows/ci.yml
```

## API overview

| Method & path | Purpose |
|---|---|
| `POST /api/auth/register` · `login` · `GET me` · `PUT profile` · `PUT password` | Accounts |
| `GET /api/products/search?q=&platforms=&searchType=` | Multi-platform search (cached 1 h) with ranking and best pick |
| `GET /api/products/suggestions?q=` | Autocomplete |
| `POST /api/products/image-search` (image) · `voice-search` (audio) | Multi-modal search |
| `POST /api/analysis/analyze` · `verify-image` · `verify-url` · `GET history` | AI analysis and image verification |
| `POST /api/verify/qr` · `qr-image` · `GET demo-codes` · `POST qr/register` (admin) | QR verification |
| `GET/POST/DELETE /api/wishlist` | Wishlist |
| `GET/POST/PATCH/DELETE /api/alerts`, `POST /api/alerts/check` | Price alerts |
| `GET /api/history/searches` · `verifications` | History |
| `GET /api/dashboard` · `GET /api/recommendations` | Dashboard and recommendations |
| `GET /api/health` | Status and enabled integrations |

## Notes and limitations

* Scraping depends on each store's page layout and anti-bot rules. If a platform returns 0 results, use **Refresh** or wait a few minutes.
* Live Daraz prices are converted from PKR to USD using live exchange rates (fallback 1 USD = 280 PKR).
* The QR registry is a demo stand-in for a brand-operated database. In production, manufacturers would register codes through the admin API.
* The original Flask prototype is kept in `old_python_backup/` for reference only.

For the full technical write-up see **[PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)**.
