/**
 * API Service
 * -----------
 * Centralized Axios instance for all API calls.
 * 
 * Features:
 *   - Base URL configured for the Express backend
 *   - Request interceptor: automatically attaches JWT token to all requests
 *   - Response interceptor: handles 401 errors (expired token → redirect to login)
 * 
 * Usage:
 *   import api from '../services/api';
 *   const response = await api.get('/products/search?q=iPhone');
 */

import axios from 'axios';

// Create axios instance with base URL pointing to our Express server
// In development the CRA dev-server proxies /api → http://localhost:5000
// (see "proxy" in package.json). In production the Express server serves
// the React build, so a relative URL works. Override with REACT_APP_API_URL
// when the API is hosted on a different domain.
export const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 120000 // 120 second timeout (scraping can be slow with multiple platforms)
});

/**
 * Request Interceptor
 * Attaches the JWT token from localStorage to every outgoing request.
 * This way, we don't need to manually add the token each time.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smartshop_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles common error scenarios globally:
 *   - 401 Unauthorized → clear local storage (token expired)
 *   - Other errors → pass through to the calling code
 */
api.interceptors.response.use(
  (response) => response, // Success — pass through
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token is invalid or expired — clear auth data
      localStorage.removeItem('smartshop_token');
      localStorage.removeItem('smartshop_user');
      // Redirect to login (only if not already on login page)
      const isAuthCall = /\/auth\/(login|register|password)/.test(error.config?.url || '');
      if (!isAuthCall && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
