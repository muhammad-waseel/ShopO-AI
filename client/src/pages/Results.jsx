/**
 * Results Page  (Real-Time Price Comparison Dashboard)
 * ----------------------------------------------------
 * Displays search results from all platforms with:
 *   - the AI "Best Pick" highlighted at the top (price + trust + sentiment)
 *   - sorting (relevance / AI score / price / rating / trust)
 *   - filtering by platform, price range, minimum rating, hide-risky
 *   - grid view and a comparison-table view
 *   - wishlist hearts and price-alert buttons on every product
 *   - cache controls ("From Cache" / Refresh)
 *
 * Search parameters live in the URL (?q=...&platforms=...&type=...) so the
 * page survives a refresh and can be bookmarked or shared.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiSearch, FiFilter, FiAlertCircle, FiRefreshCw, FiDatabase, FiZap, FiGrid, FiList,
  FiAward, FiCpu, FiExternalLink, FiBell, FiMic, FiCamera
} from 'react-icons/fi';
import api from '../services/api';
import ProductCard from '../components/ProductCard';
import LoadingSpinner from '../components/LoadingSpinner';
import SearchBar from '../components/SearchBar';
import WishlistButton from '../components/WishlistButton';
import PriceAlertModal from '../components/PriceAlertModal';
import { toast } from 'react-toastify';
import { timeAgo, getPlatformColor, getScoreColor, truncateText, PLACEHOLDER_IMG } from '../utils/helpers';
import '../components/Shared.css';
import './Results.css';

const ALL_PLATFORMS = ['aliexpress', 'ebay', 'amazon', 'daraz'];

const SORTS = {
  relevance: { label: 'Relevance', fn: null },
  ai: { label: 'AI recommendation', fn: (a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0) },
  priceAsc: { label: 'Price: low to high', fn: (a, b) => a.price - b.price },
  priceDesc: { label: 'Price: high to low', fn: (a, b) => b.price - a.price },
  rating: { label: 'Rating', fn: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0) },
  trust: { label: 'Seller trust', fn: (a, b) => (b.trustScore || 0) - (a.trustScore || 0) }
};

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL params first, then router state (older links), then defaults
  const legacy = location.state || {};
  const query = searchParams.get('q') || legacy.query || '';
  const platformsKey = searchParams.get('platforms') || (legacy.platforms || []).join(',') || ALL_PLATFORMS.join(',');
  const searchType = searchParams.get('type') || 'text';

  const [products, setProducts] = useState([]);
  const [bestPick, setBestPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [platformResults, setPlatformResults] = useState({});
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [responseTime, setResponseTime] = useState(null);

  // Filters & view
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [hideRisky, setHideRisky] = useState(false);
  const [view, setView] = useState('grid');
  const [alertProduct, setAlertProduct] = useState(null);

  const fetchProducts = useCallback(async (forceRefresh = false) => {
    if (!query) {
      navigate('/');
      return;
    }
    if (forceRefresh) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const response = await api.get('/products/search', {
        params: { q: query, platforms: platformsKey, searchType, ...(forceRefresh && { forceRefresh: 'true' }) }
      });
      const list = response.data.products || [];
      setProducts(list);
      setBestPick(response.data.bestPick || null);
      setPlatformResults(response.data.platformResults || {});
      setIsCached(response.data.cached || false);
      setCachedAt(response.data.cachedAt || null);
      setResponseTime(response.data.responseTimeMs ?? null);
      if (list.length === 0) setError('No products found. Try a different search term.');
      if (forceRefresh) toast.success('Results refreshed with latest data!');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to fetch products. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, platformsKey, searchType, navigate]);

  useEffect(() => {
    setPlatformFilter('all');
    fetchProducts(false);
  }, [fetchProducts]);

  const handleRefresh = () => {
    if (refreshing || loading) return;
    fetchProducts(true);
  };

  const handleNewSearch = (q, type) => {
    setSearchParams({ q, platforms: platformsKey, type });
  };

  const averagePrice = useMemo(
    () => (products.length ? products.reduce((sum, p) => sum + p.price, 0) / products.length : 0),
    [products]
  );

  const handleAnalyze = (product) => {
    navigate('/product', { state: { product, averagePrice: averagePrice || product.price, allProducts: products, query } });
  };

  const availablePlatforms = [...new Set(products.map(p => p.platform))];

  const visibleProducts = useMemo(() => {
    let list = products.filter(p => {
      if (platformFilter !== 'all' && p.platform.toLowerCase() !== platformFilter) return false;
      if (minPrice !== '' && p.price < parseFloat(minPrice)) return false;
      if (maxPrice !== '' && p.price > parseFloat(maxPrice)) return false;
      if (minRating > 0 && (p.rating || 0) < minRating) return false;
      if (hideRisky && p.isCaution) return false;
      return true;
    });
    if (SORTS[sortBy].fn) list = [...list].sort(SORTS[sortBy].fn);
    return list;
  }, [products, platformFilter, minPrice, maxPrice, minRating, hideRisky, sortBy]);

  const cheapest = products.length ? products.reduce((m, p) => (p.price < m.price ? p : m), products[0]) : null;
  const filtersActive = platformFilter !== 'all' || minPrice !== '' || maxPrice !== '' || minRating > 0 || hideRisky;
  const resetFilters = () => { setPlatformFilter('all'); setMinPrice(''); setMaxPrice(''); setMinRating(0); setHideRisky(false); };

  const TypeIcon = searchType === 'voice' ? FiMic : searchType === 'image' ? FiCamera : FiSearch;

  return (
    <div className="results-page">
      <div className="results-header">
        <div className="results-header-content">
          <div className="results-header-left">
            <h1 className="results-title">
              <TypeIcon /> Results for "{query}"
            </h1>
            <p className="results-count">
              {visibleProducts.length} of {products.length} product{products.length !== 1 ? 's' : ''}
              {searchType !== 'text' && <> · found by {searchType} search</>}
              {responseTime !== null && !loading && <> · {(responseTime / 1000).toFixed(1)}s</>}
            </p>
          </div>

          <div className="cache-controls">
            {!loading && products.length > 0 && (
              <div className={`cache-badge ${isCached ? 'cached' : 'fresh'}`}>
                {isCached ? <FiDatabase size={14} /> : <FiZap size={14} />}
                <span>{isCached ? 'From Cache' : 'Fresh Results'}</span>
                {isCached && cachedAt && <span className="cache-time">({timeAgo(cachedAt)})</span>}
              </div>
            )}
            {!loading && products.length > 0 && (
              <button
                className={`btn-refresh ${refreshing ? 'spinning' : ''}`}
                onClick={handleRefresh}
                disabled={refreshing}
                title="Force refresh — re-scrape all platforms for latest data"
              >
                <FiRefreshCw className="refresh-icon" />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>
        <div className="results-searchbar">
          <SearchBar compact initialQuery={query} onSearch={handleNewSearch} />
        </div>
      </div>

      <div className="results-container">
        <aside className="filters-sidebar">
          <h3 className="filter-title">
            <FiFilter /> Filters
            {filtersActive && <button className="btn-ghost btn-sm" onClick={resetFilters}>Reset</button>}
          </h3>

          <div className="filter-group">
            <h4>Platform</h4>
            <label className={`filter-option ${platformFilter === 'all' ? 'active' : ''}`}>
              <input type="radio" name="platform" checked={platformFilter === 'all'} onChange={() => setPlatformFilter('all')} />
              All Platforms ({products.length})
            </label>
            {availablePlatforms.map(platform => {
              const count = products.filter(p => p.platform === platform).length;
              return (
                <label key={platform} className={`filter-option ${platformFilter === platform.toLowerCase() ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="platform"
                    checked={platformFilter === platform.toLowerCase()}
                    onChange={() => setPlatformFilter(platform.toLowerCase())}
                  />
                  {platform} ({count})
                </label>
              );
            })}
          </div>

          <div className="filter-group">
            <h4>Price (USD)</h4>
            <div className="price-range">
              <input type="number" min="0" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <span>–</span>
              <input type="number" min="0" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
          </div>

          <div className="filter-group">
            <h4>Minimum rating</h4>
            <div className="rating-filter">
              {[0, 3, 4, 4.5].map(r => (
                <button key={r} className={minRating === r ? 'active' : ''} onClick={() => setMinRating(r)}>
                  {r === 0 ? 'Any' : `${r}★+`}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-option checkbox">
              <input type="checkbox" checked={hideRisky} onChange={(e) => setHideRisky(e.target.checked)} />
              Hide risky listings
            </label>
          </div>

          <div className="filter-group">
            <h4>Data Source</h4>
            <div className="data-source-info">
              {isCached ? (
                <p className="source-text">
                  <FiDatabase size={14} /> Showing cached results.
                  {cachedAt && <><br /><small>Cached {timeAgo(cachedAt)}</small></>}
                </p>
              ) : (
                <p className="source-text"><FiZap size={14} /> Showing freshly scraped data.</p>
              )}
              <button className="btn-sidebar-refresh" onClick={handleRefresh} disabled={refreshing || loading}>
                <FiRefreshCw size={14} />
                {refreshing ? 'Refreshing...' : 'Get Fresh Data'}
              </button>
            </div>
          </div>

          {Object.keys(platformResults).length > 0 && (
            <div className="filter-group">
              <h4>Scraping Status</h4>
              {Object.entries(platformResults).map(([platform, result]) => (
                <div key={platform} className="platform-status">
                  <span className={`status-dot ${result.status}`}></span>
                  <span>{platform}: {result.count} found</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="results-main">
          {loading ? (
            <LoadingSpinner message="Searching across platforms... This may take a moment." />
          ) : refreshing ? (
            <LoadingSpinner message="Refreshing results — re-scraping all platforms..." />
          ) : error && products.length === 0 ? (
            <div className="empty-state">
              <FiAlertCircle size={48} />
              <h3>No Results</h3>
              <p>{error}</p>
              <button className="btn-back-home" onClick={() => navigate('/')}>Try Another Search</button>
            </div>
          ) : (
            <>
              {/* Recommended product highlight (report §7.3.1) */}
              {bestPick && !filtersActive && (
                <div className="best-pick-panel">
                  <img
                    src={bestPick.image || PLACEHOLDER_IMG}
                    alt={bestPick.name}
                    onError={(e) => { e.target.src = PLACEHOLDER_IMG; }}
                  />
                  <div className="best-pick-info">
                    <span className="best-pick-label"><FiAward /> AI Best Pick</span>
                    <h3 title={bestPick.name}>{truncateText(bestPick.name, 90)}</h3>
                    <div className="best-pick-meta">
                      <strong>{bestPick.displayPrice}</strong>
                      <span className="platform-pill" style={{ background: getPlatformColor(bestPick.platform) }}>{bestPick.platform}</span>
                      {bestPick.rating > 0 && <span>⭐ {bestPick.rating.toFixed(1)}</span>}
                      {cheapest && cheapest.link === bestPick.link && <span className="badge green">Lowest price</span>}
                    </div>
                    {bestPick.scoreBreakdown && (
                      <div className="score-bars">
                        {[['Price', bestPick.scoreBreakdown.price], ['Trust', bestPick.scoreBreakdown.trust],
                          [bestPick.scoreBreakdown.sentimentSource === 'reviews' ? 'Review sentiment' : 'Rating', bestPick.scoreBreakdown.sentiment]
                        ].map(([label, v]) => (
                          <div key={label} className="score-bar">
                            <span>{label}</span>
                            <div><i style={{ width: `${v}%`, background: getScoreColor(v) }} /></div>
                            <b>{v}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="best-pick-actions">
                    <div className="best-pick-score" style={{ borderColor: getScoreColor(bestPick.recommendationScore) }}>
                      <b>{bestPick.recommendationScore}</b><small>AI score</small>
                    </div>
                    <button className="btn-primary" onClick={() => handleAnalyze(bestPick)}><FiCpu /> Analyze</button>
                    <div className="row-actions">
                      <WishlistButton product={bestPick} query={query} />
                      <button className="btn-alert" onClick={() => setAlertProduct(bestPick)} title="Price alert"><FiBell /></button>
                      {bestPick.link && <a className="btn-alert view" href={bestPick.link} target="_blank" rel="noopener noreferrer" title="View"><FiExternalLink /></a>}
                    </div>
                  </div>
                </div>
              )}

              <div className="results-toolbar">
                <label>
                  Sort by
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <div className="view-toggle">
                  <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid view"><FiGrid /></button>
                  <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} title="Comparison table"><FiList /></button>
                </div>
              </div>

              {visibleProducts.length === 0 ? (
                <div className="empty-state">
                  <FiFilter size={40} />
                  <h3>No products match these filters</h3>
                  <button className="btn-back-home" onClick={resetFilters}>Reset filters</button>
                </div>
              ) : view === 'grid' ? (
                <div className="products-grid">
                  {visibleProducts.map((product, index) => (
                    <ProductCard
                      key={`${product.platform}-${product.link || index}`}
                      product={product}
                      query={query}
                      onAnalyze={handleAnalyze}
                      onAlert={setAlertProduct}
                    />
                  ))}
                </div>
              ) : (
                <div className="compare-table-wrapper">
                  <table className="compare-table">
                    <thead>
                      <tr><th>Product</th><th>Platform</th><th>Price</th><th>Rating</th><th>Trust</th><th>AI</th><th></th></tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((p, i) => (
                        <tr key={`${p.platform}-${p.link || i}`} className={p.isBestPick ? 'best' : p.isCaution ? 'risky' : ''}>
                          <td className="ct-product">
                            <img src={p.image || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                            <span title={p.name}>{truncateText(p.name, 70)}</span>
                            {p.isBestPick && <span className="badge blue"><FiAward size={11} /> Best</span>}
                            {p.isCaution && <span className="badge red">Risky</span>}
                          </td>
                          <td><span className="platform-pill" style={{ background: getPlatformColor(p.platform) }}>{p.platform}</span></td>
                          <td className="ct-price">
                            {p.displayPrice}
                            {cheapest && p.link === cheapest.link && <small className="lowest">lowest</small>}
                          </td>
                          <td>{p.rating > 0 ? `⭐ ${p.rating.toFixed(1)}` : '—'}{p.reviewCount > 0 && <small> ({p.reviewCount})</small>}</td>
                          <td style={{ color: getScoreColor(p.trustScore || 0), fontWeight: 600 }}>{p.trustScore ?? '—'}</td>
                          <td style={{ fontWeight: 700 }}>{p.recommendationScore ?? '—'}</td>
                          <td className="ct-actions">
                            <WishlistButton product={p} query={query} />
                            <button className="btn-alert" onClick={() => setAlertProduct(p)} title="Price alert"><FiBell /></button>
                            <button className="btn-alert view" onClick={() => handleAnalyze(p)} title="AI analysis"><FiCpu /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {alertProduct && <PriceAlertModal product={alertProduct} query={query} onClose={() => setAlertProduct(null)} />}
    </div>
  );
};

export default Results;
