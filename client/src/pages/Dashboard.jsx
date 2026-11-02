/**
 * Dashboard  (Unified User Dashboard — feature 7)
 * -----------------------------------------------
 * One place for: search, stats, price-drop notifications, personalised
 * recommendations, recent searches, recent analyses and wishlist preview.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiGrid, FiSearch, FiCpu, FiShield, FiHeart, FiBell, FiTrendingDown, FiStar, FiClock, FiMic, FiCamera, FiArrowRight
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';
import SearchBar from '../components/SearchBar';
import WishlistButton from '../components/WishlistButton';
import LoadingSpinner from '../components/LoadingSpinner';
import { getVerdictColor, getScoreColor, timeAgo, truncateText, getPlatformColor, PLACEHOLDER_IMG } from '../utils/helpers';
import '../components/Shared.css';
import './Dashboard.css';

const typeIcon = { text: FiSearch, voice: FiMic, image: FiCamera };

const Dashboard = () => {
  const { user } = useAuth();
  const { setUnseenAlerts } = useUserData();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/dashboard');
        setData(res.data);
      } catch (err) {
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const platforms = (user?.preferences?.defaultPlatforms || ['aliexpress', 'ebay', 'amazon', 'daraz']).join(',');
  const runSearch = (q, type = 'text') => navigate(`/results?${new URLSearchParams({ q, platforms, type })}`);

  const dismissAlerts = async () => {
    await api.post('/alerts/mark-seen').catch(() => {});
    setUnseenAlerts(0);
    setData(d => ({ ...d, unseenAlerts: 0, triggeredAlerts: d.triggeredAlerts.map(a => ({ ...a, seen: true })) }));
  };

  if (loading) return <LoadingSpinner message="Loading your dashboard..." />;
  if (!data) return null;

  const stats = [
    { label: 'Searches', value: data.stats.searches, icon: FiSearch, to: '/history?tab=searches' },
    { label: 'AI analyses', value: data.stats.analyses, icon: FiCpu, to: '/history' },
    { label: 'Verifications', value: data.stats.verifications, icon: FiShield, to: '/history?tab=verifications' },
    { label: 'Wishlist', value: data.stats.wishlist, icon: FiHeart, to: '/wishlist' },
    { label: 'Active alerts', value: data.stats.activeAlerts, icon: FiBell, to: '/alerts' }
  ];

  return (
    <div className="page dashboard">
      <div className="dash-hero">
        <div>
          <h1><FiGrid /> Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p>Compare prices, verify products and track deals — all in one place.</p>
        </div>
        <div className="dash-search"><SearchBar compact onSearch={runSearch} /></div>
      </div>

      <div className="stat-grid">
        {stats.map(s => (
          <Link key={s.label} to={s.to} className="stat-card">
            <s.icon />
            <b>{s.value}</b>
            <span>{s.label}</span>
          </Link>
        ))}
      </div>

      {data.triggeredAlerts.length > 0 && (
        <div className={`card alert-banner ${data.unseenAlerts ? 'unseen' : ''}`}>
          <div className="card-head">
            <h3><FiTrendingDown /> Price drops {data.unseenAlerts > 0 && <span className="badge red">{data.unseenAlerts} new</span>}</h3>
            {data.unseenAlerts > 0 && <button className="btn-ghost btn-sm" onClick={dismissAlerts}>Mark as read</button>}
          </div>
          <div className="mini-list">
            {data.triggeredAlerts.map(a => (
              <div key={a._id} className="mini-item">
                <img src={a.productImage || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                <div className="mini-info">
                  <h4 title={a.productName}>{a.productName}</h4>
                  <p>Dropped to ${a.currentPrice.toFixed(2)} (target ${a.targetPrice.toFixed(2)}) · {timeAgo(a.triggeredAt)}</p>
                </div>
                {a.productLink && <a className="btn-primary btn-sm" href={a.productLink} target="_blank" rel="noopener noreferrer">Buy now</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2><FiStar /> {data.basedOn === 'history' ? 'Recommended for you' : 'Trending picks'}</h2>
          {data.recentQueries?.length > 0 && <span className="muted">Based on: {data.recentQueries.slice(0, 3).join(', ')}</span>}
        </div>
        {data.recommendations.length === 0 ? (
          <div className="empty">
            <FiStar size={36} />
            <h3>No recommendations yet</h3>
            <p>Search for a few products and we'll suggest the best-rated, best-priced options.</p>
          </div>
        ) : (
          <div className="rec-grid">
            {data.recommendations.map(r => (
              <div key={r.link} className="rec-card">
                <WishlistButton product={r} query={r.query} className="rec-heart" />
                <img src={r.image || PLACEHOLDER_IMG} alt={r.name} onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                <span className="platform-pill" style={{ background: getPlatformColor(r.platform) }}>{r.platform}</span>
                <h4 title={r.name}>{truncateText(r.name, 60)}</h4>
                <div className="rec-meta">
                  <strong>{r.displayPrice || `$${r.price?.toFixed(2)}`}</strong>
                  {r.rating > 0 && <span>⭐ {r.rating.toFixed(1)}</span>}
                  <span className="badge blue">AI {r.recommendationScore}</span>
                </div>
                <small className="muted">{r.reason}</small>
                <div className="rec-actions">
                  <button className="btn-secondary btn-sm" onClick={() => runSearch(r.query)}>Compare</button>
                  {r.link && <a className="btn-primary btn-sm" href={r.link} target="_blank" rel="noopener noreferrer">View</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3><FiClock /> Recent searches</h3>
            <Link to="/history?tab=searches" className="btn-ghost btn-sm">All <FiArrowRight /></Link>
          </div>
          {data.recentSearches.length === 0 ? <p className="muted">No searches yet.</p> : (
            <div className="chips">
              {data.recentSearches.map(s => {
                const Icon = typeIcon[s.searchType] || FiSearch;
                return (
                  <button key={s._id} className="chip" onClick={() => runSearch(s.query)} title={`${s.resultCount} results · ${timeAgo(s.createdAt)}`}>
                    <Icon size={13} /> {s.query}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3><FiCpu /> Recent analyses</h3>
            <Link to="/history" className="btn-ghost btn-sm">All <FiArrowRight /></Link>
          </div>
          {data.recentAnalyses.length === 0 ? <p className="muted">Run an AI analysis on any product to see it here.</p> : (
            <div className="mini-list">
              {data.recentAnalyses.map(a => (
                <div key={a._id} className="mini-item">
                  <img src={a.productImage || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                  <div className="mini-info">
                    <h4 title={a.productName}>{a.productName}</h4>
                    <p>{a.platform} · {timeAgo(a.createdAt)}</p>
                  </div>
                  <span className="mini-price" style={{ color: getScoreColor(a.authenticityScore) }}>{a.authenticityScore}</span>
                  <span className="badge" style={{ background: `${getVerdictColor(a.verdict)}22`, color: getVerdictColor(a.verdict) }}>{a.verdict}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3><FiHeart /> Wishlist</h3>
          <Link to="/wishlist" className="btn-ghost btn-sm">Manage <FiArrowRight /></Link>
        </div>
        {data.wishlistPreview.length === 0 ? <p className="muted">Tap the ♥ on any product to save it here.</p> : (
          <div className="mini-list">
            {data.wishlistPreview.map(w => (
              <div key={w._id} className="mini-item">
                <img src={w.image || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                <div className="mini-info">
                  <h4 title={w.name}>{w.name}</h4>
                  <p>{w.platform} · saved {timeAgo(w.createdAt)}</p>
                </div>
                <span className="mini-price">{w.displayPrice || `$${w.price.toFixed(2)}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="quick-links">
        <Link to="/verify" className="card quick-link"><FiShield /> Verify a product (QR / image)</Link>
        <Link to="/alerts" className="card quick-link"><FiBell /> Manage price alerts</Link>
        <Link to="/profile" className="card quick-link"><FiGrid /> Profile & notification settings</Link>
      </div>
    </div>
  );
};

export default Dashboard;
