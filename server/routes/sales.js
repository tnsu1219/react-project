const express = require('express');

module.exports = function registerSalesRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser } = dependencies;

  function requireSales(req, res, next) {
    if (req.session.user?.role !== 'admin'
      && !(req.session.user?.role === 'user' && req.session.user?.department === 'Sales')) {
      return res.status(403).json({ message: 'Sales department access is required.' });
    }
    return next();
  }

  router.get('/api/sales/orders', requireUser, requireSales, async (req, res) => {
    const result = await pool.query(
      `SELECT o.id, o.status, o.payment_method, o.payment_status, o.total_amount,
              o.delivery_address, o.customer_phone, o.created_at,
              COALESCE(NULLIF(u.full_name, ''), u.email) AS customer_name,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'product_name', i.product_name, 'quantity', i.quantity,
                  'unit_price', i.unit_price, 'line_total', i.line_total
                ) ORDER BY i.id)
                FROM customer_order_items i WHERE i.order_id = o.id
              ), '[]'::json) AS items
       FROM customer_orders o
       JOIN app_users u ON u.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 300`,
    );
    return res.json(result.rows);
  });

  router.patch('/api/sales/orders/:id/status', requireUser, requireSales, async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(400).json({ message: 'Order ID is invalid.' });
    }
    const nextStatus = String(req.body.status || '');
    if (!['accepted', 'preparing'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Sales can accept new orders or start preparing accepted orders.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT status FROM customer_orders WHERE id = $1 FOR UPDATE',
        [req.params.id],
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Order not found.' });
      }
      const previousStatus = current.rows[0].status;
      const validTransition = (previousStatus === 'placed' && nextStatus === 'accepted')
        || (previousStatus === 'accepted' && nextStatus === 'preparing');
      if (!validTransition) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'This order has changed or cannot move to that status.' });
      }

      const updated = await client.query(
        `UPDATE customer_orders SET status = $1, updated_at = NOW()
         WHERE id = $2 RETURNING id, status, updated_at`,
        [nextStatus, req.params.id],
      );
      await client.query(
        `INSERT INTO customer_order_status_history
         (order_id, actor_id, previous_status, new_status)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, req.session.user.id, previousStatus, nextStatus],
      );
      await client.query('COMMIT');
      return res.json(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
};