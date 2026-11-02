/**
 * Profile Page  (Session management & profile customization, TC_PROFILE_01)
 * Edit name and phone, notification preferences, default platforms and password.
 */

import React, { useState } from 'react';
import { FiUser, FiSave, FiLock, FiBell } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../components/Shared.css';

const PLATFORMS = ['aliexpress', 'ebay', 'amazon', 'daraz'];

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    emailAlerts: user?.preferences?.emailAlerts !== false,
    smsAlerts: !!user?.preferences?.smsAlerts,
    defaultPlatforms: user?.preferences?.defaultPlatforms || PLATFORMS
  });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);

  const togglePlatform = (p) => setForm(f => ({
    ...f,
    defaultPlatforms: f.defaultPlatforms.includes(p) ? f.defaultPlatforms.filter(x => x !== p) : [...f.defaultPlatforms, p]
  }));

  const save = async (e) => {
    e.preventDefault();
    if (form.defaultPlatforms.length === 0) { toast.warning('Select at least one default platform.'); return; }
    if (form.smsAlerts && !form.phone) { toast.warning('Add a phone number to receive SMS alerts.'); return; }
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', {
        name: form.name, phone: form.phone,
        preferences: { emailAlerts: form.emailAlerts, smsAlerts: form.smsAlerts, defaultPlatforms: form.defaultPlatforms }
      });
      updateUser(res.data.user);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword.length < 6) { toast.warning('New password must be at least 6 characters.'); return; }
    if (pw.newPassword !== pw.confirm) { toast.warning('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const res = await api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success(res.data.message);
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <div>
          <h1><FiUser /> Profile</h1>
          <p>Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}{user?.role === 'admin' && ' · Administrator'}</p>
        </div>
      </div>

      <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
        <h3><FiUser /> Personal details</h3>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field"><span>Full name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={50} />
          </label>
          <label className="field"><span>Phone number (for SMS alerts)</span>
            <input value={form.phone} placeholder="+923001234567" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
        </div>
        <label className="field"><span>Email</span><input value={user?.email || ''} disabled /></label>

        <h3 style={{ marginTop: 10 }}><FiBell /> Notifications</h3>
        <div className="toggle-row">
          <div>Email price alerts<small>Get an email when a product reaches your target price</small></div>
          <input type="checkbox" checked={form.emailAlerts} onChange={(e) => setForm({ ...form, emailAlerts: e.target.checked })} />
        </div>
        <div className="toggle-row">
          <div>SMS price alerts<small>Requires a phone number (sent via Twilio when configured)</small></div>
          <input type="checkbox" checked={form.smsAlerts} onChange={(e) => setForm({ ...form, smsAlerts: e.target.checked })} />
        </div>

        <h3 style={{ marginTop: 18 }}>Default search platforms</h3>
        <div className="chips" style={{ marginBottom: 18 }}>
          {PLATFORMS.map(p => (
            <button type="button" key={p} className="chip" onClick={() => togglePlatform(p)}
              style={form.defaultPlatforms.includes(p) ? { background: 'var(--primary)', color: '#fff' } : { background: '#eef2f7', color: 'var(--text-secondary)' }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button type="submit" className="btn-primary" disabled={saving}><FiSave /> {saving ? 'Saving…' : 'Save changes'}</button>
      </form>

      <form className="card" onSubmit={changePassword}>
        <h3><FiLock /> Change password</h3>
        <label className="field"><span>Current password</span>
          <input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required autoComplete="current-password" />
        </label>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field"><span>New password</span>
            <input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={6} autoComplete="new-password" />
          </label>
          <label className="field"><span>Confirm new password</span>
            <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required autoComplete="new-password" />
          </label>
        </div>
        <button type="submit" className="btn-secondary" disabled={pwSaving}><FiLock /> {pwSaving ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  );
};

export default Profile;
