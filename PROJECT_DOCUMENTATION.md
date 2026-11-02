# Smart Shopping AI – Complete Project Documentation

> A comprehensive MERN stack Final Year Project that helps online shoppers detect potentially fake or unreliable products using rule-based AI analysis, sentiment analysis, and multi-platform price comparison.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Folder Structure](#4-folder-structure)
5. [Database Design](#5-database-design)
6. [Authentication System](#6-authentication-system)
7. [Scraping Engine](#7-scraping-engine)
8. [AI Analysis Engine](#8-ai-analysis-engine)
   - 8.1 [Authenticity Scoring Algorithm](#81-authenticity-scoring-algorithm)
   - 8.2 [Sentiment Analysis (AFINN-165)](#82-sentiment-analysis-afinn-165)
   - 8.3 [Verdict Engine](#83-verdict-engine)
9. [API Reference](#9-api-reference)
10. [Frontend Architecture](#10-frontend-architecture)
11. [UI/UX Design](#11-uiux-design)
12. [Security Measures](#12-security-measures)
13. [Setup & Installation Guide](#13-setup--installation-guide)
14. [Testing Guide](#14-testing-guide)
15. [Known Limitations & Future Work](#15-known-limitations--future-work)
16. [References](#16-references)

---

## 1. Project Overview

### 1.1 Problem Statement

Online shopping fraud is a growing issue. Consumers frequently encounter:
- **Fake products** disguised with inflated reviews and misleading descriptions.
- **Inconsistent pricing** across platforms, making it hard to determine a fair price.
- **Unreliable sellers** with fraudulent ratings.

There is a need for a tool that can help shoppers make informed decisions by analyzing product authenticity across multiple e-commerce platforms.

### 1.2 Proposed Solution

**Smart Shopping AI** is a web application that:
1. **Scrapes product data** from 4 major e-commerce platforms (Amazon, eBay, AliExpress, Daraz).
2. **Analyzes product authenticity** using a rule-based scoring algorithm (no paid API keys required).
3. **Performs sentiment analysis** on product reviews using the AFINN-165 lexicon.
4. **Provides a clear verdict** (Buy ✅ / Risky ⚠️ / Avoid 🚫) with an actionable suggestion.
5. **Compares prices** across platforms to identify the best deal.

### 1.3 Key Features

| Feature | Description |
|---|---|
| Multi-Platform Scraping | Simultaneously scrapes Amazon, eBay, AliExpress, and Daraz |
| Authenticity Score (0-100) | Composite score evaluating price, seller, reviews, and sentiment |
| Sentiment Analysis | AFINN-165 lexicon-based analysis of individual product reviews |
| Verdict System | Clear Buy/Risky/Avoid recommendation with explanation |
| Search Caching | 1-hour TTL cache to avoid redundant scraping |
| User Authentication | JWT-based auth with search/analysis history |
| Responsive UI | Modern React SPA with charts, gauges, and animations |
| Rate Limiting | Prevents abuse with configurable request limits |

### 1.4 Target Users

- Online shoppers who want to verify product authenticity before purchasing.
- Price-conscious consumers looking for the best deal across platforms.
- Anyone concerned about fake reviews and unreliable sellers.

---

## 2. Technology Stack

### 2.1 Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.x | Component-based SPA framework |
| React Router DOM | 6.x | Client-side routing |
| Axios | 1.x | HTTP client for API calls |
| Recharts | 2.x | Data visualization (pie charts, gauges) |
| React Toastify | 9.x | Toast notification system |
| React Icons | 4.x | Icon library (Feather Icons) |

### 2.2 Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | JavaScript runtime |
| Express | 4.x | Web framework |
| Mongoose | 8.x | MongoDB ODM |
| JSON Web Token | 9.x | JWT authentication |
| bcryptjs | 2.x | Password hashing |
| express-validator | 7.x | Input validation |
| express-rate-limit | 7.x | Rate limiting middleware |

### 2.3 Scraping

| Technology | Purpose |
|---|---|
| Axios + Cheerio | Fast HTML parsing (primary scraper) |
| Puppeteer Extra | Headless browser fallback for JS-rendered pages |
| puppeteer-extra-plugin-stealth | Anti-detection for headless browsing |

### 2.4 AI / Analysis

| Technology | Purpose |
|---|---|
| `sentiment` npm package | AFINN-165 lexicon-based sentiment analysis |
| Custom rule-based scorer | 4-factor authenticity scoring algorithm |

### 2.5 Database

| Technology | Purpose |
|---|---|
| MongoDB | NoSQL document database |
| Mongoose TTL indexes | Automatic cache expiration |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT (React SPA)                     │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Home   │  │ Results  │  │ Product  │  │ History  │  │
│  │  Page   │  │  Page    │  │ Detail   │  │  Page    │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │            │             │              │        │
│  ┌────┴────────────┴─────────────┴──────────────┴──┐    │
│  │              Axios API Service                   │    │
│  │         (JWT interceptor, base URL)              │    │
│  └──────────────────────┬──────────────────────────┘    │
└─────────────────────────┼───────────────────────────────┘
                          │  HTTP (REST API)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 SERVER (Express.js)                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Middleware Layer                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │  CORS    │  │   Auth   │  │ Rate Limiter │  │    │
│  │  └──────────┘  └──────────┘  └──────────────┘  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Route Layer                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │  /auth   │  │/products │  │  /analysis   │  │    │
│  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │    │
│  └───────┼──────────────┼───────────────┼──────────┘    │
│          │              │               │                │
│  ┌───────┴──────────────┴───────────────┴──────────┐    │
│  │            Controller Layer                      │    │
│  └──────┬────────────────┬──────────────┬──────────┘    │
│         │                │              │                │
│         ▼                ▼              ▼                │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐     │
│  │  Auth      │  │  Scraping   │  │  AI Engine   │     │
│  │  System    │  │  Engine     │  │              │     │
│  │            │  │             │  │ ┌──────────┐ │     │
│  │ ┌────────┐│  │ ┌─────────┐ │  │ │ Scorer   │ │     │
│  │ │ JWT    ││  │ │ Amazon  │ │  │ └──────────┘ │     │
│  │ │ bcrypt ││  │ │ eBay    │ │  │ ┌──────────┐ │     │
│  │ └────────┘│  │ │ AliExpr │ │  │ │Sentiment │ │     │
│  │           │  │ │ Daraz   │ │  │ └──────────┘ │     │
│  └────┬──────┘  │ └─────────┘ │  │ ┌──────────┐ │     │
│       │         └──────┬──────┘  │ │ Verdict  │ │     │
│       │                │         │ └──────────┘ │     │
│       │                │         └──────┬───────┘     │
│       ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              MongoDB (Mongoose)                  │   │
│  │  ┌────────┐  ┌──────────┐  ┌──────────────┐    │   │
│  │  │ Users  │  │ Searches │  │  Analyses    │    │   │
│  │  └────────┘  └──────────┘  └──────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Data Flow

1. **User searches** for a product on the Home page.
2. **Frontend** sends `GET /api/products/search?q=...&platforms=...` with JWT token.
3. **Backend** checks MongoDB cache for recent identical searches.
   - **Cache hit**: Returns cached results instantly.
   - **Cache miss**: Scrapes selected platforms concurrently using `Promise.allSettled`.
4. **Scraping Engine** uses a hybrid approach:
   - **Primary**: Axios + Cheerio (fast, lightweight HTML parsing).
   - **Fallback**: Puppeteer with stealth plugin (for JavaScript-rendered pages).
5. **Results** are cached in MongoDB (TTL: 1 hour) and returned to the frontend.
6. **User clicks "AI Analysis"** on a product card.
7. **Frontend** sends `POST /api/analysis/analyze` with product data.
8. **AI Engine** runs 3 modules:
   - **Authenticity Scorer**: Calculates 4 sub-scores (price, seller, review, sentiment).
   - **Sentiment Analyzer**: Analyzes individual reviews with AFINN-165.
   - **Verdict Engine**: Combines scores into a final verdict + suggestion.
9. **Analysis** is saved to MongoDB and returned to the frontend.
10. **Frontend** displays the gauge, bars, pie chart, verdict badge, and review list.

---

## 4. Folder Structure

```
smart-shopping-ai/
├── .env                        # Environment variables (MONGO_URI, JWT_SECRET, PORT)
├── .gitignore                  # Git ignore rules
├── package.json                # Root package (concurrently for dev)
├── PROJECT_DOCUMENTATION.md    # This document
├── README.md                   # Quick-start guide
│
├── server/                     # Express.js Backend
│   ├── package.json            # Server dependencies
│   ├── server.js               # Entry point – Express app setup, middleware, routes
│   │
│   ├── config/
│   │   └── db.js               # Mongoose connection to MongoDB
│   │
│   ├── models/
│   │   ├── User.js             # User schema (name, email, hashed password)
│   │   ├── Search.js           # Search cache schema (TTL 1 hour, embedded products)
│   │   └── Analysis.js         # AI analysis results schema
│   │
│   ├── middleware/
│   │   ├── auth.js             # JWT verification middleware
│   │   └── rateLimiter.js      # Rate limiting (apiLimiter, searchLimiter)
│   │
│   ├── controllers/
│   │   ├── authController.js   # Register, login, getMe
│   │   ├── productController.js # Search with cache-first strategy
│   │   └── analysisController.js # Analyze, get history, get by ID
│   │
│   ├── routes/
│   │   ├── auth.js             # POST /register, /login; GET /me
│   │   ├── products.js         # GET /search (auth + rate limit)
│   │   └── analysis.js         # POST /analyze; GET /history, /:id
│   │
│   ├── scrapers/
│   │   ├── index.js            # Scraper orchestrator (Promise.allSettled)
│   │   ├── browserPool.js      # Lazy Puppeteer instance with stealth plugin
│   │   ├── amazon.js           # Amazon scraper (cheerio → Puppeteer)
│   │   ├── ebay.js             # eBay scraper (cheerio → Puppeteer)
│   │   ├── aliexpress.js       # AliExpress scraper (cheerio → Puppeteer)
│   │   └── daraz.js            # Daraz scraper (cheerio → Puppeteer)
│   │
│   └── ai/
│       ├── authenticityScorer.js  # 4-factor scoring algorithm
│       ├── sentimentAnalyzer.js   # AFINN-165 lexicon sentiment
│       └── verdictEngine.js       # Final verdict + suggestion generator
│
├── client/                     # React Frontend
│   ├── package.json            # Client dependencies + proxy
│   │
│   ├── public/
│   │   └── index.html          # HTML shell (Inter font CDN)
│   │
│   └── src/
│       ├── index.js            # ReactDOM entry point
│       ├── index.css           # Global styles, CSS variables, reset
│       ├── App.jsx             # Router, AuthProvider, ToastContainer
│       │
│       ├── context/
│       │   └── AuthContext.jsx  # React Context for JWT auth state
│       │
│       ├── services/
│       │   └── api.js           # Axios instance with interceptors
│       │
│       ├── utils/
│       │   └── helpers.js       # Color helpers, formatPrice, timeAgo, etc.
│       │
│       ├── components/
│       │   ├── Navbar.jsx       # Responsive navbar with auth controls
│       │   ├── Navbar.css
│       │   ├── ProductCard.jsx  # Product listing card with AI Analysis btn
│       │   ├── ProductCard.css
│       │   ├── AuthenticityGauge.jsx  # Recharts RadialBarChart (0-100)
│       │   ├── SentimentChart.jsx     # Recharts PieChart (pos/neu/neg)
│       │   ├── AIVerdictBadge.jsx     # Buy/Risky/Avoid badge
│       │   ├── ReviewList.jsx         # Scrollable review list
│       │   ├── LoadingSpinner.jsx     # Loading animation
│       │   ├── LoadingSpinner.css
│       │   └── ProtectedRoute.jsx     # Auth guard for routes
│       │
│       └── pages/
│           ├── Home.jsx         # Hero, search form, features grid
│           ├── Home.css
│           ├── Login.jsx        # Login form
│           ├── Register.jsx     # Registration form
│           ├── Auth.css         # Shared auth page styles
│           ├── Results.jsx      # Product grid with platform filters
│           ├── Results.css
│           ├── ProductDetail.jsx # AI Analysis page (THE MAIN FEATURE)
│           ├── ProductDetail.css
│           ├── History.jsx      # Past analyses list with pagination
│           └── History.css
```

---

## 5. Database Design

### 5.1 User Model (`User.js`)

Stores registered user accounts with hashed passwords.

```javascript
{
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 }, // bcrypt hashed
  createdAt: { type: Date, default: Date.now }
}
```

**Key behaviors:**
- `pre('save')` hook automatically hashes the password with bcrypt (10 salt rounds) before saving.
- `comparePassword(candidate)` instance method uses `bcrypt.compare()` for login verification.
- Password field is excluded from JSON responses via `toJSON` transform.

### 5.2 Search Model (`Search.js`)

Caches search results to avoid repeated scraping. Automatically expires after 1 hour.

```javascript
{
  query:     { type: String, required: true, lowercase: true, trim: true },
  platforms: [{ type: String }],   // e.g. ['amazon', 'ebay']
  products:  [productItemSchema],  // Embedded product documents
  createdAt: { type: Date, default: Date.now, expires: 3600 } // TTL: 1 hour
}
```

**Embedded `productItemSchema`:**
```javascript
{
  name:         String,
  price:        Number,
  displayPrice: String,   // e.g. "$29.99"
  image:        String,   // Image URL
  link:         String,   // Product page URL
  platform:     String,   // 'amazon' | 'ebay' | 'aliexpress' | 'daraz'
  rating:       Number,   // 0-5 star rating
  reviewCount:  Number,   // Number of reviews
  sellerRating: Number,   // Seller's rating (when available)
  isBestDeal:   Boolean   // True for the lowest-priced item
}
```

**Indexes:**
- Compound index on `{ query, platforms }` for fast cache lookups.
- TTL index on `createdAt` (3600 seconds) for automatic document expiration.

### 5.3 Analysis Model (`Analysis.js`)

Stores the results of each AI analysis, linked to the user who performed it.

```javascript
{
  user:              { type: ObjectId, ref: 'User', required: true },
  productName:       String,
  productPrice:      Number,
  productImage:      String,
  productLink:       String,
  platform:          String,
  averagePrice:      Number,
  authenticityScore: { type: Number, min: 0, max: 100 },
  verdict:           { type: String, enum: ['Buy', 'Risky', 'Avoid'] },
  suggestion:        String,   // Human-readable recommendation text
  
  breakdown: {                 // 4 sub-scores (0-25 each)
    priceScore:     Number,
    sellerScore:    Number,
    reviewScore:    Number,
    sentimentScore: Number
  },
  
  breakdownDetails: {          // Explanations for each factor
    priceAnalysis:  { value: Number, max: Number, explanation: String },
    sellerRating:   { value: Number, max: Number, explanation: String },
    reviewAnalysis: { value: Number, max: Number, explanation: String },
    sentimentScore: { value: Number, max: Number, explanation: String }
  },
  
  sentimentBreakdown: {        // Aggregated sentiment counts
    positive: Number,
    neutral:  Number,
    negative: Number
  },
  
  analyzedReviews: [{          // Individual review sentiments
    text:      String,
    score:     Number,   // Raw AFINN score
    sentiment: String    // 'positive' | 'neutral' | 'negative'
  }],
  
  createdAt: { type: Date, default: Date.now }
}
```

**Indexes:**
- `{ user: 1, createdAt: -1 }` for efficient history queries sorted by date.

---

## 6. Authentication System

### 6.1 How It Works

The authentication system uses **JSON Web Tokens (JWT)** for stateless authentication:

```
Registration Flow:
  User → POST /api/auth/register → Validate input → Hash password → Save to MongoDB → Generate JWT → Return token

Login Flow:
  User → POST /api/auth/login → Find user by email → Compare passwords → Generate JWT → Return token

Protected Request Flow:
  Client → Add "Authorization: Bearer <token>" header → auth middleware verifies JWT → Attach user to req → Continue to controller
```

### 6.2 JWT Configuration

| Parameter | Value | Explanation |
|---|---|---|
| Algorithm | HS256 | HMAC-SHA256 signing |
| Expiry | 7 days | Token lifetime before re-login needed |
| Secret | `.env` `JWT_SECRET` | Application secret key |
| Payload | `{ id: user._id }` | Minimal payload (user's MongoDB ObjectId) |

### 6.3 Password Security

| Parameter | Value | Explanation |
|---|---|---|
| Algorithm | bcrypt | Adaptive hash function |
| Salt Rounds | 10 | Cost factor (2^10 iterations) |
| Storage | Hashed only | Raw passwords never stored |
| Comparison | `bcrypt.compare()` | Timing-safe comparison |

### 6.4 Client-Side Auth (AuthContext.jsx)

The `AuthContext` React Context manages authentication state on the frontend:

1. **On app load**: Checks `localStorage` for an existing token.
2. **If token exists**: Calls `GET /api/auth/me` to validate and fetch user data.
3. **If token is invalid/expired**: Clears localStorage and logs out.
4. **On login/register**: Stores token in localStorage and sets user state.
5. **On logout**: Removes token from localStorage and clears state.

The `api.js` Axios interceptor automatically:
- **Attaches** the JWT to every outgoing request's `Authorization` header.
- **Catches** 401 responses and triggers automatic logout.

---

## 7. Scraping Engine

### 7.1 Architecture

The scraping engine uses a **hybrid approach** for maximum reliability:

```
Priority 1: Axios + Cheerio (fast, lightweight)
    ↓ (if request fails or page needs JavaScript)
Priority 2: Puppeteer Extra + Stealth Plugin (headless browser)
```

### 7.2 How Each Scraper Works

All 4 scrapers follow the same pattern:

```javascript
async function scrapeProducts(query) {
  try {
    // Step 1: Try Cheerio (fast HTTP request + HTML parsing)
    const response = await axios.get(searchURL, { headers: userAgentHeaders });
    const $ = cheerio.load(response.data);
    const products = parseProducts($);
    
    if (products.length > 0) return products;
    
    // Step 2: Fallback to Puppeteer (headless browser)
    throw new Error('Cheerio found no results, falling back to browser');
  } catch {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(randomUserAgent);
    await page.goto(searchURL, { waitUntil: 'networkidle2', timeout: 30000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    return parseProducts($);
  }
}
```

### 7.3 Platform-Specific Details

#### Amazon (`amazon.js`)
- **URL**: `https://www.amazon.com/s?k={query}`
- **Selectors**: `.s-result-item[data-asin]` → `.a-size-medium`, `.a-price-whole`, `.a-star-*`, `.a-size-base`
- **Price normalization**: USD → float
- **Max results**: 8 products per search

#### eBay (`ebay.js`)
- **URL**: `https://www.ebay.com/sch/i.html?_nkw={query}`
- **Selectors**: `.s-item` → `.s-item__title`, `.s-item__price`, `.s-item__image img`
- **Price normalization**: Strips `$` and `,` characters
- **Max results**: 8 products per search

#### AliExpress (`aliexpress.js`)
- **URL**: `https://www.aliexpress.com/wholesale?SearchText={query}`
- **Selectors**: Product cards → title, price, rating, image
- **Cookie**: Sets `aep_usuc_f=site=glo&c_tp=USD` for USD pricing
- **Max results**: 8 products per search

#### Daraz (`daraz.js`)
- **URL**: `https://www.daraz.pk/catalog/?q={query}`
- **Selectors**: `[data-qa-locator="product-item"]` → title, price, rating, image
- **Price normalization**: PKR → approximate USD conversion (`/280`)
- **Max results**: 8 products per search

### 7.4 Scraper Orchestrator (`scrapers/index.js`)

The orchestrator coordinates all scrapers:

1. **Receives** query and platform list from the controller.
2. **Launches** selected scrapers concurrently with `Promise.allSettled()`.
3. **Collects** results (fulfilled) and logs errors (rejected).
4. **Filters** irrelevant results using `isRelevant(productName, query)`:
   - At least one query word must appear in the product name.
   - Products matching `BLOCKED_KEYWORDS` (case, screen protector, strap, etc.) are excluded.
5. **Sorts** by price (ascending).
6. **Tags** the cheapest item as `isBestDeal: true`.
7. **Returns** combined results array and per-platform status.

### 7.5 Browser Pool (`browserPool.js`)

A lazy singleton manages the Puppeteer browser instance:

```
First scrape request → Launch Puppeteer with stealth plugin → Use browser
Subsequent requests → Reuse existing browser instance
5 minutes of inactivity → Close browser automatically (idle timeout)
```

**Puppeteer configuration:**
```javascript
{
  headless: 'new',     // New headless mode (faster, more stable)
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ]
}
```

---

## 8. AI Analysis Engine

The AI engine is the **core innovation** of this FYP. It consists of three modules that work together to evaluate product authenticity.

### 8.1 Authenticity Scoring Algorithm

**File**: `server/ai/authenticityScorer.js`

The scorer evaluates products across **4 independent factors**, each contributing 0-25 points to a total score of 0-100.

#### Factor 1: Price Analysis (0-25 points)

Compares the product's price to the average price across all scraped platforms.

```
Formula: deviation = |productPrice - averagePrice| / averagePrice

Scoring Rules:
  If no average price available → 15/25 (neutral score)
  If deviation ≤ 10%  → 25/25 (price matches market rate)
  If deviation ≤ 25%  → 20/25 (slight deviation, still reasonable)
  If deviation ≤ 50%  → 12/25 (significant deviation, suspicious)
  If deviation > 50%  → 5/25  (extreme deviation, likely fake/scam)
```

**Example**: A product at $15 when the average is $40:
- Deviation = |15-40|/40 = 62.5% → Score: **5/25** (extreme deviation)

#### Factor 2: Seller Rating (0-25 points)

Evaluates the seller's credibility based on their rating percentage.

```
Scoring Rules:
  If no seller rating available → 10/25 (low confidence)
  If rating ≥ 95%  → 25/25 (excellent seller)
  If rating ≥ 85%  → 20/25 (good seller)
  If rating ≥ 70%  → 12/25 (average seller)
  If rating < 70%  → 5/25  (poor seller, risky)
```

**Example**: A seller with 98% positive rating → Score: **25/25**

#### Factor 3: Review Count Analysis (0-25 points)

More reviews generally indicate a more established and trustworthy product.

```
Scoring Rules:
  If reviews ≥ 100  → 25/25 (well-established product)
  If reviews ≥ 50   → 20/25 (reasonably reviewed)
  If reviews ≥ 10   → 12/25 (limited reviews)
  If reviews < 10   → 5/25  (very few reviews, risky)
```

**Example**: 75 reviews → Score: **20/25**

#### Factor 4: Sentiment Score (0-25 points)

Based on the sentiment analysis of product reviews (see Section 8.2).

```
Scoring Rules:
  If no reviews analyzed     → 12/25 (neutral, no data)
  If positiveRatio ≥ 80%     → 25/25 (overwhelmingly positive)
  If positiveRatio ≥ 60%     → 20/25 (mostly positive)
  If positiveRatio ≥ 40%     → 12/25 (mixed sentiment)
  If positiveRatio < 40%     → 5/25  (mostly negative)
  
  Where: positiveRatio = positiveReviews / totalReviews × 100
```

#### Complete Scoring Example

| Factor | Input | Score | Explanation |
|---|---|---|---|
| Price | $15 (avg $40) | 5/25 | 62.5% below average — suspicious |
| Seller | 98% rating | 25/25 | Excellent seller reputation |
| Reviews | 75 reviews | 20/25 | Reasonably reviewed product |
| Sentiment | 70% positive | 20/25 | Mostly positive reviews |
| **TOTAL** | | **70/100** | **Risky** (45-74 range) |

### 8.2 Sentiment Analysis (AFINN-165)

**File**: `server/ai/sentimentAnalyzer.js`

#### What is AFINN-165?

AFINN-165 is a pre-computed word list of **3,382 English words** rated for valence (emotional score) from **-5 (most negative) to +5 (most positive)**.

Examples from the AFINN-165 lexicon:
```
"excellent"  → +3
"good"       → +3
"love"       → +3
"great"      → +3
"terrible"   → -3
"horrible"   → -3
"broken"     → -1
"waste"      → -2
"scam"       → -3
"fake"       → -3
```

#### How It Works

1. **Input**: An array of review text strings.
2. **For each review**: The `sentiment` npm package tokenizes the text and sums AFINN-165 scores.
3. **Classification**:
   ```
   If score > 1   → "positive"
   If score ≥ -1  → "neutral"  (range: -1 to 1)
   If score < -1  → "negative"
   ```
4. **Output**:
   - `analyzedReviews`: Array of `{ text, score, sentiment }` for each review.
   - `sentimentBreakdown`: `{ positive: N, neutral: N, negative: N }` (aggregated counts).

#### Example

```
Input reviews:
  1. "Great quality, love this product!" 
     → Tokens: great(+3) + love(+3) = score +6 → "positive"
  
  2. "Okay product, nothing special"
     → Tokens: okay(+0) + special(+0) = score 0 → "neutral"
  
  3. "Terrible quality, broke after one day. Total waste of money."
     → Tokens: terrible(-3) + broke(-1) + waste(-2) = score -6 → "negative"

Output sentiment breakdown: { positive: 1, neutral: 1, negative: 1 }
Output positive ratio: 33.3%
```

### 8.3 Verdict Engine

**File**: `server/ai/verdictEngine.js`

The verdict engine combines the authenticity score and sentiment data into a final recommendation.

#### Verdict Thresholds

```
Score ≥ 75  →  ✅ "Buy"    (High confidence – product appears authentic)
Score ≥ 45  →  ⚠️ "Risky"  (Moderate confidence – proceed with caution)
Score < 45  →  🚫 "Avoid"  (Low confidence – likely fake or unreliable)
```

#### Suggestion Generation

The engine generates a **context-aware suggestion** based on the score range:

| Score Range | Suggestion Template |
|---|---|
| 85-100 | "Excellent! This product shows strong indicators of authenticity with good pricing, reliable seller, and positive reviews." |
| 75-84 | "This product appears legitimate. The seller has a good track record and pricing is within normal range." |
| 60-74 | "Exercise caution. Some indicators suggest potential issues — verify the seller and check return policies." |
| 45-59 | "Multiple warning signs detected. The combination of pricing, seller reputation, and reviews raises concerns." |
| 25-44 | "High risk! Several factors indicate this product may be counterfeit or from an unreliable source." |
| 0-24 | "Strong indicators of a fraudulent listing. We recommend avoiding this product entirely." |

#### Full Pipeline

```
productData → authenticityScorer → { score, breakdown, breakdownDetails }
reviews     → sentimentAnalyzer  → { analyzedReviews, sentimentBreakdown }
                      ↓
              verdictEngine.analyze(productData, reviews)
                      ↓
              {
                authenticityScore: 70,
                verdict: "Risky",
                suggestion: "Exercise caution...",
                breakdown: { priceScore: 5, sellerScore: 25, reviewScore: 20, sentimentScore: 20 },
                breakdownDetails: { ... },
                sentimentBreakdown: { positive: 3, neutral: 1, negative: 1 },
                analyzedReviews: [...]
              }
```

---

## 9. API Reference

All API routes are prefixed with `/api`.

### 9.1 Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`

Register a new user account.

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | Yes | Not empty, trimmed |
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Minimum 6 characters |

**Response (201):**
```json
{
  "token": "eyJhbG...",
  "user": {
    "_id": "64abc...",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Errors:**
- `400` — Validation failed (invalid email, short password, etc.)
- `400` — User already exists

#### POST `/api/auth/login`

Login with existing credentials.

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |

**Response (200):** Same format as register.

**Errors:**
- `400` — Invalid credentials

#### GET `/api/auth/me`

Get the authenticated user's profile. Requires JWT.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "_id": "64abc...",
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 9.2 Product Routes (`/api/products`)

#### GET `/api/products/search`

Search for products across e-commerce platforms.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search query (min 2 characters) |
| `platforms` | string | No | Comma-separated list: `amazon,ebay,aliexpress,daraz` (default: all) |

**Rate Limit:** 10 requests per minute (per IP).

**Response (200):**
```json
{
  "query": "wireless headphones",
  "platforms": ["amazon", "ebay", "aliexpress", "daraz"],
  "totalResults": 28,
  "averagePrice": 45.67,
  "products": [
    {
      "name": "Sony WH-1000XM5",
      "price": 298.00,
      "displayPrice": "$298.00",
      "image": "https://...",
      "link": "https://...",
      "platform": "amazon",
      "rating": 4.7,
      "reviewCount": 15230,
      "sellerRating": 98,
      "isBestDeal": false
    }
  ],
  "platformStatus": {
    "amazon": "success",
    "ebay": "success",
    "aliexpress": "error",
    "daraz": "success"
  },
  "cached": false
}
```

### 9.3 Analysis Routes (`/api/analysis`)

#### POST `/api/analysis/analyze`

Run AI analysis on a specific product.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "productName": "Wireless Headphones",
  "productPrice": 29.99,
  "productImage": "https://...",
  "productLink": "https://...",
  "platform": "amazon",
  "averagePrice": 45.67,
  "sellerRating": 95,
  "reviewCount": 150,
  "reviews": ["Great product!", "Works well", "Terrible quality"]
}
```

**Response (201):**
```json
{
  "_id": "64xyz...",
  "authenticityScore": 82,
  "verdict": "Buy",
  "suggestion": "This product appears legitimate...",
  "breakdown": {
    "priceScore": 20,
    "sellerScore": 25,
    "reviewScore": 25,
    "sentimentScore": 12
  },
  "breakdownDetails": {
    "priceAnalysis": { "value": 20, "max": 25, "explanation": "Price is within 25% of market average" },
    "sellerRating": { "value": 25, "max": 25, "explanation": "Excellent seller rating (95%+)" },
    "reviewAnalysis": { "value": 25, "max": 25, "explanation": "Well-established product with 150+ reviews" },
    "sentimentScore": { "value": 12, "max": 25, "explanation": "No review text available for sentiment analysis" }
  },
  "sentimentBreakdown": { "positive": 2, "neutral": 0, "negative": 1 },
  "analyzedReviews": [
    { "text": "Great product!", "score": 3, "sentiment": "positive" },
    { "text": "Works well", "score": 2, "sentiment": "positive" },
    { "text": "Terrible quality", "score": -3, "sentiment": "negative" }
  ]
}
```

#### GET `/api/analysis/history`

Get paginated analysis history for the authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |

**Response (200):**
```json
{
  "analyses": [ ... ],
  "page": 1,
  "totalPages": 3,
  "total": 25
}
```

#### GET `/api/analysis/:id`

Get a specific analysis by its MongoDB ObjectId.

**Headers:** `Authorization: Bearer <token>`

**Response (200):** Full analysis object (same as analyze response).

**Errors:**
- `404` — Analysis not found
- `403` — Not authorized (belongs to different user)

---

## 10. Frontend Architecture

### 10.1 Routing Structure

```
/              → Home (search form, features, hero)
/login         → Login page
/register      → Registration page
/results       → Search results grid (protected)
/product       → AI Analysis detail page (protected)
/history       → Past analyses with pagination (protected)
```

Protected routes redirect unauthenticated users to `/login`.

### 10.2 State Management

| Scope | Solution | Description |
|---|---|---|
| Auth state | React Context (`AuthContext`) | User object, token, login/register/logout functions |
| Page data | Local state (`useState`) | Products, analysis results, loading states |
| Navigation data | `location.state` | Product data passed from Results → ProductDetail |

### 10.3 Component Hierarchy

```
App.jsx
├── AuthProvider (wraps entire app)
├── ToastContainer (global notifications)
├── BrowserRouter
│   ├── Navbar (shown on all pages)
│   └── Routes
│       ├── Home
│       ├── Login
│       ├── Register
│       ├── ProtectedRoute → Results
│       ├── ProtectedRoute → ProductDetail
│       └── ProtectedRoute → History
```

### 10.4 Key Components

| Component | Purpose | Props / Data Source |
|---|---|---|
| `Navbar` | Navigation + auth controls | AuthContext (user, logout) |
| `ProductCard` | Product listing item | product object, onAnalyze callback |
| `AuthenticityGauge` | Radial gauge chart (0-100) | `score` prop |
| `SentimentChart` | Pie chart (pos/neu/neg) | `sentimentData` prop |
| `AIVerdictBadge` | Buy/Risky/Avoid badge | `verdict`, `suggestion` props |
| `ReviewList` | Scrollable review list | `reviews` array prop |
| `LoadingSpinner` | Animated loading indicator | `message` prop |
| `ProtectedRoute` | Auth guard wrapper | `children` prop |

### 10.5 API Service (`api.js`)

```javascript
// Base configuration
const api = axios.create({
  baseURL: 'http://localhost:5000/api'
});

// Request interceptor: Attaches JWT from localStorage
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: Auto-logout on 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 11. UI/UX Design

### 11.1 Design System

| Element | Value |
|---|---|
| Primary Font | Inter (Google Fonts) |
| Primary Color | `#4facfe` (sky blue) |
| Background | `#f7f9fc` (light gray-blue) |
| Cards | White (`#ffffff`) with `1px solid #e8ecf1` border |
| Border Radius | 8px (small), 12px (medium), 16px (large) |
| Shadows | Layered: sm (3px), md (12px), lg (30px) |

### 11.2 Color Coding

**Verdict Colors:**
- ✅ Buy → `#2ecc71` (green)
- ⚠️ Risky → `#f39c12` (orange/yellow)
- 🚫 Avoid → `#e74c3c` (red)

**Score Colors:**
- 80-100 → `#2ecc71` (green)
- 60-79 → `#27ae60` (dark green)
- 40-59 → `#f39c12` (orange)
- 20-39 → `#e67e22` (dark orange)
- 0-19 → `#e74c3c` (red)

**Platform Colors:**
- Amazon → `#FF9900`
- eBay → `#E53238`
- AliExpress → `#FF4747`
- Daraz → `#F85606`

### 11.3 Responsive Breakpoints

| Breakpoint | Target |
|---|---|
| `> 768px` | Desktop layout |
| `≤ 768px` | Tablet (single column, stacked elements) |
| `≤ 480px` | Mobile (compact padding, smaller fonts) |

### 11.4 Charts & Visualizations

1. **Authenticity Gauge** (Recharts `RadialBarChart`):
   - Semi-circular gauge from 0-100.
   - Color dynamically set based on score.
   - Score number displayed prominently in the center.

2. **Sentiment Pie Chart** (Recharts `PieChart`):
   - Three segments: positive (green), neutral (gray), negative (red).
   - Inner radius creates a donut chart.
   - Labels show count and percentage.

3. **Score Breakdown Bars** (custom CSS):
   - Four horizontal progress bars.
   - Each bar labeled with factor name and score (e.g., "Price Analysis: 20/25").
   - Fill color matches the score quality.

---

## 12. Security Measures

| Layer | Measure | Implementation |
|---|---|---|
| Authentication | JWT tokens (HS256) | 7-day expiry, server-side verification |
| Passwords | bcrypt hashing | 10 salt rounds, timing-safe comparison |
| Input Validation | express-validator | Email format, password length, query sanitization |
| Rate Limiting | express-rate-limit | API: 100/15min, Search: 10/1min |
| CORS | Express CORS middleware | Configured for frontend origin |
| XSS Prevention | React auto-escaping | JSX safely escapes user content |
| Scraping Safety | Headless browser stealth | Anti-detection plugin, random user agents |
| Error Handling | Generic error responses | No stack traces leaked in production |
| Token Storage | localStorage | Auto-cleared on 401 responses |

---

## 13. Setup & Installation Guide

### Prerequisites

- **Node.js** 18+ installed
- **MongoDB** running locally or a MongoDB Atlas connection string
- **npm** package manager

### Step 1: Clone & Navigate

```bash
cd smart-shopping-ai
```

### Step 2: Configure Environment

Copy or edit the `.env` file in the project root:

```env
MONGO_URI=mongodb://localhost:27017/smart-shopping-ai
JWT_SECRET=your_super_secret_key_here
PORT=5000
```

### Step 3: Install Dependencies

```bash
# Install root dependencies (concurrently)
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install

# Return to root
cd ..
```

### Step 4: Start Development

From the project root:

```bash
npm run dev
```

This runs both server (port 5000) and client (port 3000) concurrently.

### Step 5: Open in Browser

Navigate to `http://localhost:3000`.

1. Register an account.
2. Search for a product (e.g., "wireless headphones").
3. View results from multiple platforms.
4. Click "AI Analysis" on any product.
5. See the authenticity score, verdict, and sentiment breakdown.

### Alternative: Run Separately

```bash
# Terminal 1: Start server
cd server && npm run dev

# Terminal 2: Start client
cd client && npm start
```

---

## 14. Testing Guide

### 14.1 Manual Testing Checklist

#### Authentication
- [ ] Register with valid credentials → Token received, redirected to home
- [ ] Register with duplicate email → Error message shown
- [ ] Login with valid credentials → Token received
- [ ] Login with wrong password → Error message
- [ ] Access protected route without login → Redirected to login
- [ ] Token persists across page refresh

#### Search & Scraping
- [ ] Search for popular product → Results from multiple platforms
- [ ] Search with specific platform filter → Only that platform's results
- [ ] Repeat same search within 1 hour → Cached results (faster)
- [ ] Search with very short query → Validation error

#### AI Analysis
- [ ] Click "AI Analysis" on a result → Score, verdict, and charts displayed
- [ ] Analysis with product at market price → High score
- [ ] Analysis with product well below market price → Low price score
- [ ] Reviews display with correct sentiment labels

#### History
- [ ] Run multiple analyses → All appear in history
- [ ] Pagination works when >10 analyses
- [ ] Click history item → Full analysis detail loads

### 14.2 API Testing with cURL

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"123456"}'

# Login (save the token)
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}' | jq -r '.token')

# Search
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/products/search?q=headphones&platforms=amazon,ebay"

# Analyze
curl -X POST http://localhost:5000/api/analysis/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productName":"Test","productPrice":25,"platform":"amazon","averagePrice":40,"sellerRating":90,"reviewCount":50,"reviews":["Great","Terrible"]}'

# History
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/analysis/history?page=1&limit=5"
```

---

## 15. Known Limitations & Future Work

### 15.1 Current Limitations

| Limitation | Description |
|---|---|
| **Scraping fragility** | E-commerce sites frequently change their HTML structure, which can break scrapers. Requires regular selector maintenance. |
| **No deep review scraping** | Reviews are passed in from the search context; the system doesn't navigate to individual product pages to scrape all reviews. |
| **Rule-based only** | The AI uses predefined rules rather than ML models. While reliable and API-key-free, it's less adaptive than trained models. |
| **AFINN-165 limitations** | The lexicon doesn't understand sarcasm, context, slang, or non-English reviews. |
| **Rate limiting by platforms** | Aggressive scraping can result in IP blocks. The stealth plugin mitigates but doesn't eliminate this. |
| **No image analysis** | Product images are displayed but not analyzed for authenticity (e.g., watermark detection). |
| **USD-centric** | Prices from Daraz (PKR) are converted to USD at a fixed rate. Currency fluctuations are not handled. |

### 15.2 Future Improvements

| Improvement | Description |
|---|---|
| **ML-based scoring** | Replace rule-based scorer with a trained classification model. |
| **NLP review analysis** | Use transformer models (BERT/GPT) for better sentiment und context understanding. |
| **Image analysis** | Integrate image comparison APIs to detect stolen product photos. |
| **Price history** | Track price changes over time and alert users to suspicious price drops. |
| **Browser extension** | Chrome extension that analyzes products directly on the shopping site. |
| **More platforms** | Add Walmart, Target, Flipkart, Shopee, etc. |
| **Email notifications** | Alert users when a product's score changes or a better deal is found. |
| **Admin dashboard** | Monitor scraper health, user analytics, and system metrics. |

---

## 16. References

1. **AFINN-165 Lexicon**: Finn Årup Nielsen (2011). "A new AFINN word list." — Pre-computed sentiment word list with 3,382 entries rated -5 to +5.
   - npm: https://www.npmjs.com/package/sentiment

2. **Puppeteer**: Google Chrome team headless browser automation.
   - Docs: https://pptr.dev/

3. **Cheerio**: Fast, lightweight jQuery-like HTML parser for Node.js.
   - npm: https://www.npmjs.com/package/cheerio

4. **Recharts**: Composable React charting library built on D3.
   - Docs: https://recharts.org/

5. **JSON Web Tokens**: RFC 7519 — Compact URL-safe claims representation.
   - Spec: https://datatracker.ietf.org/doc/html/rfc7519

6. **bcrypt**: Niels Provos and David Mazières (1999). "A Future-Adaptable Password Scheme."
   - npm: https://www.npmjs.com/package/bcryptjs

7. **Express.js**: Fast, unopinionated, minimalist web framework for Node.js.
   - Docs: https://expressjs.com/

8. **MongoDB & Mongoose**: NoSQL document database and ODM.
   - Docs: https://mongoosejs.com/docs/

---

*This documentation was generated for the Smart Shopping AI Final Year Project.*
*Last updated: 2025*
