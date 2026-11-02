/**
 * Auth Routes
 * -----------
 * Handles user authentication endpoints:
 *   POST /api/auth/register - Create new account
 *   POST /api/auth/login    - Login to existing account
 *   GET  /api/auth/me       - Get current user profile (protected)
 * 
 * Input validation is done using express-validator before
 * the request reaches the controller.
 */

const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe, updateProfile, changePassword } = require('../controllers/authController');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 * Returns: { message, token, user }
 */
router.post('/register', [
  // Validation rules
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], register);

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { message, token, user }
 */
router.post('/login', [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
], login);

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 * Returns: { user }
 */
router.get('/me', auth, getMe);

/**
 * PUT /api/auth/profile
 * Body: { name?, phone?, preferences?: { emailAlerts, smsAlerts, defaultPlatforms } }
 */
router.put('/profile', auth, [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('phone').optional({ values: 'falsy' }).trim()
    .matches(/^\+?[0-9\s-]{7,20}$/).withMessage('Please enter a valid phone number (e.g. +923001234567)')
], updateProfile);

/**
 * PUT /api/auth/password
 * Body: { currentPassword, newPassword }
 */
router.put('/password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], changePassword);

module.exports = router;
