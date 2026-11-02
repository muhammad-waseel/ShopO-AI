/**
 * AuthenticityGauge Component
 * ---------------------------
 * Displays the authenticity score as a radial gauge chart.
 * Color changes based on score: green (>75), yellow (45-75), red (<45).
 * Shows the score number in the center.
 * 
 * Props:
 *   score - Authenticity score (0-100)
 */

import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { getScoreColor } from '../utils/helpers';

const AuthenticityGauge = ({ score }) => {
  const color = getScoreColor(score);
  
  // Data for the radial bar chart
  // Background bar shows the maximum, fill bar shows actual score
  const data = [
    { name: 'bg', value: 100, fill: '#f0f0f0' },
    { name: 'score', value: score, fill: color }
  ];

  return (
    <div style={{ position: 'relative', width: '220px', height: '220px', margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="90%"
          startAngle={180}
          endAngle={0}
          data={data}
          barSize={14}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            background
          />
        </RadialBarChart>
      </ResponsiveContainer>
      
      {/* Score number in the center */}
      <div style={{
        position: 'absolute',
        top: '45%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          color: color,
          lineHeight: 1
        }}>
          {score}
        </div>
        <div style={{
          fontSize: '0.8rem',
          color: '#888',
          marginTop: '4px',
          fontWeight: 500
        }}>
          out of 100
        </div>
      </div>
    </div>
  );
};

export default AuthenticityGauge;
