/**
 * History / Dashboard / Recommendations Controller
 *   GET    /api/history/searches            - search history (UC-3)
 *   DELETE /api/history/searches            - clear search history
 *   DELETE /api/history/searches/:id        - delete one entry
 *   GET    /api/history/verifications       - verification history
 *   GET    /api/dashboard                   - unified dashboard summary
 *   GET    /api/recommendations             - personalised recommendations
 */

const SearchHistory = require('../models/SearchHistory');
const VerificationHistory = require('../models/VerificationHistory');
const Analysis = require('../models/Analysis');
const Wishlist = require('../models/Wishlist');
const PriceAlert = require('../models/PriceAlert');

const paginate = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  return { page, limit, skip: (page - 1) * limit };
};

const pageInfo = (page, limit, total) => ({
  currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), totalResults: total, hasMore: page * limit < total
});

const getSearchHistory = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const filter = { user: req.user.userId };
    const [total, searches] = await Promise.all([
      SearchHistory.countDocuments(filter),
      SearchHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-topProducts')
    ]);
    res.json({ searches, pagination: pageInfo(page, limit, total) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching search history.' });
  }
};

const deleteSearchHistory = async (req, res) => {
  try {
    const filter = { user: req.user.userId };
    if (req.params.id) filter._id = req.params.id;
    const r = await SearchHistory.deleteMany(filter);
    res.json({ message: req.params.id ? 'Search removed.' : 'Search history cleared.', deleted: r.deletedCount });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting search history.' });
  }
};

const getVerificationHistory = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const filter = { user: req.user.userId };
    const [total, verifications] = await Promise.all([
      VerificationHistory.countDocuments(filter),
      VerificationHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
    ]);
    res.json({ verifications, pagination: pageInfo(page, limit, total) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching verification history.' });
  }
};

/**
 * Personalised recommendations (TC_AI_REC_01).
 * Takes the best-scored products from the user's recent searches, weighted
 * by recency, removes items already in the wishlist and returns the top N.
 * New users get trending picks from everyone's recent searches.
 */
const buildRecommendations = async (userId, limit = 8) => {
  const recent = await SearchHistory.find({ user: userId, resultCount: { $gt: 0 } })
    .sort({ createdAt: -1 }).limit(15).lean();
  const wish = new Set((await Wishlist.find({ user: userId }).select('link').lean()).map(w => w.link));

  let basedOn = 'history';
  let source = recent;
  if (!recent.length) {
    basedOn = 'trending';
    source = await SearchHistory.find({ resultCount: { $gt: 0 } }).sort({ createdAt: -1 }).limit(15).lean();
  }

  const byLink = new Map();
  source.forEach((s, idx) => {
    const recencyWeight = 1 - idx * 0.03;
    for (const p of s.topProducts || []) {
      if (!p.link || wish.has(p.link)) continue;
      const score = (p.recommendationScore || 0) * recencyWeight;
      const prev = byLink.get(p.link);
      if (!prev || prev.score < score) byLink.set(p.link, { ...p, score: Math.round(score), reason: `Because you searched "${s.query}"`, query: s.query });
    }
  });

  // Keep variety: at most 3 products per query
  const perQuery = {};
  const recs = [...byLink.values()]
    .sort((a, b) => b.score - a.score)
    .filter(p => (perQuery[p.query] = (perQuery[p.query] || 0) + 1) <= 3)
    .slice(0, limit);
  if (basedOn === 'trending') recs.forEach(r => { r.reason = `Trending: "${r.query}"`; });
  return { recommendations: recs, basedOn, recentQueries: [...new Set(recent.map(r => r.query))].slice(0, 5) };
};

const getRecommendations = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    res.json(await buildRecommendations(req.user.userId, limit));
  } catch (error) {
    console.error('Recommendations error:', error.message);
    res.status(500).json({ message: 'Error building recommendations.' });
  }
};

const getDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [searchCount, analysisCount, verificationCount, wishlistCount, activeAlerts, triggered,
      recentSearches, recentAnalyses, recs, wishlistPreview] = await Promise.all([
      SearchHistory.countDocuments({ user: userId }),
      Analysis.countDocuments({ user: userId }),
      VerificationHistory.countDocuments({ user: userId }),
      Wishlist.countDocuments({ user: userId }),
      PriceAlert.countDocuments({ user: userId, status: 'active' }),
      PriceAlert.find({ user: userId, status: 'triggered' }).sort({ triggeredAt: -1 }).limit(5),
      SearchHistory.find({ user: userId }).sort({ createdAt: -1 }).limit(40).select('query searchType platforms resultCount createdAt'),
      Analysis.find({ user: userId }).sort({ createdAt: -1 }).limit(4).select('productName productImage platform authenticityScore verdict createdAt'),
      buildRecommendations(userId, 6),
      Wishlist.find({ user: userId }).sort({ createdAt: -1 }).limit(4)
    ]);
    res.json({
      stats: { searches: searchCount, analyses: analysisCount, verifications: verificationCount, wishlist: wishlistCount, activeAlerts },
      triggeredAlerts: triggered,
      unseenAlerts: triggered.filter(a => !a.seen).length,
      // one chip per distinct query, newest first
      recentSearches: recentSearches.filter((s, i, arr) => arr.findIndex(x => x.query === s.query) === i).slice(0, 8),
      recentAnalyses,
      wishlistPreview,
      ...recs
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    res.status(500).json({ message: 'Error loading dashboard.' });
  }
};

module.exports = { getSearchHistory, deleteSearchHistory, getVerificationHistory, getRecommendations, getDashboard, buildRecommendations };
