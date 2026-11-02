/**
 * UserData Context
 * ----------------
 * Keeps lightweight per-user data that many components need:
 *   - the set of product links in the wishlist (for the ♥ toggles)
 *   - the number of unseen triggered price alerts (navbar badge)
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';

const UserDataContext = createContext(null);

export const UserDataProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [wishlistLinks, setWishlistLinks] = useState(new Set());
  const [unseenAlerts, setUnseenAlerts] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setWishlistLinks(new Set());
      setUnseenAlerts(0);
      return;
    }
    try {
      const [w, a] = await Promise.all([api.get('/wishlist'), api.get('/alerts')]);
      setWishlistLinks(new Set(w.data.items.map(i => i.link)));
      setUnseenAlerts(a.data.unseenTriggered || 0);
    } catch (_) { /* non-critical */ }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
    if (!isAuthenticated) return undefined;
    const id = setInterval(refresh, 5 * 60 * 1000); // poll for new alert notifications
    return () => clearInterval(id);
  }, [refresh, isAuthenticated]);

  const isInWishlist = (link) => wishlistLinks.has(link);

  const toggleWishlist = async (product, query = '') => {
    if (!product?.link) {
      toast.error('This product has no link and cannot be saved.');
      return;
    }
    try {
      if (wishlistLinks.has(product.link)) {
        await api.delete('/wishlist', { params: { link: product.link } });
        setWishlistLinks(prev => { const n = new Set(prev); n.delete(product.link); return n; });
        toast.info('Removed from wishlist');
      } else {
        await api.post('/wishlist', {
          name: product.name, price: product.price, displayPrice: product.displayPrice, image: product.image,
          link: product.link, platform: product.platform, rating: product.rating, reviewCount: product.reviewCount,
          trustScore: product.trustScore, query
        });
        setWishlistLinks(prev => new Set(prev).add(product.link));
        toast.success('Saved to wishlist');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update wishlist.');
    }
  };

  return (
    <UserDataContext.Provider value={{ wishlistLinks, isInWishlist, toggleWishlist, unseenAlerts, setUnseenAlerts, refresh }}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error('useUserData must be used within UserDataProvider');
  return ctx;
};
