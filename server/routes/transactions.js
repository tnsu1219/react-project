const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireAdmin } = dependencies;
  const transactionTypes = ['Income', 'Expense'];
  const transactionStatuses = ['Completed', 'Pending', 'Failed', 'Inactive'];

  router.get('/api/transactions', requireUser, requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM transactions ORDER BY id DESC');
    res.json(result.rows);
  });

  router.post('/api/transactions', requireUser, requireAdmin, async (req, res) => {
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

  router.put('/api/transactions/:id', requireUser, requireAdmin, async (req, res) => {
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

  router.patch('/api/transactions/:id', requireUser, requireAdmin, async (req, res) => {
    const { status } = req.body;
    if (!transactionStatuses.includes(status)) return res.status(400).json({ message: 'Invalid transaction status.' });
    const result = await pool.query(
      'UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Transaction not found.' });
    return res.json(result.rows[0]);
  });

  return router;
};
