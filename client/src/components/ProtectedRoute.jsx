/**
 * ProtectedRoute Component
 * ------------------------
 * Wrapper component that checks if the user is authenticated.
 * If not logged in, redirects to the login page.
 * Shows a loading spinner while auth state is being determined.
 * 
 * Usage:
 *   <Route path="/history" element={
 *     <ProtectedRoute><History /></ProtectedRoute>
 *   } />
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Still checking if user has a valid saved token
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // Not authenticated → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated → render the child component
  return children;
};

export default ProtectedRoute;
