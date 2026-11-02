/**
 * App Component (Root)
 * --------------------
 * Sets up React Router and wraps the app with the Auth + UserData providers.
 *
 * Routes:
 *   /           → Home (search page)
 *   /login      → Login page
 *   /register   → Registration page
 *   /dashboard  → Unified user dashboard
 *   /results    → Search results / price comparison (?q=&platforms=&type=)
 *   /product    → Product AI analysis page
 *   /verify     → Product verification (QR code + image/logo)
 *   /wishlist   → Saved products
 *   /alerts     → Price alerts
 *   /history    → Analyses, searches and verifications
 *   /profile    → Profile & notification settings
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserDataProvider } from './context/UserDataContext';

import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Results from './pages/Results';
import ProductDetail from './pages/ProductDetail';
import History from './pages/History';
import VerifyProduct from './pages/VerifyProduct';
import Dashboard from './pages/Dashboard';
import Wishlist from './pages/Wishlist';
import Alerts from './pages/Alerts';
import Profile from './pages/Profile';

const protect = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

// Logged-in users who open /login or /register go to their dashboard
const GuestOnly = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <UserDataProvider>
        <Router>
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

              <Route path="/dashboard" element={protect(<Dashboard />)} />
              <Route path="/results" element={protect(<Results />)} />
              <Route path="/product" element={protect(<ProductDetail />)} />
              <Route path="/verify" element={protect(<VerifyProduct />)} />
              <Route path="/wishlist" element={protect(<Wishlist />)} />
              <Route path="/alerts" element={protect(<Alerts />)} />
              <Route path="/history" element={protect(<History />)} />
              <Route path="/profile" element={protect(<Profile />)} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />
        </Router>
      </UserDataProvider>
    </AuthProvider>
  );
}

export default App;
