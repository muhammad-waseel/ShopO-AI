/**
 * WishlistButton — heart toggle that saves/removes a product (FR9).
 */
import React from 'react';
import { FiHeart } from 'react-icons/fi';
import { useUserData } from '../context/UserDataContext';

const WishlistButton = ({ product, query = '', withLabel = false, className = '' }) => {
  const { isInWishlist, toggleWishlist } = useUserData();
  const saved = isInWishlist(product.link);
  return (
    <button
      type="button"
      className={`wishlist-btn ${saved ? 'saved' : ''} ${withLabel ? 'with-label' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); toggleWishlist(product, query); }}
      title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={saved}
    >
      <FiHeart />
      {withLabel && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
};

export default WishlistButton;
