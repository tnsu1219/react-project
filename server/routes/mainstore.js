const express = require('express');

module.exports = function registerMainstoreRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser } = dependencies;

  function requireMainstore(req, res, next) {
    if (req.session.user?.role !== 'admin'
      && !(req.session.user?.role === 'user' && req.session.user?.department === 'Mainstore')) {
      return res.status(403).json({ message: 'Mainstore department access is required.' });
    }
    return next();
  }

  router.get('/api/mainstore/stock', requireUser, requireMainstore, async (req, res) => {
    const [products, movements] = await Promise.all([
      pool.query(
        `SELECT id, name, sku, category, quantity, reorder_level
         FROM products ORDER BY name`,
      ),
      pool.query(
        `SELECT m.id, m.product_id, p.name AS product_name, p.sku,
                m.movement_type, m.quantity, m.balance_before, m.balance_after,
                m.reference_number, m.counterparty, m.reason, m.created_at,
                COALESCE(NULLIF(u.full_name, ''), u.email, 'Former user') AS recorded_by
         FROM inventory_movements m
         JOIN products p ON p.id = m.product_id
         LEFT JOIN app_users u ON u.id = m.created_by
         ORDER BY m.created_at DESC LIMIT 200`,
      ),
    ]);
    return res.json({ products: products.rows, movements: movements.rows });
  });

  router.post('/api/mainstore/stock/movements', requireUser, requireMainstore, async (req, res) => {
    const productId = String(req.body.product_id || '');
    const movementType = String(req.body.movement_type || '');
    const quantity = Number(req.body.quantity);
    const referenceNumber = String(req.body.reference_number || '').trim();
    const counterparty = String(req.body.counterparty || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!/^\d+$/.test(productId) || Number(productId) < 1) {
      return res.status(400).json({ message: 'Choose a valid stock item.' });
    }
    if (!['receipt', 'issue'].includes(movementType)) {
      return res.status(400).json({ message: 'Choose receive or issue.' });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
      return res.status(400).json({ message: 'Quantity must be a whole number between 1 and 1,000,000.' });
    }
    if (!referenceNumber || referenceNumber.length > 100 || !counterparty || counterparty.length > 160
      || !reason || reason.length > 500) {
      return res.status(400).json({ message: 'Enter a reference, supplier or destination, and reason.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const productResult = await client.query(
        'SELECT id, quantity FROM products WHERE id = $1 FOR UPDATE',
        [productId],
      );
      if (!productResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Stock item not found.' });
      }

      const balanceBefore = productResult.rows[0].quantity;
      if (movementType === 'issue' && quantity > balanceBefore) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Issue quantity exceeds available stock.' });
      }
      const adjustment = movementType === 'receipt' ? quantity : -quantity;
      const balanceAfter = balanceBefore + adjustment;
      await client.query(
        'UPDATE products SET quantity = $1 WHERE id = $2',
        [balanceAfter, productId],
      );
      const movement = await client.query(
        `INSERT INTO inventory_movements
         (product_id, movement_type, quantity, balance_before, balance_after,
          reference_number, counterparty, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, product_id, movement_type, quantity, balance_before, balance_after,
                   reference_number, counterparty, reason, created_at`,
        [productId, movementType, quantity, balanceBefore, balanceAfter,
          referenceNumber, counterparty, reason, req.session.user.id],
      );
      await client.query('COMMIT');
      return res.status(201).json(movement.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
};