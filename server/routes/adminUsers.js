const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireAdmin } = dependencies;
  const departments = ['IT', 'HR', 'Sales', 'Finance', 'Mainstore', 'Attendance', 'Auditor', 'Logistics'];

  router.get('/api/users', requireUser, requireAdmin, async (req, res) => {
    const result = await pool.query(
      'SELECT id, email, role, department, is_active, is_blocked, created_at FROM app_users ORDER BY created_at DESC',
    );
    return res.json(result.rows);
  });

  router.post('/api/users', requireUser, requireAdmin, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const department = String(req.body.department || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Use a password with at least 6 characters.' });
    }
    if (!departments.includes(department)) {
      return res.status(400).json({ message: 'Choose a valid department.' });
    }
  
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const result = await pool.query(
        "INSERT INTO app_users (email, password_hash, department, role) VALUES ($1, $2, $3, 'user') RETURNING id, email, role, department, is_active, is_blocked, created_at",
        [email, passwordHash, department],
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
      throw error;
    }
  });

  router.patch('/api/users/:id/password', requireUser, requireAdmin, async (req, res) => {
    const password = String(req.body.password || '');
    const accountResult = await pool.query(
      "SELECT role FROM app_users WHERE id = $1 AND role IN ('user', 'customer')",
      [req.params.id],
    );
    if (!accountResult.rowCount) return res.status(404).json({ message: 'User account not found.' });
    if (password.length < 6) {
      return res.status(400).json({ message: 'Use a password with at least 6 characters.' });
    }
  
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `UPDATE app_users SET password_hash = $1
      WHERE id = $2 AND role IN ('user', 'customer')
       RETURNING id, email, role, department, is_active, is_blocked, created_at`,
      [passwordHash, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User account not found.' });
    return res.json(result.rows[0]);
  });

  router.patch('/api/users/:id/status', requireUser, requireAdmin, async (req, res) => {
    if (req.params.id === req.session.user.id) {
      return res.status(400).json({ message: 'You cannot change your own administrator account.' });
    }
    const column = typeof req.body.is_active === 'boolean'
      ? 'is_active'
      : typeof req.body.is_blocked === 'boolean'
        ? 'is_blocked'
        : null;
    if (!column) return res.status(400).json({ message: 'Choose an account status to update.' });
    const value = req.body[column];
    const result = await pool.query(
      `UPDATE app_users SET ${column} = $1 WHERE id = $2 AND role IN ('user', 'customer')
       RETURNING id, email, role, department, is_active, is_blocked, created_at`,
      [value, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User account not found.' });
    return res.json(result.rows[0]);
  });

  router.delete('/api/users/:id', requireUser, requireAdmin, async (req, res) => {
    if (req.params.id === req.session.user.id) {
      return res.status(400).json({ message: 'You cannot remove your own administrator account.' });
    }
    const result = await pool.query(
      "DELETE FROM app_users WHERE id = $1 AND role IN ('user', 'customer') RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User account not found.' });
    return res.json({ success: true, id: result.rows[0].id });
  });

  return router;
};
