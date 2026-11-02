/**
 * AIVerdictBadge Component
 * ------------------------
 * Displays the final AI verdict as a large, colored badge.
 * Shows icon + verdict text + suggestion below.
 * 
 * Props:
 *   verdict - "Buy", "Risky", or "Avoid"
 *   suggestion - Human-readable suggestion text from the AI
 */

import React from 'react';
import { FiCheckCircle, FiAlertTriangle, FiXCircle } from 'react-icons/fi';
import { getVerdictColor } from '../utils/helpers';

const verdictConfig = {
  Buy: {
    icon: FiCheckCircle,
    label: 'Safe to Buy',
    bgColor: '#e8f5e9'
  },
  Risky: {
    icon: FiAlertTriangle,
    label: 'Risky Purchase',
    bgColor: '#fff8e1'
  },
  Avoid: {
    icon: FiXCircle,
    label: 'Avoid This Product',
    bgColor: '#fce4ec'
  }
};

const AIVerdictBadge = ({ verdict, suggestion }) => {
  const config = verdictConfig[verdict] || verdictConfig.Risky;
  const Icon = config.icon;
  const color = getVerdictColor(verdict);

  return (
    <div style={{
      background: config.bgColor,
      borderRadius: '16px',
      padding: '24px',
      textAlign: 'center',
      border: `2px solid ${color}20`
    }}>
      {/* Verdict Icon */}
      <Icon size={48} color={color} style={{ marginBottom: '12px' }} />
      
      {/* Verdict Label */}
      <h2 style={{
        color: color,
        fontSize: '1.5rem',
        fontWeight: 700,
        margin: '0 0 4px 0'
      }}>
        {config.label}
      </h2>
      
      {/* Verdict tag */}
      <span style={{
        display: 'inline-block',
        background: color,
        color: 'white',
        padding: '4px 16px',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: 600,
        marginBottom: '16px'
      }}>
        {verdict}
      </span>
      
      {/* Suggestion text */}
      {suggestion && (
        <p style={{
          color: '#555',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          margin: '12px 0 0 0',
          maxWidth: '500px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          {suggestion}
        </p>
      )}
    </div>
  );
};

export default AIVerdictBadge;
