const bcrypt = require('bcryptjs');

function createAuthMiddleware(pool) {
  function publicUser(user) {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name || '',
      role: user.role,
      department: user.department,
      is_active: user.is_active !== false,
      is_blocked: Boolean(user.is_blocked),
    };
  }

  async function requireUser(req, res, next) {
    if (!req.session.user) return res.status(401).json({ message: 'Sign in is required.' });
    const result = await pool.query(
      'SELECT id, email, role, department, full_name, is_active, is_blocked FROM app_users WHERE id = $1',
      [req.session.user.id],
    );
    const user = result.rows[0];
    if (!user || !user.is_active || user.is_blocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: 'This account is deactivated or blocked.' });
    }
    req.session.user = publicUser(user);
    return next();
  }

  function requireAdmin(req, res, next) {
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Administrator access is required.' });
    }
    return next();
  }

  function requireIT(req, res, next) {
    if (req.session.user?.role !== 'admin' && req.session.user?.department !== 'IT') {
      return res.status(403).json({ message: 'IT department access is required.' });
    }
    return next();
  }

  function requireCustomer(req, res, next) {
    if (req.session.user?.role !== 'customer') {
      return res.status(403).json({ message: 'Customer access is required.' });
    }
    return next();
  }

  function saveUserSession(req, user) {
    return new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) return reject(error);
        req.session.user = publicUser(user);
        return req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
      });
    });
  }

  async function ensureAdminAccount() {
    const email = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      console.warn('No first admin was created. Set ADMIN_EMAIL and ADMIN_PASSWORD in the root .env file.');
      return;
    }
    if (password.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 characters long.');

    const existing = await pool.query('SELECT id, role FROM app_users WHERE email = $1', [email]);
    if (existing.rowCount) {
      if (existing.rows[0].role !== 'admin') {
        throw new Error(`The configured admin email ${email} already belongs to a non-admin account.`);
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, 'admin')",
      [email, passwordHash],
    );
    console.log(`Created the first administrator account for ${email}.`);
  }

  return { publicUser, requireUser, requireAdmin, requireIT, requireCustomer, saveUserSession, ensureAdminAccount };
}

module.exports = createAuthMiddleware;
