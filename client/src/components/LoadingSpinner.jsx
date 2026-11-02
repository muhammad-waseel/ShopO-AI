/**
 * LoadingSpinner Component
 * ------------------------
 * A simple CSS-based loading spinner with optional message text.
 * 
 * Props:
 *   message - Optional text to show below the spinner (default: "Loading...")
 */

import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <div className="spinner-container">
      <div className="spinner"></div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
