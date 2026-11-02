/**
 * SentimentChart Component
 * ------------------------
 * Displays a pie chart showing the sentiment breakdown of product reviews.
 * Uses Recharts PieChart with three slices: Positive, Neutral, Negative.
 * 
 * Props:
 *   sentimentData - { positive: %, neutral: %, negative: % }
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Color scheme for sentiment categories
const COLORS = {
  Positive: '#28a745',   // Green
  Neutral: '#adb5bd',    // Gray
  Negative: '#dc3545'    // Red
};

// Custom tooltip for the pie chart
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const { name, value } = payload[0];
    return (
      <div style={{
        background: 'white',
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '0.85rem'
      }}>
        <span style={{ color: COLORS[name], fontWeight: 600 }}>{name}</span>
        <span>: {value}%</span>
      </div>
    );
  }
  return null;
};

const SentimentChart = ({ sentimentData }) => {
  // Prepare data for Recharts
  const data = [
    { name: 'Positive', value: sentimentData?.positive || 0 },
    { name: 'Neutral', value: sentimentData?.neutral || 0 },
    { name: 'Negative', value: sentimentData?.negative || 0 }
  ];

  // Find dominant sentiment
  const dominant = data.reduce((max, item) => 
    item.value > max.value ? item : max, data[0]
  );

  return (
    <div className="sentiment-chart-container">
      <h3 style={{ marginBottom: '8px', color: '#1a1a2e', fontSize: '1.1rem' }}>
        Review Sentiment Analysis
      </h3>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '16px' }}>
        Overall sentiment: <strong style={{ color: COLORS[dominant.name] }}>
          {dominant.name} ({dominant.value}%)
        </strong>
      </p>
      
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            label={({ name, value }) => `${name} ${value}%`}
            labelLine={true}
          >
            {data.map((entry) => (
              <Cell 
                key={entry.name} 
                fill={COLORS[entry.name]} 
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value) => (
              <span style={{ color: '#555', fontSize: '0.85rem' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SentimentChart;
