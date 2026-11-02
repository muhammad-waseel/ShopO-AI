/**
 * Home Page
 * ---------
 * Landing page with a hero section, search bar, platform selection,
 * and feature highlights. Users can search for products from here.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiCpu, FiBarChart2, FiShield, FiMic, FiCamera, FiBell, FiGrid } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import SearchBar from '../components/SearchBar';
import './Home.css';

// Feature cards shown below the search bar
const features = [
  {
    icon: FiCpu,
    title: 'AI Analysis',
    description: 'Advanced fake product detection using price comparison, seller ratings, and review analysis.'
  },
  {
    icon: FiBarChart2,
    title: 'Sentiment Analysis',
    description: 'NLP-powered review analysis to determine overall buyer satisfaction.'
  },
  {
    icon: FiShield,
    title: 'QR & Image Verification',
    description: 'Scan a product QR code or upload a photo to check whether it is genuine.'
  },
  {
    icon: FiMic,
    title: 'Voice & Image Search',
    description: 'Speak your search or snap a photo of a product to find it across stores.'
  },
  {
    icon: FiBell,
    title: 'Price Alerts',
    description: 'Set a target price and get an email as soon as the price drops.'
  },
  {
    icon: FiCamera,
    title: 'Smart Verdict',
    description: 'Clear Buy / Risky / Avoid recommendations based on multiple trust factors.'
  }
];

const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const [platforms, setPlatforms] = useState({
    aliexpress: true,
    ebay: true,
    amazon: true,
    daraz: true
  });
  const navigate = useNavigate();

  // Use the default platforms saved in the user's profile
  useEffect(() => {
    const defaults = user?.preferences?.defaultPlatforms;
    if (defaults && defaults.length) {
      setPlatforms({
        aliexpress: defaults.includes('aliexpress'),
        ebay: defaults.includes('ebay'),
        amazon: defaults.includes('amazon'),
        daraz: defaults.includes('daraz')
      });
    }
  }, [user]);

  // Toggle a platform checkbox
  const togglePlatform = (platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  // Handle search (text, voice or image)
  const handleSearch = (query, searchType = 'text') => {
    const selectedPlatforms = Object.entries(platforms)
      .filter(([_, active]) => active)
      .map(([name]) => name);

    if (selectedPlatforms.length === 0) {
      toast.warning('Please select at least one platform.');
      return;
    }

    if (!isAuthenticated) {
      toast.info('Please login to search for products.');
      navigate('/login');
      return;
    }

    const params = new URLSearchParams({ q: query, platforms: selectedPlatforms.join(','), type: searchType });
    navigate(`/results?${params.toString()}`);
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Smart Shopping with
            <span className="hero-highlight"> AI Protection</span>
          </h1>
          <p className="hero-subtitle">
            Detect fake products, analyze reviews, and make informed 
            purchasing decisions across AliExpress, eBay, Amazon, and Daraz.
          </p>

          {/* Search: text with autocomplete, voice and image */}
          <div className="search-form">
            <SearchBar onSearch={handleSearch} />

            {/* Platform Selection */}
            <div className="platform-selection">
              {Object.entries(platforms).map(([name, active]) => (
                <label key={name} className={`platform-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => togglePlatform(name)}
                    style={{ display: 'none' }}
                  />
                  <span className="chip-name">
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="hero-hint">
            Tip: click the 🎤 to search by voice or the 📷 to search with a photo.
            {isAuthenticated && <> &nbsp;<Link to="/dashboard" className="hero-dash-link"><FiGrid /> Go to your dashboard</Link></>}
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <h2 className="section-title">How It Works</h2>
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon-wrapper">
                <feature.icon size={28} />
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stat-item">
          <span className="stat-number">4</span>
          <span className="stat-label">Platforms Supported</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">100</span>
          <span className="stat-label">Point Scoring System</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">4</span>
          <span className="stat-label">AI Trust Factors</span>
        </div>
      </section>
    </div>
  );
};

export default Home;
