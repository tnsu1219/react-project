const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireAdmin } = dependencies;

  router.get('/api/products', requireUser, requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    return res.json(result.rows);
  });

  router.post('/api/products', requireUser, requireAdmin, async (req, res) => {
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

  router.delete('/api/products/:id', requireUser, requireAdmin, async (req, res) => {
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

  return router;
};
