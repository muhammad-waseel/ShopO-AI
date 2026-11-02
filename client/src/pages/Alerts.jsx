/**
 * Price Alerts Page  (FR10)
 * Lists all alerts with status, current/lowest/target price, and lets the
 * user change the target, pause/resume, delete, or check prices now.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiPause, FiPlay, FiTrash2, FiRefreshCw, FiExternalLink, FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useUserData } from '../context/UserDataContext';
import { useAuth } from '../context/AuthContext';
import { timeAgo, PLACEHOLDER_IMG } from '../utils/helpers';
import '../components/Shared.css';

const statusBadge = { active: 'blue', triggered: 'green', paused: 'gray' };

const Alerts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setUnseenAlerts } = useUserData();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/alerts');
        setAlerts(res.data.alerts);
        if (res.data.unseenTriggered) {
          await api.post('/alerts/mark-seen');
          setUnseenAlerts(0);
        }
      } catch (_) {
        toast.error('Failed to load alerts');
      } finally {
        setLoading(false);
      }
    })();
  }, [setUnseenAlerts]);

  const replace = (a) => setAlerts(prev => prev.map(x => (x._id === a._id ? a : x)));

  const patch = async (id, body) => {
    try {
      const res = await api.patch(`/alerts/${id}`, body);
      replace(res.data.alert);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/alerts/${id}`);
      setAlerts(prev => prev.filter(a => a._id !== id));
      toast.info('Alert deleted');
    } catch (_) {
      toast.error('Delete failed');
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await api.post('/alerts/check');
      setAlerts(res.data.alerts);
      toast[res.data.triggered ? 'success' : 'info'](
        res.data.triggered ? `${res.data.triggered} price drop(s) found!` : `Checked ${res.data.checked} alert(s) — no drops yet.`
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Price check failed');
    } finally {
      setChecking(false);
    }
  };

  const saveTarget = (id) => {
    patch(id, { targetPrice: editValue });
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1><FiBell /> Price Alerts</h1>
          <p>
            Prices are re-checked automatically every 30 minutes.
            {user?.preferences?.emailAlerts !== false ? ` Notifications go to ${user?.email}.` : ' Email notifications are off (see Profile).'}
          </p>
        </div>
        {alerts.some(a => a.status === 'active') && (
          <button className="btn-primary" onClick={checkNow} disabled={checking}>
            <FiRefreshCw className={checking ? 'spin' : ''} /> {checking ? 'Checking…' : 'Check prices now'}
          </button>
        )}
      </div>

      {loading ? <LoadingSpinner message="Loading alerts..." /> : alerts.length === 0 ? (
        <div className="card empty">
          <FiBell size={44} />
          <h3>No price alerts yet</h3>
          <p>Use the 🔔 button on any product to get notified when its price drops.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>Find a product</button>
        </div>
      ) : (
        <div className="mini-list">
          {alerts.map(a => {
            const drop = a.initialPrice > 0 ? Math.round(((a.initialPrice - a.currentPrice) / a.initialPrice) * 100) : 0;
            return (
              <div key={a._id} className="mini-item" style={a.status === 'triggered' ? { borderColor: '#2ecc71', background: '#f4fcf7' } : undefined}>
                <img src={a.productImage || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
                <div className="mini-info">
                  <h4 title={a.productName}>{a.productName}</h4>
                  <p>
                    <span className={`badge ${statusBadge[a.status]}`}>{a.status}</span>{' '}
                    {a.platform} · now <strong>${a.currentPrice.toFixed(2)}</strong>
                    {drop !== 0 && <span style={{ color: drop > 0 ? '#1e8449' : '#c0392b' }}> ({drop > 0 ? '-' : '+'}{Math.abs(drop)}%)</span>}
                    {a.lowestPrice > 0 && <> · lowest ${a.lowestPrice.toFixed(2)}</>}
                    {a.lastCheckedAt && <> · checked {timeAgo(a.lastCheckedAt)}</>}
                    {a.triggeredAt && <> · triggered {timeAgo(a.triggeredAt)}</>}
                    {a.lastError && a.status === 'active' && <span style={{ color: '#b9770e' }}> · {a.lastError}</span>}
                  </p>
                </div>
                <div className="mini-actions">
                  {editing === a._id ? (
                    <>
                      <input type="number" min="0.01" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        style={{ width: 90, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }} autoFocus />
                      <button className="btn-ghost btn-sm" onClick={() => saveTarget(a._id)} title="Save"><FiCheck /></button>
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(null)} title="Cancel"><FiX /></button>
                    </>
                  ) : (
                    <button className="btn-secondary btn-sm" onClick={() => { setEditing(a._id); setEditValue(a.targetPrice); }} title="Edit target">
                      Target ${a.targetPrice.toFixed(2)} <FiEdit2 size={12} />
                    </button>
                  )}
                  {a.status === 'paused'
                    ? <button className="btn-ghost btn-sm" onClick={() => patch(a._id, { status: 'active' })} title="Resume"><FiPlay /></button>
                    : a.status === 'active' && <button className="btn-ghost btn-sm" onClick={() => patch(a._id, { status: 'paused' })} title="Pause"><FiPause /></button>}
                  {a.productLink && <a className="btn-ghost btn-sm" href={a.productLink} target="_blank" rel="noopener noreferrer" title="Open store"><FiExternalLink /></a>}
                  <button className="btn-danger btn-sm" onClick={() => remove(a._id)} title="Delete"><FiTrash2 /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Alerts;
