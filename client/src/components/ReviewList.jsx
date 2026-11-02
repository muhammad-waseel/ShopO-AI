/**
 * ReviewList Component
 * --------------------
 * Displays a scrollable list of individual reviews with their
 * sentiment labels (positive/neutral/negative).
 * 
 * Props:
 *   reviews - Array of { text, score, label } objects
 */

import React from 'react';

// Color for each sentiment label
const labelColors = {
  positive: '#28a745',
  neutral: '#adb5bd',
  negative: '#dc3545'
};

const ReviewList = ({ reviews }) => {
  if (!reviews || reviews.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#888',
        background: '#f8f9fa',
        borderRadius: '12px',
        fontSize: '0.9rem'
      }}>
        No individual reviews available for analysis.
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: '12px', color: '#1a1a2e', fontSize: '1.1rem' }}>
        Individual Review Sentiments ({reviews.length} reviews)
      </h3>
      <div style={{
        maxHeight: '300px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {reviews.map((review, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              background: '#f8f9fa',
              borderRadius: '10px',
              borderLeft: `4px solid ${labelColors[review.label] || '#adb5bd'}`
            }}
          >
            {/* Sentiment indicator */}
            <span style={{
              flexShrink: 0,
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'white',
              background: labelColors[review.label] || '#adb5bd',
              marginTop: '2px'
            }}>
              {review.label}
            </span>
            
            {/* Review text */}
            <p style={{
              margin: 0,
              fontSize: '0.85rem',
              color: '#555',
              lineHeight: 1.5
            }}>
              {review.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReviewList;
