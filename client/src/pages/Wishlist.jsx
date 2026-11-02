/**
 * Wishlist Page  (FR9)
 * Saved products persist across sessions. From here users can open the
 * product, compare prices again, set a price alert, or remove it.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiHeart, FiExternalLink, FiTrash2, FiBell, FiSearch } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import PriceAlertModal from '../components/PriceAlertModal';
import { useUserData } from '../context/UserDataContext';
import { getPlatformColor, timeAgo, getScoreColor, PLACEHOLDER_IMG } from '../utils/helpers';
import '../components/Shared.css';

const Wishlist = () => {
  const navigate = useNavigate();
  const { refresh } = useUserData();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertProduct, setAlertProduct] = useState(null);

  useEffect(() => {
    api.get('/wishlist')
      .then(res => setItems(res.data.items))
      .catch(() => toast.error('Failed to load wishlist'))
      .finally(() => setLoading(false));
  }, []);

  const remove = async (id) => {
    try {
      await api.delete(`/wishlist/${id}`);
      setItems(prev => prev.filter(i => i._id !== id));
      refresh();
      toast.info('Removed from wishlist');
    } catch (_) {
      toast.error('Could not remove item');
    }
  };

  const total = items.reduce((s, i) => s + i.price, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1><FiHeart /> My Wishlist</h1>
          <p>{items.length} saved product{items.length !== 1 ? 's' : ''}{items.length > 0 && ` · total $${total.toFixed(2)}`}</p>
        </div>
      </div>

      {loading ? <LoadingSpinner message="Loading wishlist..." /> : items.length === 0 ? (
        <div className="card empty">
          <FiHeart size={44} />
          <h3>Your wishlist is empty</h3>
          <p>Tap the heart on any product in search results to save it here.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>Start searching</button>
        </div>
      ) : (
        <div className="mini-list">
          {items.map(item => (
            <div key={item._id} className="mini-item">
              <img src={item.image || PLACEHOLDER_IMG} alt="" onError={(e) => { e.target.src = PLACEHOLDER_IMG; }} />
              <div className="mini-info">
                <h4 title={item.name}>{item.name}</h4>
                <p>
                  <span className="platform-pill" style={{ background: getPlatformColor(item.platform), color: '#fff', padding: '1px 8px', borderRadius: 999, fontSize: '.7rem', marginRight: 6 }}>{item.platform}</span>
                  {item.rating > 0 && <>⭐ {item.rating.toFixed(1)} · </>}
                  {item.trustScore > 0 && <span style={{ color: getScoreColor(item.trustScore) }}>Trust {item.trustScore} · </span>}
                  saved {timeAgo(item.createdAt)}
                </p>
              </div>
              <span className="mini-price">{item.displayPrice || `$${item.price.toFixed(2)}`}</span>
              <div className="mini-actions">
                <button className="btn-ghost btn-sm" title="Price alert" onClick={() => setAlertProduct(item)}><FiBell /></button>
                {item.query && (
                  <button className="btn-ghost btn-sm" title="Compare prices again"
                    onClick={() => navigate(`/results?${new URLSearchParams({ q: item.query })}`)}><FiSearch /></button>
                )}
                <a className="btn-ghost btn-sm" href={item.link} target="_blank" rel="noopener noreferrer" title="Open store"><FiExternalLink /></a>
                <button className="btn-danger btn-sm" title="Remove" onClick={() => remove(item._id)}><FiTrash2 /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {alertProduct && <PriceAlertModal product={alertProduct} query={alertProduct.query} onClose={() => setAlertProduct(null)} />}
    </div>
  );
};

export default Wishlist;
