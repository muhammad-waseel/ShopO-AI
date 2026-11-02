/**
 * PriceAlertModal — set a target price for a product (FR10).
 * We re-check the price periodically and email the user when it drops.
 */
import React, { useState } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';

const PriceAlertModal = ({ product, query = '', onClose }) => {
  const { user } = useAuth();
  const { refresh } = useUserData();
  const suggested = Math.max(0.01, Math.floor(product.price * 0.9 * 100) / 100);
  const [target, setTarget] = useState(suggested);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const t = parseFloat(target);
    if (!(t > 0)) { toast.warning('Please enter a valid target price.'); return; }
    setSaving(true);
    try {
      const res = await api.post('/alerts', {
        productName: product.name, productLink: product.link, productImage: product.image,
        platform: product.platform, query, targetPrice: t, currentPrice: product.price
      });
      toast.success(res.data.message);
      refresh();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create alert.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><FiX /></button>
        <h3><FiBell /> Set price alert</h3>
        <p className="modal-product">{product.name}</p>
        <p className="modal-meta">Current price on {product.platform}: <strong>${product.price.toFixed(2)}</strong></p>
        <label className="field">
          <span>Notify me when the price drops to (USD)</span>
          <input type="number" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
        </label>
        <div className="quick-targets">
          {[5, 10, 20].map(pct => (
            <button type="button" key={pct} onClick={() => setTarget((product.price * (1 - pct / 100)).toFixed(2))}>-{pct}%</button>
          ))}
        </div>
        <p className="modal-hint">
          {user?.preferences?.emailAlerts === false
            ? 'Email alerts are turned off in your profile — you will see in-app notifications only.'
            : `We'll email ${user?.email} when the price reaches your target.`}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create alert'}</button>
        </div>
      </form>
    </div>
  );
};

export default PriceAlertModal;
