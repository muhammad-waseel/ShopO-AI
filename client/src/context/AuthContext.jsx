/**
 * Auth Context
 * ------------
 * React Context for managing authentication state across the app.
 * 
 * Stores JWT token in localStorage for persistence across page reloads.
 * Provides login, register, and logout functions to all child components.
 * 
 * Usage in components:
 *   const { user, login, logout, isAuthenticated } = useAuth();
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

// Create the context
const AuthContext = createContext(null);

/**
 * AuthProvider wraps the entire app and provides auth state.
 * On mount, checks localStorage for existing token and validates it.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);           // Current user object
  const [token, setToken] = useState(null);           // JWT token
  const [loading, setLoading] = useState(true);       // Loading state (checking saved token)

  // On app load: check if user has a saved token in localStorage
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('smartshop_token');
      const savedUser = localStorage.getItem('smartshop_user');

      if (savedToken && savedUser) {
        try {
          // Validate token by calling /api/auth/me
          setToken(savedToken);
          const response = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          setUser(response.data.user);
          setToken(savedToken);
        } catch (error) {
          // Token is invalid or expired — clear everything
          console.log('Saved token is invalid, clearing auth state.');
          localStorage.removeItem('smartshop_token');
          localStorage.removeItem('smartshop_user');
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Register a new user account.
   * @param {string} name - User's name
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @returns {Object} Response data with token and user
   */
  const register = async (name, email, password) => {
    const response = await api.post('/auth/register', { name, email, password });
    const { token: newToken, user: newUser } = response.data;

    // Save to state and localStorage
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('smartshop_token', newToken);
    localStorage.setItem('smartshop_user', JSON.stringify(newUser));

    return response.data;
  };

  /**
   * Login with existing credentials.
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @returns {Object} Response data with token and user
   */
  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = response.data;

    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('smartshop_token', newToken);
    localStorage.setItem('smartshop_user', JSON.stringify(newUser));

    return response.data;
  };

  /**
   * Logout: clear all auth state and localStorage.
   */
  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('smartshop_token');
    localStorage.removeItem('smartshop_user');
  };

  /**
   * Replace the stored user object (after a profile update).
   */
  const updateUser = (newUser) => {
    setUser(newUser);
    localStorage.setItem('smartshop_user', JSON.stringify(newUser));
  };

  // Value provided to all children via useAuth()
  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    register,
    login,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to access auth context from any component.
 * @returns {Object} Auth state and functions
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
