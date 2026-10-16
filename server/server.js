const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, '.env');

dotenv.config({
  path: fs.existsSync(rootEnvPath) ? rootEnvPath : localEnvPath
});

const { pool, initializeDatabase } = require('./database');
const createAuthMiddleware = require('./middleware');

const app = express();
const auth = createAuthMiddleware(pool);

// Allow requests from the deployed frontend
app.use(cors({
  origin: 'https://react-project-ixkz.onrender.com',
  credentials: true
}));

app.use(express.json({ limit: '8mb' }));

app.use(session({
  name: 'rodas.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
});

const routeDependencies = { pool, ...auth };

app.use(require('./routes/auth')(routeDependencies));
app.use(require('./routes/department')(routeDependencies));
app.use(require('./routes/adminUsers')(routeDependencies));
app.use(require('./routes/adminOrders')(routeDependencies));
app.use(require('./routes/mainstore')(routeDependencies));
app.use(require('./routes/inventory')(routeDependencies));
app.use(require('./routes/transactions')(routeDependencies));
app.use(require('./routes/customer')(routeDependencies));
app.use(require('./routes/orders')(routeDependencies));
app.use(require('./routes/sales')(routeDependencies));
app.use(require('./routes/support')(routeDependencies));
app.use(require('./routes/hr')(routeDependencies));

const port = Number(process.env.PORT || 4000);
const host = '0.0.0.0';

async function startServer() {
  try {
    await initializeDatabase();
    await auth.ensureAdminAccount();

    app.listen(port, host, () => {
      console.log('Rodas API is running on port ' + port);
    });
  } catch (error) {
    console.error('Could not start the API:', error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

startServer();
