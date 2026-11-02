/**
 * Auth Controller
 * ---------------
 * Handles user registration and login.
 * 
 * Functions:
 *   - register: Create new user account, return JWT token
 *   - login: Authenticate existing user, return JWT token
 *   - getMe: Return current user's profile (from JWT)
 */

const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

/**
 * Generate a JWT token for a user.
 * Token contains the userId and expires in 7 days.
 * @param {string} userId - MongoDB ObjectId of the user
 * @returns {string} Signed JWT token
 */
const toUserJSON = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role || 'user',
  preferences: user.preferences || {},
  createdAt: user.createdAt
});

const isAdminEmail = (email) =>
  (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes((email || '').toLowerCase());

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token valid for 7 days
  );
};

/**
 * POST /api/auth/register
 * Creates a new user account and returns a JWT token.
 */
const register = async (req, res) => {
  try {
    // Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'An account with this email already exists.' 
      });
    }

    // Create new user (password is auto-hashed by the pre-save hook)
    const user = new User({ name, email, password, role: isAdminEmail(email) ? 'admin' : 'user' });
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: toUserJSON(user)
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

/**
 * POST /api/auth/login
 * Authenticates user with email and password, returns JWT token.
 */
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email (include password field for comparison)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid email or password.' 
      });
    }

    // Compare provided password with stored hash
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        message: 'Invalid email or password.' 
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful!',
      token,
      user: toUserJSON(user)
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile.
 * Requires authentication (JWT token in header).
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    res.json({ user: toUserJSON(user) });
  } catch (error) {
    console.error('GetMe error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PUT /api/auth/profile
 * Update name, phone and notification preferences (TC_PROFILE_01).
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { name, phone, preferences } = req.body;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (preferences && typeof preferences === 'object') {
      const valid = ['aliexpress', 'ebay', 'amazon', 'daraz'];
      if (typeof preferences.emailAlerts === 'boolean') user.preferences.emailAlerts = preferences.emailAlerts;
      if (typeof preferences.smsAlerts === 'boolean') user.preferences.smsAlerts = preferences.smsAlerts;
      if (Array.isArray(preferences.defaultPlatforms)) {
        const list = preferences.defaultPlatforms.filter(p => valid.includes(p));
        if (list.length) user.preferences.defaultPlatforms = list;
      }
    }
    await user.save();
    res.json({ message: 'Profile updated successfully.', user: toUserJSON(user) });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ message: 'Server error while updating profile.' });
  }
};

/**
 * PUT /api/auth/password
 * Change password (requires the current password).
 */
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Server error while changing password.' });
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword, toUserJSON };
