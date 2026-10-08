const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, '.env');
dotenv.config({ path: fs.existsSync(rootEnvPath) ? rootEnvPath : localEnvPath });

const { pool, initializeDatabase } = require('./database');

async function setupAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Set a valid ADMIN_EMAIL in the project-root .env file.');
  }
  if (password.length < 6) {
    throw new Error('Set an ADMIN_PASSWORD with at least 6 characters in the project-root .env file.');
  }

  await initializeDatabase();
  const existing = await pool.query('SELECT id, role FROM app_users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rows[0].role !== 'admin') {
    throw new Error(`The email ${email} already belongs to a non-admin account; choose another email.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  if (existing.rowCount) {
    await pool.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [passwordHash, existing.rows[0].id]);
    console.log(`Updated the password for administrator ${email}.`);
  } else {
    await pool.query(
      "INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, 'admin')",
      [email, passwordHash],
    );
    console.log(`Created administrator ${email}.`);
  }
}

setupAdmin()
  .catch((error) => {
    console.error('Could not set up the administrator:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());