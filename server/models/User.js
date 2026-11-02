/**
 * User Model
 * ----------
 * Stores registered user accounts.
 * Password is automatically hashed before saving using bcryptjs.
 * 
 * Fields:
 *   - name: User's display name
 *   - phone: Optional phone number (used for SMS price alerts)
 *   - role: 'user' or 'admin' (admins can register QR codes)
 *   - preferences: Notification + default platform settings
 *   - email: Unique email address (used for login)
 *   - password: Hashed password (bcrypt, 10 salt rounds)
 *   - createdAt: Auto-generated timestamp
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 20
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  preferences: {
    emailAlerts: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: false },
    defaultPlatforms: {
      type: [String],
      default: ['aliexpress', 'ebay', 'amazon', 'daraz']
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

/**
 * Pre-save Hook: Hash password before saving to database.
 * Only hashes if the password field has been modified (not on every save).
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Instance Method: Compare a candidate password with the stored hash.
 * @param {string} candidatePassword - Plain text password to check
 * @returns {boolean} True if passwords match
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
