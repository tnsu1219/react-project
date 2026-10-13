const express = require('express');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser } = dependencies;
  const departmentWorkStatuses = {
    Sales: ['Pending', 'In progress', 'Closed'],
    HR: ['New', 'In progress', 'Waiting', 'Complete'],
    Finance: ['Pending', 'Under review', 'Complete'],
    Mainstore: ['Pending', 'Processing', 'Complete'],
    Attendance: ['Pending', 'Investigating', 'Resolved'],
    Auditor: ['Open', 'In progress', 'Closed'],
    Logistics: ['Planned', 'In transit', 'Delivered'],
  };

  router.get('/api/department-work-items', requireUser, async (req, res) => {
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

  router.post('/api/department-work-items', requireUser, async (req, res) => {
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

  router.patch('/api/department-work-items/:id', requireUser, async (req, res) => {
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

  router.delete('/api/department-work-items/:id', requireUser, async (req, res) => {
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

  return router;
};