const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, publicUser, saveUserSession } = dependencies;

  router.get('/api/auth/me', async (req, res) => {
    if (!req.session.user) return res.json({ user: null });
    const result = await pool.query(
      'SELECT id, email, role, department, full_name, is_active, is_blocked FROM app_users WHERE id = $1',
      [req.session.user.id],
    );
    const user = result.rows[0];
    if (!user || !user.is_active || user.is_blocked) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    return res.json({ user: publicUser(user) });
  });

  router.post('/api/auth/register', (req, res) => {
    return res.status(403).json({ message: 'Staff accounts can only be created by an administrator.' });
  });

  router.post('/api/auth/customer/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.full_name || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ message: 'Enter your name (up to 100 characters).'});
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Use a password with at least 6 characters.' });
    }
  
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const result = await pool.query(
        "INSERT INTO app_users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'customer') RETURNING id, email, role, department, full_name",
        [email, passwordHash, fullName],
      );
      const user = result.rows[0];
      await saveUserSession(req, user);
      return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
      throw error;
    }
  });

  router.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query(
      'SELECT id, email, password_hash, role, department, full_name, is_active, is_blocked FROM app_users WHERE email = $1',
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (!user.is_active || user.is_blocked) {
      return res.status(403).json({ message: 'This account is deactivated or blocked. Contact an administrator.' });
    }
    await saveUserSession(req, user);
    return res.json({ user: publicUser(user) });
  });

  router.post('/api/auth/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('rodas.sid', { httpOnly: true, sameSite: 'lax' });
      return res.json({ success: true });
    });
  });

  return router;
};