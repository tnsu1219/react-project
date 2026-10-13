const express = require('express');
const axios = require('axios');

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser, requireIT } = dependencies;
  const supportStatuses = ['Open', 'In Progress', 'On Hold', 'Resolved', 'Notification sent to technician'];
  const supportPriorities = ['Low', 'Medium', 'High', 'Urgent'];
  const maxSupportRequestId = 9223372036854775807n;
  const isValidSupportRequestId = (id) => /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= maxSupportRequestId;
  const normalizePhone = (rawPhone) => {
    if (!rawPhone) return '';
    const cleaned = String(rawPhone).replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+251')) return cleaned;
    if (cleaned.startsWith('251')) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+251' + cleaned.slice(1);
    return '+' + cleaned;
  };

  router.get('/api/support-requests/mine', requireUser, async (req, res) => {
    const result = await pool.query(
      `SELECT r.id, r.issue_type, r.title, r.description, r.status, r.created_at, r.source_department,
              (SELECT COALESCE(json_agg(json_build_object(
                'id', reply.id, 'response_type', reply.response_type, 'message', reply.message,
                'created_at', reply.created_at
              ) ORDER BY reply.created_at DESC), '[]')
               FROM support_request_replies reply
               WHERE reply.support_request_id = r.id AND reply.response_type <> 'internal_note') AS replies
       FROM support_requests r WHERE r.reported_by = $1 ORDER BY r.created_at DESC`,
      [req.session.user.id],
    );
    res.json(result.rows);
  });

  router.get('/api/support-requests/it', requireUser, requireIT, async (req, res) => {
    const result = await pool.query(
      `SELECT request.*,
              (SELECT COALESCE(json_agg(json_build_object(
                'id', reply.id, 'response_type', reply.response_type, 'message', reply.message,
                'created_at', reply.created_at
              ) ORDER BY reply.created_at DESC), '[]')
               FROM support_request_replies reply WHERE reply.support_request_id = request.id) AS replies
       FROM support_requests request WHERE request.target_department = 'IT' ORDER BY request.created_at DESC`,
    );
    res.json(result.rows);
  });

  router.post('/api/support-requests', requireUser, async (req, res) => {
    const { issue_type: issueType, title, description } = req.body;
    const department = req.session.user.department;
    if (!department || !issueType || !String(title || '').trim() || !String(description || '').trim()) {
      return res.status(400).json({ message: 'Department, issue type, title, and description are required.' });
    }
    const result = await pool.query(
      `INSERT INTO support_requests
       (issue_type, title, description, source_department, target_department, reported_by, reporter_email, status)
       VALUES ($1, $2, $3, $4, 'IT', $5, $6, 'Open') RETURNING id, created_at`,
      [issueType, String(title).trim(), String(description).trim(), department, req.session.user.id, req.session.user.email],
    );
    return res.status(201).json(result.rows[0]);
  });

  router.patch('/api/support-requests/:id/status', requireUser, requireIT, async (req, res) => {
    const { status } = req.body;
    if (!isValidSupportRequestId(req.params.id)) {
      return res.status(400).json({ message: 'Support request ID is invalid.' });
    }
    if (!supportStatuses.includes(status)) return res.status(400).json({ message: 'Invalid support request status.' });
    const result = await pool.query(
      "UPDATE support_requests SET status = $1 WHERE id = $2 AND target_department = 'IT' RETURNING id",
      [status, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Support request not found.' });
    return res.json({ success: true });
  });

  router.patch('/api/support-requests/:id/assign', requireUser, requireIT, async (req, res) => {
    const assignedTo = String(req.body.assigned_to || '').trim();
    if (!isValidSupportRequestId(req.params.id)) {
      return res.status(400).json({ message: 'Support request ID is invalid.' });
    }
    if (!assignedTo || assignedTo.length > 100) {
      return res.status(400).json({ message: 'Enter an assignee name of up to 100 characters.' });
    }
    const result = await pool.query(
      `UPDATE support_requests SET assigned_to = $1
       WHERE id = $2 AND target_department = 'IT' RETURNING id, assigned_to`,
      [assignedTo, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Support request not found.' });
    return res.json(result.rows[0]);
  });

  router.patch('/api/support-requests/:id/priority', requireUser, requireIT, async (req, res) => {
    const priority = String(req.body.priority || '');
    if (!isValidSupportRequestId(req.params.id)) {
      return res.status(400).json({ message: 'Support request ID is invalid.' });
    }
    if (!supportPriorities.includes(priority)) {
      return res.status(400).json({ message: 'Choose a valid support request priority.' });
    }
    const result = await pool.query(
      `UPDATE support_requests SET priority = $1
       WHERE id = $2 AND target_department = 'IT' RETURNING id, priority`,
      [priority, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Support request not found.' });
    return res.json(result.rows[0]);
  });

  router.post('/api/support-requests/:id/replies', requireUser, requireIT, async (req, res) => {
    const responseTypes = ['available', 'busy', 'delayed', 'ready', 'need_info', 'custom', 'public_reply', 'internal_note'];
    const responseType = String(req.body.response_type || '');
    const message = String(req.body.message || '').trim();
    if (!isValidSupportRequestId(req.params.id)) {
      return res.status(400).json({ message: 'Support request ID is invalid.' });
    }
    if (!responseTypes.includes(responseType) || !message || message.length > 2000) {
      return res.status(400).json({ message: 'Choose a response type and enter a reply of up to 2,000 characters.' });
    }
  
    const result = await pool.query(
      `INSERT INTO support_request_replies (support_request_id, replied_by, response_type, message)
       SELECT request.id, $3, $2, $4
       FROM support_requests request
       WHERE request.id = $1 AND request.target_department = 'IT'
       RETURNING id, support_request_id, response_type, message, created_at`,
      [req.params.id, responseType, req.session.user.id, message],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'IT support request not found.' });
    return res.status(201).json(result.rows[0]);
  });

  router.post('/api/send-it-alert', requireUser, async (req, res) => {
    const username = process.env.AFRICAS_TALKING_USERNAME?.trim();
    const apiKey = process.env.AFRICAS_TALKING_API_KEY?.trim();
    const itPhone = normalizePhone(process.env.IT_SUPPORT_PHONE);
    if (!username || !apiKey || !itPhone) {
      return res.status(503).json({ message: 'SMS settings are missing from the server .env file.' });
    }
  
    const { issueType, title, description } = req.body;
    const user = req.session.user;
    const message = [
      'Hello IT Support,',
      `${user.department || 'Your department'} needs help with: ${issueType || 'Support request'}`,
      `Issue title: ${title || 'Support request'}`,
      `Details: ${description || 'No additional details provided.'}`,
      `Department: ${user.department || 'Not provided'}`,
      `Reporter email: ${user.email}`,
      'Please assist as soon as possible.',
    ].join('\n');
  
    try {
      const response = await axios({
        method: 'post',
        url: 'https://api.africastalking.com/version1/messaging',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', apiKey },
        data: new URLSearchParams({ username, to: itPhone, message }).toString(),
      });
      const recipients = response.data?.SMSMessageData?.Recipients || [];
      const rejected = recipients.find((recipient) => recipient.status !== 'Success' && Number(recipient.statusCode) !== 101);
      if (!recipients.length || rejected) {
        return res.status(502).json({
          message: recipients.length ? `The SMS provider rejected the alert: ${rejected?.status || 'unknown status'}.` : 'The SMS provider returned no delivery result.',
        });
      }
      return res.json({ success: true, message: 'IT alert accepted by the SMS provider.' });
    } catch (error) {
      console.error('SMS provider error:', error.response?.data || error.message);
      return res.status(502).json({ message: 'Failed to send the IT alert.' });
    }
  });

  return router;
};