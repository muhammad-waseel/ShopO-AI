/**
 * History Page
 * ------------
 * Shows the user's past AI analyses, paginated.
 * Each entry links to the full analysis detail.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiClock, FiChevronLeft, FiChevronRight, FiCpu, FiExternalLink, FiSearch, FiShield, FiTrash2, FiMic, FiCamera } from 'react-icons/fi';
import '../components/Shared.css';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { getVerdictColor, getScoreColor, timeAgo, truncateText, formatPrice, PLACEHOLDER_IMG } from '../utils/helpers';
import { toast } from 'react-toastify';
import './History.css';

const AnalysesTab = () => {
  const navigate = useNavigate();

  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchHistory = useCallback(async (pageNum) => {
    setLoading(true);
    try {
      const response = await api.get(`/analysis/history?page=${pageNum}&limit=10`);
      setAnalyses(response.data.analyses);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.totalResults || 0);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  const handleViewDetail = async (analysisId) => {
    try {
      const response = await api.get(`/analysis/${analysisId}`);
      const analysis = response.data;

      // Navigate to product detail page with the analysis data pre-loaded
      navigate('/product', {
        state: {
          product: {
            name: analysis.productName,
            price: analysis.productPrice,
            image: analysis.productImage,
            link: analysis.productLink,
            platform: analysis.platform,
            displayPrice: formatPrice(analysis.productPrice, analysis.platform)
          },
          averagePrice: analysis.averagePrice || 0,
          preloadedAnalysis: analysis // Won't re-fetch if product detail supports this
        }
      });
    } catch (err) {
      toast.error('Failed to load analysis details');
    }
  };

  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>{total} {total === 1 ? 'analysis' : 'analyses'} performed</p>

      {loading ? (
        <LoadingSpinner message="Loading your analysis history..." />
      ) : analyses.length === 0 ? (
        <div className="history-empty">
          <FiCpu size={48} />
          <h3>No Analyses Yet</h3>
          <p>Search for products and run AI analysis to see results here.</p>
          <button className="go-search-btn" onClick={() => navigate('/')}>
            Start Searching
          </button>
        </div>
      ) : (
        <>
          <div className="history-list">
            {analyses.map((item) => (
              <div
                key={item._id}
                className="history-item"
                onClick={() => handleViewDetail(item._id)}
              >
                <div className="history-item-image">
                  <img
                    src={item.productImage || PLACEHOLDER_IMG}
                    alt={item.productName}
                    onError={(e) => { e.target.src = PLACEHOLDER_IMG; }}
                  />
                </div>
                <div className="history-item-info">
                  <h4>{truncateText(item.productName, 80)}</h4>
                  <div className="history-item-meta">
                    <span className="history-platform">{item.platform}</span>
                    <span className="history-price">{formatPrice(item.productPrice, item.platform)}</span>
                    <span className="history-time">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
                <div className="history-item-score">
                  <div
                    className="score-circle"
                    style={{ borderColor: getScoreColor(item.authenticityScore) }}
                  >
                    <span style={{ color: getScoreColor(item.authenticityScore) }}>
                      {item.authenticityScore}
                    </span>
                  </div>
                </div>
                <div className="history-item-verdict">
                  <span
                    className="verdict-pill"
                    style={{
                      background: `${getVerdictColor(item.verdict)}18`,
                      color: getVerdictColor(item.verdict),
                      borderColor: getVerdictColor(item.verdict)
                    }}
                  >
                    {item.verdict}
                  </span>
                </div>
                <div className="history-item-action">
                  <FiExternalLink size={18} />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="history-pagination">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <FiChevronLeft /> Previous
              </button>
              <span className="page-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <FiChevronRight />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
};

/* ---------- Pagination helper ---------- */
const Pager = ({ page, totalPages, setPage }) => totalPages > 1 && (
  <div className="history-pagination">
    <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><FiChevronLeft /> Previous</button>
    <span className="page-info">Page {page} of {totalPages}</span>
    <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next <FiChevronRight /></button>
  </div>
);

/* ---------- Search history (UC-3) ---------- */
const typeIcon = { text: FiSearch, voice: FiMic, image: FiCamera };

const SearchesTab = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await api.get(`/history/searches?page=${p}&limit=15`);
      setRows(res.data.searches);
      setTotalPages(res.data.pagination.totalPages);
      setTotal(res.data.pagination.totalResults);
    } catch (_) {
      toast.error('Failed to load search history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const remove = async (id) => {
    await api.delete(`/history/searches/${id}`).catch(() => {});
    load(page);
  };
  const clearAll = async () => {
    if (!window.confirm('Clear your entire search history?')) return;
    await api.delete('/history/searches').catch(() => {});
    toast.info('Search history cleared');
    setPage(1);
    load(1);
  };

  if (loading) return <LoadingSpinner message="Loading search history..." />;
  if (!rows.length) return (
    <div className="history-empty"><FiSearch size={48} /><h3>No searches yet</h3>
      <button className="go-search-btn" onClick={() => navigate('/')}>Start Searching</button></div>
  );
  return (
    <>
      <div className="card-head">
        <p className="muted">{total} search{total !== 1 ? 'es' : ''}</p>
        <button className="btn-danger btn-sm" onClick={clearAll}><FiTrash2 /> Clear all</button>
      </div>
      <div className="mini-list">
        {rows.map(r => {
          const Icon = typeIcon[r.searchType] || FiSearch;
          return (
            <div key={r._id} className="mini-item">
              <Icon size={20} style={{ color: 'var(--primary)', margin: '0 8px' }} />
              <div className="mini-info">
                <h4>{r.query}</h4>
                <p>{r.resultCount} results · {r.searchType} search · {(r.platforms || []).join(', ')} · {timeAgo(r.createdAt)}</p>
              </div>
              <div className="mini-actions">
                <button className="btn-secondary btn-sm" onClick={() => navigate(`/results?${new URLSearchParams({ q: r.query, platforms: (r.platforms || []).join(',') })}`)}>Search again</button>
                <button className="btn-ghost btn-sm" onClick={() => remove(r._id)} title="Remove"><FiTrash2 /></button>
              </div>
            </div>
          );
        })}
      </div>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </>
  );
};

/* ---------- Verification history ---------- */
const labelColor = (l) => (l === 'Genuine' ? 'green' : /Counterfeit/.test(l) ? 'red' : 'amber');

const VerificationsTab = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get(`/history/verifications?page=${page}&limit=15`)
      .then(res => { setRows(res.data.verifications); setTotalPages(res.data.pagination.totalPages); })
      .catch(() => toast.error('Failed to load verification history'))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <LoadingSpinner message="Loading verifications..." />;
  if (!rows.length) return (
    <div className="history-empty"><FiShield size={48} /><h3>No verifications yet</h3>
      <button className="go-search-btn" onClick={() => navigate('/verify?mode=qr')}>Verify a product</button></div>
  );
  return (
    <>
      <div className="mini-list">
        {rows.map(v => (
          <div key={v._id} className="mini-item">
            <FiShield size={20} style={{ color: 'var(--primary)', margin: '0 8px' }} />
            <div className="mini-info">
              <h4 title={v.subject}>{v.details?.product?.productName || v.subject || 'Uploaded image'}</h4>
              <p>{v.method === 'qr' ? 'QR code' : v.method === 'url' ? 'Product image (URL)' : 'Image upload'}
                {v.category && ` · ${v.category}`} · {v.details?.modelUsed || 'registry lookup'} · {timeAgo(v.createdAt)}</p>
            </div>
            <span className="mini-price">{v.confidence}%</span>
            <span className={`badge ${labelColor(v.resultLabel)}`}>{v.resultLabel}</span>
          </div>
        ))}
      </div>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </>
  );
};

/* ---------- Page ---------- */
const TABS = [
  { id: 'analyses', label: 'AI Analyses', icon: FiCpu },
  { id: 'searches', label: 'Searches', icon: FiSearch },
  { id: 'verifications', label: 'Verifications', icon: FiShield }
];

const History = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'analyses';
  return (
    <div className="history-page">
      <div className="history-header">
        <div className="history-title-row">
          <FiClock size={28} />
          <div>
            <h1>History</h1>
            <p>Your searches, AI analyses and authenticity checks</p>
          </div>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setParams(t.id === 'analyses' ? {} : { tab: t.id })}>
            <t.icon /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'analyses' && <AnalysesTab />}
      {tab === 'searches' && <SearchesTab />}
      {tab === 'verifications' && <VerificationsTab />}
    </div>
  );
};

export default History;
