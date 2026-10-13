const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireCustomer } = dependencies;

  router.get('/api/catalog', requireUser, requireCustomer, async (req, res) => {
    const result = await pool.query(
      'SELECT id, name, sku, category, description, quantity, unit_price FROM products WHERE quantity > 0 ORDER BY category, name',
    );
    return res.json(result.rows);
  });

  router.get('/api/customer/profile', requireUser, requireCustomer, async (req, res) => {
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

  router.put('/api/customer/profile', requireUser, requireCustomer, async (req, res) => {
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

  router.get('/api/payment-accounts', requireUser, requireCustomer, async (req, res) => {
    const result = await pool.query(
      `SELECT id, provider, display_name, account_name, account_number, instructions
       FROM company_payment_accounts WHERE is_active = TRUE ORDER BY provider, display_name`,
    );
    return res.json(result.rows);
  });

  return router;
};
