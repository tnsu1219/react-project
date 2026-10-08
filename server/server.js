const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, '.env');
dotenv.config({ path: fs.existsSync(rootEnvPath) ? rootEnvPath : localEnvPath });

const { pool, initializeDatabase } = require('./database');
const app = express();
const departments = ['IT', 'Sales', 'Finance', 'Mainstore', 'Attendance', 'Auditor', 'Logistics'];
const transactionTypes = ['Income', 'Expense'];
const transactionStatuses = ['Completed', 'Pending', 'Failed', 'Inactive'];
const supportStatuses = ['Open', 'In Progress', 'Resolved', 'Notification sent to technician'];
const departmentWorkStatuses = {
  Sales: ['Pending', 'In progress', 'Closed'],
  Finance: ['Pending', 'Under review', 'Complete'],
  Mainstore: ['Pending', 'Processing', 'Complete'],
  Attendance: ['Pending', 'Investigating', 'Resolved'],
  Auditor: ['Open', 'In progress', 'Closed'],
  Logistics: ['Planned', 'In transit', 'Delivered'],
};

app.use(express.json({ limit: '8mb' }));
app.use(session({
  name: 'rodas.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  },
}));

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

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, database: 'connected' });
});

app.get('/api/auth/me', async (req, res) => {
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

app.post('/api/auth/register', (req, res) => {
  return res.status(403).json({ message: 'Staff accounts can only be created by an administrator.' });
});

app.post('/api/auth/customer/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('rodas.sid', { httpOnly: true, sameSite: 'lax' });
    return res.json({ success: true });
  });
});

app.get('/api/department-work-items', requireUser, async (req, res) => {
  const department = req.session.user.department;
  if (req.session.user.role !== 'user' || !departmentWorkStatuses[department]) {
    return res.status(403).json({ message: 'A department staff account is required.' });
  }
  const result = await pool.query(
    `SELECT id, department, title, details, status, created_at AS "createdAt"
     FROM department_work_items WHERE department = $1 ORDER BY created_at DESC`,
    [department],
  );
  return res.json(result.rows);
});

app.post('/api/department-work-items', requireUser, async (req, res) => {
  const department = req.session.user.department;
  const title = String(req.body.title || '').trim();
  const details = String(req.body.details || '').trim();
  const status = String(req.body.status || '');
  const legacyKey = req.body.legacy_key == null ? null : String(req.body.legacy_key);
  if (req.session.user.role !== 'user' || !departmentWorkStatuses[department]) {
    return res.status(403).json({ message: 'A department staff account is required.' });
  }
  if (req.body.department !== department) {
    return res.status(403).json({ message: 'You can only add work to your assigned department.' });
  }
  if (!title || title.length > 200 || !details || details.length > 1000
    || !departmentWorkStatuses[department].includes(status)
    || (legacyKey !== null && (!legacyKey || legacyKey.length > 100))) {
    return res.status(400).json({ message: 'Enter a valid title, details, and department status.' });
  }
  const result = await pool.query(
    `INSERT INTO department_work_items (department, created_by, legacy_key, title, details, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (created_by, legacy_key) DO NOTHING
     RETURNING id, department, title, details, status, created_at AS "createdAt"`,
    [department, req.session.user.id, legacyKey, title, details, status],
  );
  if (result.rowCount) return res.status(201).json(result.rows[0]);

  const existing = await pool.query(
    `SELECT id, department, title, details, status, created_at AS "createdAt"
     FROM department_work_items WHERE created_by = $1 AND legacy_key = $2`,
    [req.session.user.id, legacyKey],
  );
  return res.status(200).json(existing.rows[0]);
});

app.patch('/api/department-work-items/:id', requireUser, async (req, res) => {
  const department = req.session.user.department;
  const status = String(req.body.status || '');
  if (req.session.user.role !== 'user' || !departmentWorkStatuses[department]) {
    return res.status(403).json({ message: 'A department staff account is required.' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Work item ID is invalid.' });
  }
  if (!departmentWorkStatuses[department].includes(status)) {
    return res.status(400).json({ message: 'Choose a valid status for your department.' });
  }
  const result = await pool.query(
    `UPDATE department_work_items SET status = $1
     WHERE id = $2 AND department = $3
     RETURNING id, department, title, details, status, created_at AS "createdAt"`,
    [status, req.params.id, department],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Work item not found in your department.' });
  return res.json(result.rows[0]);
});

app.delete('/api/department-work-items/:id', requireUser, async (req, res) => {
  const department = req.session.user.department;
  if (req.session.user.role !== 'user' || !departmentWorkStatuses[department]) {
    return res.status(403).json({ message: 'A department staff account is required.' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Work item ID is invalid.' });
  }
  const result = await pool.query(
    'DELETE FROM department_work_items WHERE id = $1 AND department = $2 RETURNING id',
    [req.params.id, department],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Work item not found in your department.' });
  return res.json({ success: true });
});

app.get('/api/users', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, role, department, is_active, is_blocked, created_at FROM app_users ORDER BY created_at DESC',
  );
  return res.json(result.rows);
});

app.post('/api/users', requireUser, requireAdmin, async (req, res) => {
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

app.patch('/api/users/:id/password', requireUser, requireAdmin, async (req, res) => {
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

app.patch('/api/users/:id/status', requireUser, requireAdmin, async (req, res) => {
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

app.delete('/api/users/:id', requireUser, requireAdmin, async (req, res) => {
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

app.get('/api/catalog', requireUser, requireCustomer, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, sku, category, description, quantity, unit_price FROM products WHERE quantity > 0 ORDER BY category, name',
  );
  return res.json(result.rows);
});

app.get('/api/customer/profile', requireUser, requireCustomer, async (req, res) => {
  const result = await pool.query(
    `SELECT u.full_name, COALESCE(p.phone, '') AS phone, COALESCE(p.area, '') AS area,
            COALESCE(p.street, '') AS street, COALESCE(p.main_road, '') AS main_road,
            COALESCE(p.home_number, '') AS home_number, COALESCE(p.delivery_notes, '') AS delivery_notes,
            p.latitude, p.longitude
     FROM app_users u LEFT JOIN customer_profiles p ON p.customer_id = u.id
     WHERE u.id = $1`,
    [req.session.user.id],
  );
  return res.json(result.rows[0]);
});

app.put('/api/customer/profile', requireUser, requireCustomer, async (req, res) => {
  const fullName = String(req.body.full_name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const area = String(req.body.area || '').trim();
  const street = String(req.body.street || '').trim();
  const mainRoad = String(req.body.main_road || '').trim();
  const homeNumber = String(req.body.home_number || '').trim();
  const deliveryNotes = String(req.body.delivery_notes || '').trim();
  const { latitude, longitude } = req.body;
  if (!fullName || fullName.length > 100 || phone.length < 5 || phone.length > 40
    || !area || area.length > 120 || !street || street.length > 120
    || !mainRoad || mainRoad.length > 120 || !homeNumber || homeNumber.length > 80
    || deliveryNotes.length > 500) {
    return res.status(400).json({ message: 'Enter your name, phone, area, street, main road, and home number.' });
  }
  if ((latitude == null) !== (longitude == null)
    || (latitude != null && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
    || (longitude != null && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))) {
    return res.status(400).json({ message: 'The saved GPS pin is not valid.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE app_users SET full_name = $1 WHERE id = $2', [fullName, req.session.user.id]);
    await client.query(
      `INSERT INTO customer_profiles
       (customer_id, phone, area, street, main_road, home_number, delivery_notes, latitude, longitude, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET phone = EXCLUDED.phone, area = EXCLUDED.area,
         street = EXCLUDED.street, main_road = EXCLUDED.main_road, home_number = EXCLUDED.home_number,
         delivery_notes = EXCLUDED.delivery_notes, latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude, updated_at = NOW()`,
      [req.session.user.id, phone, area, street, mainRoad, homeNumber, deliveryNotes,
        latitude == null ? null : Number(latitude), longitude == null ? null : Number(longitude)],
    );
    await client.query('COMMIT');
    req.session.user.full_name = fullName;
    return res.json({ full_name: fullName, phone, area, street, main_road: mainRoad, home_number: homeNumber,
      delivery_notes: deliveryNotes, latitude: latitude == null ? null : Number(latitude), longitude: longitude == null ? null : Number(longitude) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/payment-accounts', requireUser, requireCustomer, async (req, res) => {
  const result = await pool.query(
    `SELECT id, provider, display_name, account_name, account_number, instructions
     FROM company_payment_accounts WHERE is_active = TRUE ORDER BY provider, display_name`,
  );
  return res.json(result.rows);
});

app.get('/api/admin/payment-accounts', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM company_payment_accounts ORDER BY created_at DESC');
  return res.json(result.rows);
});

app.post('/api/admin/payment-accounts', requireUser, requireAdmin, async (req, res) => {
  const { provider, display_name: displayName, account_name: accountName, account_number: accountNumber, instructions = '' } = req.body;
  if (!['telebirr', 'cbe', 'other_bank'].includes(provider)
    || !String(displayName || '').trim() || !String(accountName || '').trim() || !String(accountNumber || '').trim()
    || String(displayName).length > 100 || String(accountName).length > 120 || String(accountNumber).length > 100
    || String(instructions).length > 500) {
    return res.status(400).json({ message: 'Enter a supported provider, display name, account name, and account number.' });
  }
  const result = await pool.query(
    `INSERT INTO company_payment_accounts (provider, display_name, account_name, account_number, instructions)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [provider, String(displayName).trim(), String(accountName).trim(), String(accountNumber).trim(), String(instructions).trim()],
  );
  return res.status(201).json(result.rows[0]);
});

app.patch('/api/admin/payment-accounts/:id', requireUser, requireAdmin, async (req, res) => {
  const { provider, display_name: displayName, account_name: accountName, account_number: accountNumber,
    instructions = '', is_active: isActive } = req.body;
  if (!['telebirr', 'cbe', 'other_bank'].includes(provider)
    || !String(displayName || '').trim() || !String(accountName || '').trim() || !String(accountNumber || '').trim()
    || String(displayName).length > 100 || String(accountName).length > 120 || String(accountNumber).length > 100
    || String(instructions).length > 500 || typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'Enter valid company account details and an active status.' });
  }
  const result = await pool.query(
    `UPDATE company_payment_accounts SET provider = $1, display_name = $2, account_name = $3,
     account_number = $4, instructions = $5, is_active = $6, updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [provider, String(displayName).trim(), String(accountName).trim(), String(accountNumber).trim(),
      String(instructions).trim(), isActive, req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Company payment account not found.' });
  return res.json(result.rows[0]);
});

app.get('/api/orders/mine', requireUser, requireCustomer, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.status, o.payment_method, o.payment_account_id,
            a.display_name AS payment_account_display_name,
            a.account_name AS payment_account_name, a.account_number AS payment_account_number,
            o.payment_status, o.payment_reference,
            o.delivery_address, o.customer_phone, o.latitude, o.longitude,
            o.total_amount, o.created_at,
            COALESCE(json_agg(json_build_object(
              'product_name', i.product_name, 'quantity', i.quantity,
              'unit_price', i.unit_price, 'line_total', i.line_total
            )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items,
            (SELECT COALESCE(json_agg(json_build_object(
              'id', p.id, 'provider', p.provider, 'transaction_reference', p.transaction_reference,
              'amount', p.amount, 'status', p.status, 'submitted_at', p.submitted_at,
              'payment_account_display_name', p.payment_account_display_name,
              'payment_account_name', p.payment_account_name,
              'payment_account_number', p.payment_account_number,
              'receipt_file_name', p.receipt_file_name,
              'remarks', p.remarks
            ) ORDER BY p.submitted_at DESC), '[]')
             FROM customer_payment_submissions p WHERE p.order_id = o.id) AS payment_submissions
     FROM customer_orders o
     LEFT JOIN customer_order_items i ON i.order_id = o.id
     LEFT JOIN company_payment_accounts a ON a.id = o.payment_account_id
     WHERE o.customer_id = $1
     GROUP BY o.id, a.display_name, a.account_name, a.account_number
     ORDER BY o.created_at DESC`,
    [req.session.user.id],
  );
  return res.json(result.rows);
});

app.post('/api/orders/:id/payment-submissions', requireUser, requireCustomer, async (req, res) => {
  const accountId = Number(req.body.account_id);
  const transactionReference = String(req.body.transaction_reference || '').trim();
  const amount = Number(req.body.amount);
  const remarks = String(req.body.remarks || '').trim();
  const receiptDataUrl = String(req.body.receipt_data_url || '');
  const receiptFileName = String(req.body.receipt_file_name || '').trim().replace(/[\\/\r\n"]/g, '_');
  const receiptMatch = receiptDataUrl.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/);
  const receiptData = receiptMatch ? Buffer.from(receiptMatch[2], 'base64') : null;
  if (!Number.isInteger(accountId) || accountId < 1 || transactionReference.length < 3
    || transactionReference.length > 100 || !Number.isFinite(amount) || amount <= 0
    || remarks.length > 1000 || !receiptData || receiptData.length === 0 || receiptData.length > 5 * 1024 * 1024
    || !receiptFileName || receiptFileName.length > 150) {
    return res.status(400).json({ message: 'Choose a company account, enter a valid amount and transaction reference, and attach a supported payment receipt up to 5 MB. Remarks must be 1,000 characters or fewer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      `SELECT id, provider, display_name, account_name, account_number
       FROM company_payment_accounts WHERE id = $1 AND is_active = TRUE`,
      [accountId],
    );
    if (!accountResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'That company payment account is not active.' });
    }
    const orderResult = await client.query(
      `SELECT id, payment_method, payment_account_id, total_amount, status, payment_status FROM customer_orders
       WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [req.params.id, req.session.user.id],
    );
    if (!orderResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    const order = orderResult.rows[0];
    if (order.status === 'cancelled' || order.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order cannot accept another payment submission.' });
    }
    const pendingSubmission = await client.query(
      `SELECT id FROM customer_payment_submissions
       WHERE order_id = $1 AND status = 'pending' LIMIT 1`,
      [order.id],
    );
    if (pendingSubmission.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A payment submission for this order is already awaiting review.' });
    }
    if (accountResult.rows[0].provider !== order.payment_method
      || (order.payment_account_id != null && Number(order.payment_account_id) !== accountId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Use the exact active company account selected for this order.' });
    }
    if (Math.abs(Number(order.total_amount) - amount) > 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The submitted amount must match the order total.' });
    }

    const provider = accountResult.rows[0].provider;
    const paymentResult = await client.query(
      `INSERT INTO customer_payment_submissions
       (order_id, customer_id, payment_account_id, payment_account_display_name,
        payment_account_name, payment_account_number, provider, transaction_reference, amount,
        receipt_data, receipt_content_type, receipt_file_name, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, order_id, provider, transaction_reference, amount, status, submitted_at,
                 payment_account_display_name, payment_account_name, payment_account_number,
                 receipt_file_name, remarks`,
      [order.id, req.session.user.id, accountId, accountResult.rows[0].display_name,
        accountResult.rows[0].account_name, accountResult.rows[0].account_number,
        provider, transactionReference, amount, receiptData, receiptMatch[1], receiptFileName, remarks],
    );
    await client.query(
      `UPDATE customer_orders SET payment_method = $1, payment_account_id = COALESCE(payment_account_id, $2),
       payment_reference = $3, payment_status = 'pending', updated_at = NOW() WHERE id = $4`,
      [provider, accountId, transactionReference, order.id],
    );
    await client.query('COMMIT');
    return res.status(201).json(paymentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/api/orders', requireUser, requireCustomer, async (req, res) => {
  const deliveryAddress = String(req.body.delivery_address || '').trim();
  const customerPhone = String(req.body.customer_phone || '').trim();
  const paymentMethod = String(req.body.payment_method || '');
  const paymentAccountId = Number(req.body.payment_account_id);
  const paymentReference = String(req.body.payment_reference || '').trim() || null;
  const { latitude, longitude } = req.body;
  const allowedPaymentMethods = ['telebirr', 'cbe', 'other_bank'];
  if (!deliveryAddress || deliveryAddress.length > 500 || !customerPhone || customerPhone.length > 40) {
    return res.status(400).json({ message: 'Enter a valid delivery address and phone number.' });
  }
  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: 'Choose a supported payment method.' });
  }
  if (!Number.isInteger(paymentAccountId) || paymentAccountId < 1) {
    return res.status(400).json({ message: 'Select a company payment account before placing the order.' });
  }
  if ((latitude == null) !== (longitude == null)
    || (latitude != null && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
    || (longitude != null && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))) {
    return res.status(400).json({ message: 'The delivery location is not valid.' });
  }
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 100) {
    return res.status(400).json({ message: 'Add at least one product to your order.' });
  }

  const requested = new Map();
  for (const item of req.body.items) {
    const productId = String(item.product_id || '');
    const quantity = Number(item.quantity);
    if (!/^\d+$/.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ message: 'An order item or quantity is invalid.' });
    }
    requested.set(productId, (requested.get(productId) || 0) + quantity);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentAccount = await client.query(
      'SELECT id, provider FROM company_payment_accounts WHERE id = $1 AND is_active = TRUE',
      [paymentAccountId],
    );
    if (!paymentAccount.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'That company payment account is no longer active. Refresh the payment methods and select another account.' });
    }
    if (paymentAccount.rows[0].provider !== paymentMethod) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'The selected payment account does not match the payment method.' });
    }
    const productIds = [...requested.keys()];
    const productsResult = await client.query(
      'SELECT id, name, quantity, unit_price FROM products WHERE id = ANY($1::bigint[]) FOR UPDATE',
      [productIds],
    );
    if (productsResult.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'A selected product is no longer available.' });
    }
    for (const product of productsResult.rows) {
      if (requested.get(String(product.id)) > product.quantity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `${product.name} does not have enough stock for that quantity.` });
      }
    }

    const totalAmount = productsResult.rows.reduce((sum, product) => (
      sum + Number(product.unit_price) * requested.get(String(product.id))
    ), 0);
    const orderResult = await client.query(
      `INSERT INTO customer_orders
       (customer_id, payment_method, payment_account_id, payment_reference, delivery_address,
        customer_phone, latitude, longitude, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, status, payment_method, payment_account_id, payment_status, total_amount, created_at`,
      [req.session.user.id, paymentMethod, paymentAccountId, paymentReference, deliveryAddress, customerPhone,
        latitude == null ? null : Number(latitude), longitude == null ? null : Number(longitude), totalAmount],
    );
    const order = orderResult.rows[0];
    for (const product of productsResult.rows) {
      const quantity = requested.get(String(product.id));
      const unitPrice = Number(product.unit_price);
      await client.query(
        `INSERT INTO customer_order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, product.id, product.name, quantity, unitPrice, unitPrice * quantity],
      );
      await client.query('UPDATE products SET quantity = quantity - $1 WHERE id = $2', [quantity, product.id]);
    }
    await client.query('COMMIT');
    return res.status(201).json(order);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/admin/orders', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.status, o.payment_method, o.payment_account_id,
            a.display_name AS payment_account_display_name,
            a.account_name AS payment_account_name, a.account_number AS payment_account_number,
            o.payment_status, o.total_amount,
            o.delivery_address, o.customer_phone, o.latitude, o.longitude, o.created_at,
            u.email AS customer_email, u.full_name AS customer_name,
            (SELECT COALESCE(json_agg(json_build_object(
              'id', p.id, 'provider', p.provider, 'transaction_reference', p.transaction_reference,
              'amount', p.amount, 'status', p.status, 'submitted_at', p.submitted_at,
              'payment_account_display_name', p.payment_account_display_name,
              'payment_account_name', p.payment_account_name,
              'payment_account_number', p.payment_account_number,
              'receipt_file_name', p.receipt_file_name,
              'remarks', p.remarks
            ) ORDER BY p.submitted_at DESC), '[]')
             FROM customer_payment_submissions p WHERE p.order_id = o.id) AS payment_submissions
     FROM customer_orders o
     JOIN app_users u ON u.id = o.customer_id
     LEFT JOIN company_payment_accounts a ON a.id = o.payment_account_id
     ORDER BY o.created_at DESC`,
  );
  return res.json(result.rows);
});

app.get('/api/admin/payment-submissions/:id/receipt', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT receipt_data, receipt_content_type, receipt_file_name
     FROM customer_payment_submissions WHERE id = $1`,
    [req.params.id],
  );
  const receipt = result.rows[0];
  if (!receipt?.receipt_data) return res.status(404).json({ message: 'Payment receipt not found.' });
  res.set('Content-Type', receipt.receipt_content_type);
  res.set('Content-Disposition', `inline; filename="${receipt.receipt_file_name}"`);
  res.set('X-Content-Type-Options', 'nosniff');
  return res.send(receipt.receipt_data);
});

app.patch('/api/admin/orders/:id', requireUser, requireAdmin, async (req, res) => {
  const orderStatuses = ['placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  const paymentStatuses = ['pending', 'paid', 'failed'];
  const status = req.body.status;
  const paymentStatus = req.body.payment_status;
  if ((status !== undefined && !orderStatuses.includes(status))
    || (paymentStatus !== undefined && !paymentStatuses.includes(paymentStatus))
    || (status === undefined && paymentStatus === undefined)) {
    return res.status(400).json({ message: 'Choose a valid order or payment status.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentOrder = await client.query(
      'SELECT status, payment_status FROM customer_orders WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (!currentOrder.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    const nextStatus = status || currentOrder.rows[0].status;
    const nextPaymentStatus = paymentStatus || currentOrder.rows[0].payment_status;
    if (['out_for_delivery', 'delivered'].includes(nextStatus) && nextPaymentStatus !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Payment must be verified and marked paid before dispatch or delivery.' });
    }
    const result = await client.query(
      `UPDATE customer_orders
       SET status = COALESCE($1, status), payment_status = COALESCE($2, payment_status), updated_at = NOW()
       WHERE id = $3 RETURNING id, status, payment_status`,
      [status ?? null, paymentStatus ?? null, req.params.id],
    );
    if (paymentStatus !== undefined) {
      await client.query(
        'UPDATE customer_payment_submissions SET status = $1 WHERE order_id = $2 AND status = $3',
        [paymentStatus, req.params.id, 'pending'],
      );
    }
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/products', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  return res.json(result.rows);
});

app.post('/api/products', requireUser, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const sku = String(req.body.sku || '').trim() || null;
  const category = String(req.body.category || '').trim() || 'General';
  const description = String(req.body.description || '').trim();
  const quantity = Number(req.body.quantity);
  const unitPrice = Number(req.body.unit_price);
  if (!name || name.length > 160 || description.length > 1000) {
    return res.status(400).json({ message: 'Enter a product name and a description under 1000 characters.' });
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ message: 'Quantity must be a non-negative whole number.' });
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return res.status(400).json({ message: 'Enter a valid non-negative unit price.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO products (name, sku, category, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, sku, category, description, quantity, unitPrice],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'A product with this SKU already exists.' });
    throw error;
  }
});

app.delete('/api/products/:id', requireUser, requireAdmin, async (req, res) => {
  const productId = String(req.params.id || '');
  if (!/^\d+$/.test(productId)) {
    return res.status(400).json({ message: 'Choose a valid product.' });
  }

  const result = await pool.query(
    'DELETE FROM products WHERE id = $1 RETURNING id, name',
    [productId],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Product not found.' });
  return res.json({ success: true, ...result.rows[0] });
});

app.get('/api/transactions', requireUser, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM transactions ORDER BY id DESC');
  res.json(result.rows);
});

app.post('/api/transactions', requireUser, requireAdmin, async (req, res) => {
  const { description, amount, type, category, status, date } = req.body;
  const numericAmount = Number(amount);
  if (!String(description || '').trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
    return res.status(400).json({ message: 'Description and a valid non-negative amount are required.' });
  }
  if (!transactionTypes.includes(type) || !transactionStatuses.includes(status || 'Completed')) {
    return res.status(400).json({ message: 'Choose a valid transaction type and status.' });
  }
  const result = await pool.query(
    `INSERT INTO transactions (description, amount, type, category, status, date)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE)) RETURNING *`,
    [String(description).trim(), numericAmount, type, category || 'General', status || 'Completed', date || null],
  );
  return res.status(201).json(result.rows[0]);
});

app.put('/api/transactions/:id', requireUser, requireAdmin, async (req, res) => {
  const { description, amount, type, category, status, date } = req.body;
  const numericAmount = Number(amount);
  if (!String(description || '').trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
    return res.status(400).json({ message: 'Description and a valid non-negative amount are required.' });
  }
  if (!transactionTypes.includes(type) || !transactionStatuses.includes(status)) {
    return res.status(400).json({ message: 'Choose a valid transaction type and status.' });
  }
  const result = await pool.query(
    `UPDATE transactions SET description = $1, amount = $2, type = $3,
     category = $4, status = $5, date = $6 WHERE id = $7 RETURNING *`,
    [String(description).trim(), numericAmount, type, category || 'General', status, date, req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Transaction not found.' });
  return res.json(result.rows[0]);
});

app.patch('/api/transactions/:id', requireUser, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!transactionStatuses.includes(status)) return res.status(400).json({ message: 'Invalid transaction status.' });
  const result = await pool.query(
    'UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Transaction not found.' });
  return res.json(result.rows[0]);
});

app.get('/api/support-requests/mine', requireUser, async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.issue_type, r.title, r.description, r.status, r.created_at, r.source_department,
            (SELECT COALESCE(json_agg(json_build_object(
              'id', reply.id, 'response_type', reply.response_type, 'message', reply.message,
              'created_at', reply.created_at
            ) ORDER BY reply.created_at DESC), '[]')
             FROM support_request_replies reply WHERE reply.support_request_id = r.id) AS replies
     FROM support_requests r WHERE r.reported_by = $1 ORDER BY r.created_at DESC`,
    [req.session.user.id],
  );
  res.json(result.rows);
});

app.get('/api/support-requests/it', requireUser, requireIT, async (req, res) => {
  const result = await pool.query(
    `SELECT request.*,
            (SELECT COALESCE(json_agg(json_build_object(
              'id', reply.id, 'response_type', reply.response_type, 'message', reply.message,
              'created_at', reply.created_at
            ) ORDER BY reply.created_at DESC), '[]')
             FROM support_request_replies reply WHERE reply.support_request_id = request.id) AS replies
     FROM support_requests request WHERE request.target_department = 'IT' ORDER BY request.created_at DESC`,
  );
  res.json(result.rows);
});

app.post('/api/support-requests', requireUser, async (req, res) => {
  const { issue_type: issueType, title, description } = req.body;
  const department = req.session.user.department;
  if (!department || !issueType || !String(title || '').trim() || !String(description || '').trim()) {
    return res.status(400).json({ message: 'Department, issue type, title, and description are required.' });
  }
  const result = await pool.query(
    `INSERT INTO support_requests
     (issue_type, title, description, source_department, target_department, reported_by, reporter_email, status)
     VALUES ($1, $2, $3, $4, 'IT', $5, $6, 'Open') RETURNING id, created_at`,
    [issueType, String(title).trim(), String(description).trim(), department, req.session.user.id, req.session.user.email],
  );
  return res.status(201).json(result.rows[0]);
});

app.patch('/api/support-requests/:id/status', requireUser, requireIT, async (req, res) => {
  const { status } = req.body;
  if (!supportStatuses.includes(status)) return res.status(400).json({ message: 'Invalid support request status.' });
  const result = await pool.query(
    "UPDATE support_requests SET status = $1 WHERE id = $2 AND target_department = 'IT' RETURNING id",
    [status, req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Support request not found.' });
  return res.json({ success: true });
});

app.post('/api/support-requests/:id/replies', requireUser, requireIT, async (req, res) => {
  const responseTypes = ['available', 'busy', 'delayed', 'ready', 'need_info', 'custom'];
  const responseType = String(req.body.response_type || '');
  const message = String(req.body.message || '').trim();
  if (!responseTypes.includes(responseType) || !message || message.length > 2000) {
    return res.status(400).json({ message: 'Choose a response type and enter a reply of up to 2,000 characters.' });
  }

  const result = await pool.query(
    `INSERT INTO support_request_replies (support_request_id, replied_by, response_type, message)
     SELECT request.id, $3, $2, $4
     FROM support_requests request
     WHERE request.id = $1 AND request.target_department = 'IT'
     RETURNING id, support_request_id, response_type, message, created_at`,
    [req.params.id, responseType, req.session.user.id, message],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'IT support request not found.' });
  return res.status(201).json(result.rows[0]);
});

const normalizePhone = (rawPhone) => {
  if (!rawPhone) return '';
  const cleaned = String(rawPhone).replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+251')) return cleaned;
  if (cleaned.startsWith('251')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+251${cleaned.slice(1)}`;
  return `+${cleaned}`;
};

app.post('/api/send-it-alert', requireUser, async (req, res) => {
  const username = process.env.AFRICAS_TALKING_USERNAME?.trim();
  const apiKey = process.env.AFRICAS_TALKING_API_KEY?.trim();
  const itPhone = normalizePhone(process.env.IT_SUPPORT_PHONE);
  if (!username || !apiKey || !itPhone) {
    return res.status(503).json({ message: 'SMS settings are missing from the server .env file.' });
  }

  const { issueType, title, description } = req.body;
  const user = req.session.user;
  const message = [
    'Hello IT Support,',
    `${user.department || 'Your department'} needs help with: ${issueType || 'Support request'}`,
    `Issue title: ${title || 'Support request'}`,
    `Details: ${description || 'No additional details provided.'}`,
    `Department: ${user.department || 'Not provided'}`,
    `Reporter email: ${user.email}`,
    'Please assist as soon as possible.',
  ].join('\n');

  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.africastalking.com/version1/messaging',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', apiKey },
      data: new URLSearchParams({ username, to: itPhone, message }).toString(),
    });
    const recipients = response.data?.SMSMessageData?.Recipients || [];
    const rejected = recipients.find((recipient) => recipient.status !== 'Success' && Number(recipient.statusCode) !== 101);
    if (!recipients.length || rejected) {
      return res.status(502).json({
        message: recipients.length ? `The SMS provider rejected the alert: ${rejected?.status || 'unknown status'}.` : 'The SMS provider returned no delivery result.',
      });
    }
    return res.json({ success: true, message: 'IT alert accepted by the SMS provider.' });
  } catch (error) {
    console.error('SMS provider error:', error.response?.data || error.message);
    return res.status(502).json({ message: 'Failed to send the IT alert.' });
  }
});

const port = Number(process.env.PORT || 4000);
const host = process.env.API_HOST || '127.0.0.1';

async function startServer() {
  try {
    await initializeDatabase();
    await ensureAdminAccount();
    app.listen(port, host, () => {
      console.log(`Rodas local API is running at http://${host}:${port}`);
    });
  } catch (error) {
    console.error('Could not start the local API:', error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

startServer();