const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireCustomer } = dependencies;

  router.get('/api/orders/mine', requireUser, requireCustomer, async (req, res) => {
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

  router.post('/api/orders/:id/payment-submissions', requireUser, requireCustomer, async (req, res) => {
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

  router.post('/api/orders', requireUser, requireCustomer, async (req, res) => {
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

  return router;
};
