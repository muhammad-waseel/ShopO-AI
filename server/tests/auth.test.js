const request = require('supertest');
const h = require('./helpers');
const app = require('../app');

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

describe('Authentication & profile (FR1, FR2, TC_PROFILE_01)', () => {
  test('registers a user and hashes the password', async () => {
    const { res } = await h.registerUser(request, app, { email: 'a@test.com' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('a@test.com');
    const User = require('../models/User');
    const stored = await User.findOne({ email: 'a@test.com' }).select('+password');
    expect(stored.password).not.toBe('secret123');
    expect(stored.password.startsWith('$2')).toBe(true);
  });

  test('rejects duplicate emails and invalid input', async () => {
    await h.registerUser(request, app, { email: 'dup@test.com' });
    const dup = await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'dup@test.com', password: 'secret123' });
    expect(dup.status).toBe(400);
    const bad = await request(app).post('/api/auth/register').send({ name: 'X', email: 'nope', password: '1' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBeGreaterThanOrEqual(2);
  });

  test('logs in with correct password and refuses a wrong one', async () => {
    await h.registerUser(request, app, { email: 'b@test.com' });
    const ok = await request(app).post('/api/auth/login').send({ email: 'b@test.com', password: 'secret123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeDefined();
    const bad = await request(app).post('/api/auth/login').send({ email: 'b@test.com', password: 'wrong!!' });
    expect(bad.status).toBe(400);
  });

  test('protects routes with JWT', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const { token } = await h.registerUser(request, app);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.preferences.emailAlerts).toBe(true);
  });

  test('updates profile name, phone and preferences (TC_PROFILE_01)', async () => {
    const { token } = await h.registerUser(request, app);
    const res = await request(app).put('/api/auth/profile').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Syed Mujtaba', phone: '+923001234567', preferences: { emailAlerts: false, defaultPlatforms: ['daraz', 'amazon', 'bogus'] } });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Syed Mujtaba');
    expect(res.body.user.phone).toBe('+923001234567');
    expect(res.body.user.preferences.emailAlerts).toBe(false);
    expect(res.body.user.preferences.defaultPlatforms).toEqual(['daraz', 'amazon']);

    const bad = await request(app).put('/api/auth/profile').set('Authorization', `Bearer ${token}`).send({ phone: 'abc' });
    expect(bad.status).toBe(400);
  });

  test('changes password only with the correct current password', async () => {
    const { token, body } = await h.registerUser(request, app);
    const wrong = await request(app).put('/api/auth/password').set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'nope123', newPassword: 'newpass123' });
    expect(wrong.status).toBe(400);
    const ok = await request(app).put('/api/auth/password').set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'secret123', newPassword: 'newpass123' });
    expect(ok.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ email: body.email, password: 'newpass123' });
    expect(login.status).toBe(200);
  });

  test('health endpoint reports status and feature flags', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
    expect(res.body.features).toHaveProperty('Email alerts (SMTP)');
  });
});
