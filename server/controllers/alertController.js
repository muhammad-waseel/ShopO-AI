/**
 * Price Alert Controller  (FR10)
 *   GET    /api/alerts             - list alerts (+ unseen triggered count)
 *   POST   /api/alerts             - create an alert
 *   PATCH  /api/alerts/:id         - update target price / pause / resume
 *   DELETE /api/alerts/:id         - delete
 *   POST   /api/alerts/check       - check my active alerts now
 *   POST   /api/alerts/mark-seen   - mark triggered alerts as read
 */

const PriceAlert = require('../models/PriceAlert');
const { checkAlerts } = require('../services/priceMonitor');

const getAlerts = async (req, res) => {
  try {
    const alerts = await PriceAlert.find({ user: req.user.userId }).sort({ status: 1, createdAt: -1 });
    const unseen = alerts.filter(a => a.status === 'triggered' && !a.seen).length;
    res.json({ alerts, total: alerts.length, unseenTriggered: unseen });
  } catch (error) {
    console.error('Get alerts error:', error.message);
    res.status(500).json({ message: 'Error fetching price alerts.' });
  }
};

const createAlert = async (req, res) => {
  try {
    const { productName, productLink, productImage, platform, query, targetPrice, currentPrice } = req.body;
    const target = parseFloat(targetPrice);
    const current = parseFloat(currentPrice);
    if (!productName || !platform) {
      return res.status(400).json({ message: 'Product name and platform are required.' });
    }
    if (isNaN(target) || target <= 0) {
      return res.status(400).json({ message: 'Please enter a valid target price.' });
    }
    if (isNaN(current) || current <= 0) {
      return res.status(400).json({ message: 'Current price is required.' });
    }
    const count = await PriceAlert.countDocuments({ user: req.user.userId, status: 'active' });
    if (count >= 50) {
      return res.status(400).json({ message: 'You can have at most 50 active alerts.' });
    }

    const alreadyMet = current <= target;
    const alert = await PriceAlert.create({
      user: req.user.userId, productName, productLink: productLink || '', productImage: productImage || '',
      platform, query: query || '', targetPrice: target, initialPrice: current, currentPrice: current,
      lowestPrice: current, lastCheckedAt: new Date(),
      status: alreadyMet ? 'triggered' : 'active',
      triggeredAt: alreadyMet ? new Date() : null,
      notificationChannels: alreadyMet ? ['in-app'] : []
    });
    res.status(201).json({
      message: alreadyMet
        ? 'The current price is already at or below your target!'
        : `Alert set. We'll email you when the price drops to $${target.toFixed(2)}.`,
      alert
    });
  } catch (error) {
    console.error('Create alert error:', error.message);
    res.status(500).json({ message: 'Error creating price alert.' });
  }
};

const updateAlert = async (req, res) => {
  try {
    const alert = await PriceAlert.findOne({ _id: req.params.id, user: req.user.userId });
    if (!alert) return res.status(404).json({ message: 'Alert not found.' });

    const { targetPrice, status } = req.body;
    if (targetPrice !== undefined) {
      const t = parseFloat(targetPrice);
      if (isNaN(t) || t <= 0) return res.status(400).json({ message: 'Please enter a valid target price.' });
      alert.targetPrice = t;
      // Re-arm a triggered alert when the user lowers the target
      if (alert.status === 'triggered' && alert.currentPrice > t) {
        alert.status = 'active';
        alert.triggeredAt = null;
        alert.notified = false;
      }
    }
    if (status !== undefined) {
      if (!['active', 'paused'].includes(status)) return res.status(400).json({ message: 'Status must be active or paused.' });
      alert.status = status;
      if (status === 'active') { alert.triggeredAt = null; alert.notified = false; }
    }
    await alert.save();
    res.json({ message: 'Alert updated.', alert });
  } catch (error) {
    console.error('Update alert error:', error.message);
    res.status(500).json({ message: 'Error updating alert.' });
  }
};

const deleteAlert = async (req, res) => {
  try {
    const r = await PriceAlert.findOneAndDelete({ _id: req.params.id, user: req.user.userId });
    if (!r) return res.status(404).json({ message: 'Alert not found.' });
    res.json({ message: 'Alert deleted.', id: r._id });
  } catch (error) {
    console.error('Delete alert error:', error.message);
    res.status(500).json({ message: 'Error deleting alert.' });
  }
};

const checkNow = async (req, res) => {
  try {
    const result = await checkAlerts({ userId: req.user.userId, alertId: req.body?.alertId || null });
    const alerts = await PriceAlert.find({ user: req.user.userId }).sort({ status: 1, createdAt: -1 });
    res.json({ ...result, alerts });
  } catch (error) {
    console.error('Check alerts error:', error.message);
    res.status(500).json({ message: 'Error checking prices.' });
  }
};

const markSeen = async (req, res) => {
  try {
    await PriceAlert.updateMany({ user: req.user.userId, status: 'triggered', seen: false }, { seen: true });
    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating notifications.' });
  }
};

module.exports = { getAlerts, createAlert, updateAlert, deleteAlert, checkNow, markSeen };
