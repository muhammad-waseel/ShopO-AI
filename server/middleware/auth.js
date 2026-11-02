/**
 * JWT Authentication Middleware
 * -----------------------------
 * Protects routes by verifying the JWT token sent in the
 * Authorization header. If valid, attaches the user's ID
 * to req.user so downstream handlers can identify the user.
 * 
 * Usage: Add as middleware to any route that requires login.
 *   router.get('/protected', auth, controllerFunction);
 * 
 * Expected Header Format:
 *   Authorization: Bearer <jwt_token>
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // 2. Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find the user in database (make sure they still exist)
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Token is valid but user no longer exists.' 
      });
    }

    // 4. Attach user info to the request object
    req.user = {
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'user'
    };

    next(); // Continue to the next middleware/route handler
  } catch (error) {
    // Token is invalid or expired
    return res.status(401).json({ 
      message: 'Invalid or expired token. Please login again.' 
    });
  }
};

/**
 * Admin-only guard. Use after `auth`.
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

module.exports = auth;
module.exports.requireAdmin = requireAdmin;
