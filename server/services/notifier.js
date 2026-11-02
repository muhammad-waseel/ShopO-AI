/**
 * Notifier Service  (email via Nodemailer, SMS via Twilio)
 * --------------------------------------------------------
 * Email:
 *   Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
 *   (Gmail: smtp.gmail.com / 465 with an App Password.)
 *   If SMTP is not configured, emails are written to the server log
 *   instead so alerts still work in development.
 *
 * SMS (optional):
 *   Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.
 *   Uses Twilio's REST API directly (no extra dependency).
 */

const nodemailer = require('nodemailer');
const axios = require('axios');

let transporter = null;

const isEmailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const isSmsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const getTransporter = () => {
  if (transporter) return transporter;
  if (isEmailConfigured()) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  } else {
    // Development fallback: don't send, just produce the message as JSON
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
};

/**
 * Send an email. Returns { sent: boolean, preview?: string }.
 */
const sendEmail = async ({ to, subject, text, html }) => {
  const info = await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'ShopO-AI <no-reply@shopo-ai.local>',
    to, subject, text, html
  });
  if (!isEmailConfigured()) {
    console.log(`📧 [Email — SMTP not configured, logged only] To: ${to} | ${subject}`);
    return { sent: false, logged: true, preview: info.message };
  }
  console.log(`📧 Email sent to ${to}: ${subject}`);
  return { sent: true };
};

/**
 * Send an SMS through Twilio. Returns { sent: boolean }.
 */
const sendSms = async ({ to, body }) => {
  if (!isSmsConfigured() || !to) return { sent: false };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body }).toString(),
    {
      auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    }
  );
  console.log(`📱 SMS sent to ${to}`);
  return { sent: true };
};

/**
 * Build and send a price-drop notification for an alert.
 */
const sendPriceDropNotification = async (user, alert) => {
  const channels = [];
  const appUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : (process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000');
  const subject = `Price drop: ${alert.productName.substring(0, 60)} is now $${alert.currentPrice.toFixed(2)}`;
  const text =
    `Good news, ${user.name}!\n\n` +
    `"${alert.productName}" on ${alert.platform} has dropped to $${alert.currentPrice.toFixed(2)} ` +
    `(your target: $${alert.targetPrice.toFixed(2)}, original: $${alert.initialPrice.toFixed(2)}).\n\n` +
    `Buy it here: ${alert.productLink || 'n/a'}\n` +
    `Compare prices: ${appUrl}/alerts\n\n— ShopO-AI`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px">
      <h2 style="color:#0f3460">Price drop alert 🎉</h2>
      <p>Hi ${user.name},</p>
      <p><strong>${alert.productName}</strong> on <strong>${alert.platform}</strong> is now
        <strong style="color:#28a745">$${alert.currentPrice.toFixed(2)}</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0">Your target</td><td>$${alert.targetPrice.toFixed(2)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0">Price when alert was set</td><td>$${alert.initialPrice.toFixed(2)}</td></tr>
      </table>
      ${alert.productLink ? `<p><a href="${alert.productLink}" style="background:#4facfe;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View product</a></p>` : ''}
      <p><a href="${appUrl}/alerts">Manage your alerts</a></p>
    </div>`;

  if (user.preferences?.emailAlerts !== false) {
    try {
      const r = await sendEmail({ to: user.email, subject, text, html });
      channels.push(r.sent ? 'email' : 'email-logged');
    } catch (err) {
      console.warn(`⚠️ Email notification failed: ${err.message}`);
    }
  }
  if (user.preferences?.smsAlerts && user.phone) {
    try {
      const r = await sendSms({ to: user.phone, body: `ShopO-AI: ${alert.productName.substring(0, 50)} is now $${alert.currentPrice.toFixed(2)} (target $${alert.targetPrice.toFixed(2)}). ${alert.productLink || ''}` });
      if (r.sent) channels.push('sms');
    } catch (err) {
      console.warn(`⚠️ SMS notification failed: ${err.message}`);
    }
  }
  channels.push('in-app');
  return channels;
};

module.exports = { sendEmail, sendSms, sendPriceDropNotification, isEmailConfigured, isSmsConfigured };
