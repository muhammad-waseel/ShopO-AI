/**
 * ProductCard Component
 * ---------------------
 * Displays a single product in the search results grid.
 * Shows product image, name, price, platform badge, trust score,
 * caution flag, discount badge, and "AI Analysis" button.
 * 
 * Props:
 *   product - Product object from scraper (with trustScore, isCaution, discount)
 *   onAnalyze - Function called when "AI Analysis" button is clicked
 */

import React from 'react';
import { FiExternalLink, FiCpu, FiAlertTriangle, FiBell, FiAward, FiShield } from 'react-icons/fi';
import WishlistButton from './WishlistButton';
import { getPlatformColor, truncateText, getScoreColor, PLACEHOLDER_IMG } from '../utils/helpers';
import './ProductCard.css';

const ProductCard = ({ product, onAnalyze, onAlert, query = '' }) => {
  const {
    name,
    price,
    displayPrice,
    originalPrice,
    discount,
    image,
    link,
    platform,
    rating,
    reviewCount,
    isBestDeal,
    trustScore,
    isCaution,
    cautionReason,
    isBestPick,
    recommendationScore
  } = product;

  // Seller credibility badge (feature 3: seller credibility scores & badges)
  const sellerBadge = isCaution
    ? { label: 'Unverified seller', cls: 'red' }
    : trustScore >= 75 ? { label: 'Trusted seller', cls: 'green' }
    : trustScore >= 45 ? { label: 'Average seller', cls: 'amber' }
    : { label: 'Low trust seller', cls: 'red' };

  return (
    <div className={`product-card ${isBestDeal ? 'best-deal' : ''} ${isBestPick ? 'best-pick' : ''} ${isCaution ? 'caution-card' : ''}`}>
      {/* Best Pick / Best Deal ribbon */}
      {isBestPick ? (
        <div className="best-deal-badge best-pick-badge"><FiAward size={12} /> AI Best Pick</div>
      ) : isBestDeal && (
        <div className="best-deal-badge">Best Deal</div>
      )}

      {/* Wishlist toggle */}
      <WishlistButton product={product} query={query} className="card-wishlist" />

      {/* Caution badge */}
      {isCaution && (
        <div className="caution-badge" title={cautionReason}>
          <FiAlertTriangle size={12} /> Caution
        </div>
      )}

      {/* Discount tag */}
      {discount > 0 && (
        <div className="discount-tag">-{discount}%</div>
      )}

      {/* Product Image */}
      <div className="card-image-wrapper">
        <img
          src={image || PLACEHOLDER_IMG}
          alt={name}
          className="card-image"
          onError={(e) => { e.target.src = PLACEHOLDER_IMG; }}
        />
        {/* Platform badge */}
        <span
          className="platform-badge"
          style={{ backgroundColor: getPlatformColor(platform) }}
        >
          {platform}
        </span>
      </div>

      {/* Product Info */}
      <div className="card-body">
        <h3 className="card-title" title={name}>
          {truncateText(name, 65)}
        </h3>

        <div className="card-price-row">
          <span className="card-price">{displayPrice}</span>
          {originalPrice > price && (
            <span className="card-original-price">
              ${originalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Rating, Reviews & Trust Score */}
        <div className="card-meta">
          {rating > 0 && (
            <span className="meta-rating">⭐ {rating.toFixed(1)}</span>
          )}
          {reviewCount > 0 && (
            <span className="meta-reviews">{reviewCount} reviews</span>
          )}
        </div>

        <div className="card-badges">
          <span className={`badge ${sellerBadge.cls}`}><FiShield size={11} /> {sellerBadge.label}</span>
          {recommendationScore !== undefined && (
            <span className="badge blue" title="AI recommendation score: price + trust + review sentiment">AI {recommendationScore}</span>
          )}
        </div>

        {/* Trust Score Bar */}
        {trustScore !== undefined && (
          <div className="trust-meter">
            <div className="trust-header">
              <span className="trust-label">Trust</span>
              <span className="trust-value" style={{ color: getScoreColor(trustScore) }}>
                {trustScore}/100
              </span>
            </div>
            <div className="trust-bar">
              <div
                className="trust-fill"
                style={{
                  width: `${trustScore}%`,
                  background: getScoreColor(trustScore)
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Caution message */}
        {isCaution && cautionReason && (
          <div className="caution-message">
            <FiAlertTriangle size={12} />
            <span>{cautionReason}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="card-actions">
        <button className="btn-analyze" onClick={() => onAnalyze(product)}>
          <FiCpu /> AI Analysis
        </button>
        {onAlert && (
          <button className="btn-alert" onClick={() => onAlert(product)} title="Set a price-drop alert">
            <FiBell />
          </button>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-view"
          >
            <FiExternalLink /> View
          </a>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
