const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireAdmin } = dependencies;

  router.get('/api/admin/payment-accounts', requireUser, requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM company_payment_accounts ORDER BY created_at DESC');
    return res.json(result.rows);
  });

  router.post('/api/admin/payment-accounts', requireUser, requireAdmin, async (req, res) => {
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

  router.patch('/api/admin/payment-accounts/:id', requireUser, requireAdmin, async (req, res) => {
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

  router.get('/api/admin/orders', requireUser, requireAdmin, async (req, res) => {
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

  router.get('/api/admin/payment-submissions/:id/receipt', requireUser, requireAdmin, async (req, res) => {
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

  router.patch('/api/admin/orders/:id', requireUser, requireAdmin, async (req, res) => {
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
      if (status !== undefined && status !== currentOrder.rows[0].status) {
        await client.query(
          `INSERT INTO customer_order_status_history
           (order_id, actor_id, previous_status, new_status)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, req.session.user.id, currentOrder.rows[0].status, status],
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

  return router;
};
