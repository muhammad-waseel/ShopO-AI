/**
 * Navbar Component
 * ----------------
 * Top navigation bar shown on every page.
 * Displays app logo, navigation links, a price-alert notification badge
 * and the user menu. Responsive: collapses into a hamburger menu on mobile.
 */

import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FiShoppingBag, FiMenu, FiX, FiLogOut, FiClock, FiUser, FiShield, FiGrid, FiHeart, FiBell } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { unseenAlerts, wishlistLinks } = useUserData();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const close = () => setMenuOpen(false);

  const handleLogout = () => {
    logout();
    close();
    navigate('/');
  };

  const link = (to, Icon, label, badge) => (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>
      <Icon /> {label}
      {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="navbar-brand" onClick={close}>
          <FiShoppingBag className="brand-icon" />
          <span className="brand-text">ShopO-AI</span>
        </Link>

        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          {!menuOpen && unseenAlerts > 0 && <span className="nav-dot" />}
        </button>

        <div className={`navbar-links ${menuOpen ? 'active' : ''}`}>
          {isAuthenticated ? (
            <>
              {link('/dashboard', FiGrid, 'Dashboard')}
              {link('/verify', FiShield, 'Verify')}
              {link('/wishlist', FiHeart, 'Wishlist', wishlistLinks.size)}
              {link('/alerts', FiBell, 'Alerts', unseenAlerts)}
              {link('/history', FiClock, 'History')}
              <Link to="/profile" className="nav-user" onClick={close} title="Profile & settings">
                <FiUser className="user-icon" />
                <span className="user-name">{user?.name}</span>
              </Link>
              <button className="nav-btn logout-btn" onClick={handleLogout}>
                <FiLogOut /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/" className="nav-link" onClick={close}>Home</Link>
              <Link to="/login" className="nav-link" onClick={close}>Login</Link>
              <Link to="/register" className="nav-btn register-btn" onClick={close}>Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
