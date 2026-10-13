const express = require('express');

const recordStatuses = {
  vacancy: ['Open', 'On hold', 'Filled', 'Closed'],
  candidate: ['New', 'Screening', 'Shortlisted', 'Rejected', 'Hired'],
  application: ['Received', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'],
  interview: ['Scheduled', 'Completed', 'Cancelled'],
  onboarding: ['Not started', 'In progress', 'Complete', 'On hold'],
  'onboarding-checklist': ['Pending', 'In progress', 'Complete', 'Blocked'],
  training: ['Planned', 'In progress', 'Complete', 'Cancelled'],
  'training-assignment': ['Assigned', 'In progress', 'Complete', 'Missed'],
  'support-case': ['New', 'In progress', 'Waiting', 'Resolved'],
  task: ['To do', 'In progress', 'Complete'],
};
const metadataKeys = {
  vacancy: ['department', 'headcount', 'location'],
  candidate: ['email', 'phone', 'source'],
  application: ['vacancy_id', 'candidate_id'],
  interview: ['scheduled_at', 'interviewers'],
  onboarding: ['job_title', 'start_date', 'manager'],
  'onboarding-checklist': [],
  training: ['scheduled_at', 'location', 'provider'],
  'training-assignment': [],
  'support-case': ['category', 'priority'],
  task: ['priority'],
};
const employeeRecordTypes = new Set(['onboarding', 'training-assignment', 'support-case']);
const assigneeRecordTypes = new Set(['interview', 'support-case', 'task']);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedDocumentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

module.exports = function registerRoutes(dependencies) {
  const router = express.Router();
  const { pool, requireUser } = dependencies;

  function requireHR(req, res, next) {
    if (req.session.user?.role !== 'admin'
      && !(req.session.user?.role === 'user' && req.session.user?.department === 'HR')) {
      return res.status(403).json({ message: 'Human Resources access is required.' });
    }
    return next();
  }

  function requireStaff(req, res, next) {
    if (req.session.user?.role !== 'user') {
      return res.status(403).json({ message: 'A staff account is required.' });
    }
    return next();
  }

  async function logActivity(actorId, recordId, action, details) {
    await pool.query(
      'INSERT INTO hr_activity (actor_id, record_id, action, details) VALUES ($1, $2, $3, $4)',
      [actorId, recordId == null ? null : String(recordId), action, details],
    );
  }

  async function validateEmployee(employeeId) {
    if (employeeId == null || employeeId === '') return null;
    if (!uuidPattern.test(String(employeeId))) return false;
    const result = await pool.query(
      "SELECT id FROM app_users WHERE id = $1 AND role = 'user' AND is_active = TRUE AND is_blocked = FALSE",
      [employeeId],
    );
    return result.rowCount ? String(employeeId) : false;
  }

  async function validateRelatedRecord(recordId, allowedTypes) {
    if (recordId == null || recordId === '') return null;
    if (!uuidPattern.test(String(recordId))) return false;
    const result = await pool.query('SELECT id, record_type FROM hr_records WHERE id = $1', [recordId]);
    if (!result.rowCount || (allowedTypes && !allowedTypes.includes(result.rows[0].record_type))) return false;
    return String(recordId);
  }

  function validateDate(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? false : value;
  }

  function normalizeMetadata(value) {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (entries.length > 30 || entries.some(([key, item]) => (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)
      || (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean' && item !== null)
      || (typeof item === 'string' && item.length > 2000)
    ))) return null;
    return value;
  }

  async function validateRecordInput(body, current) {
    const recordType = current?.record_type || String(body.record_type || '');
    if (!recordStatuses[recordType]) return { error: 'Choose a valid HR record type.' };

    const title = body.title === undefined ? current?.title || '' : typeof body.title === 'string' ? body.title.trim() : '';
    const description = body.description === undefined ? current?.description || '' : typeof body.description === 'string' ? body.description.trim() : '';
    const status = body.status === undefined ? current?.status || '' : String(body.status);
    if (!title || title.length > 160 || description.length > 4000 || !recordStatuses[recordType].includes(status)) {
      return { error: 'Enter a title (up to 160 characters), description (up to 4,000 characters), and valid status.' };
    }

    const employeeInput = body.employee_id === undefined ? current?.employee_id : body.employee_id;
    const assigneeInput = body.assigned_to === undefined ? current?.assigned_to : body.assigned_to;
    const relatedInput = body.related_record_id === undefined ? current?.related_record_id : body.related_record_id;
    const dueDateInput = body.due_date === undefined ? current?.due_date : body.due_date;
    const metadataInput = body.metadata === undefined ? current?.metadata : body.metadata;
    const employeeId = await validateEmployee(employeeInput);
    const assigneeId = await validateEmployee(assigneeInput);
    const allowedRelatedTypes = {
      interview: ['application'],
      'onboarding-checklist': ['onboarding'],
      'training-assignment': ['training'],
    }[recordType] || [];
    const relatedRecordId = await validateRelatedRecord(relatedInput, allowedRelatedTypes);
    const dueDate = validateDate(dueDateInput);
    const metadata = normalizeMetadata(metadataInput);

    if (employeeId === false || assigneeId === false) return { error: 'Choose an active staff member.' };
    if (relatedRecordId === false) return { error: 'Choose a valid related HR record.' };
    if (dueDate === false) return { error: 'Enter a valid due date.' };
    if (metadata === null) return { error: 'Record details contain unsupported or oversized fields.' };
    if (Object.keys(metadata).some((key) => !metadataKeys[recordType].includes(key))) {
      return { error: 'Record details contain fields that are not supported for this record type.' };
    }
    if (employeeId && !employeeRecordTypes.has(recordType)) return { error: 'This record type cannot be linked to an employee.' };
    if (assigneeId && !assigneeRecordTypes.has(recordType)) return { error: 'This record type cannot be assigned to a staff member.' };
    if (metadata.headcount !== undefined && metadata.headcount !== null && metadata.headcount !== ''
      && (!/^\d+$/.test(String(metadata.headcount)) || Number(metadata.headcount) < 1 || Number(metadata.headcount) > 1000)) {
      return { error: 'Positions available must be a whole number between 1 and 1,000.' };
    }
    if (metadata.email && !/^\S+@\S+\.\S+$/.test(String(metadata.email))) {
      return { error: 'Enter a valid candidate email address.' };
    }
    if (metadata.priority && !['Low', 'Normal', 'High', 'Urgent'].includes(String(metadata.priority))) {
      return { error: 'Choose a valid priority.' };
    }
    const relatedTypes = {
      interview: ['application'],
      'onboarding-checklist': ['onboarding'],
      'training-assignment': ['training'],
    }[recordType] || [];
    if (relatedRecordId && !relatedTypes.length) return { error: 'This record type cannot be linked to another record.' };
    if (recordType === 'application') {
      for (const [key, expectedType] of [['candidate_id', 'candidate'], ['vacancy_id', 'vacancy']]) {
        const referenceId = metadata[key];
        if (!referenceId) return { error: `Choose a ${expectedType} for this application.` };
        if (typeof referenceId !== 'string' || !uuidPattern.test(referenceId)) {
          return { error: `Choose a valid ${expectedType}.` };
        }
        const reference = await pool.query(
          'SELECT id FROM hr_records WHERE id = $1 AND record_type = $2',
          [referenceId, expectedType],
        );
        if (!reference.rowCount) return { error: `Choose an existing ${expectedType}.` };
      }
    }
    if (recordType === 'onboarding-checklist' && !relatedRecordId) return { error: 'Choose an onboarding record for this checklist item.' };
    if (recordType === 'training-assignment' && (!relatedRecordId || !employeeId)) {
      return { error: 'Choose a training session and an employee for this assignment.' };
    }

    return {
      value: { recordType, title, description, status, employeeId, assigneeId, relatedRecordId, dueDate, metadata },
    };
  }

  router.get('/api/hr/employees', requireUser, requireHR, async (req, res) => {
    const result = await pool.query(
      `SELECT id, email, COALESCE(NULLIF(full_name, ''), email) AS name, department
       FROM app_users WHERE role = 'user' AND is_active = TRUE AND is_blocked = FALSE
       ORDER BY name`,
    );
    return res.json(result.rows);
  });

  router.get('/api/hr/summary', requireUser, requireHR, async (req, res) => {
    const [records, leave, attendance, activity] = await Promise.all([
      pool.query(
        `SELECT record_type, status, COUNT(*)::int AS count
         FROM hr_records GROUP BY record_type, status`,
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM hr_leave_requests WHERE status = 'Pending'"),
      pool.query('SELECT COUNT(*)::int AS count FROM hr_attendance WHERE work_date = CURRENT_DATE'),
      pool.query(
        `SELECT a.id, a.action, a.details, a.created_at, u.email AS actor_email,
                COALESCE(NULLIF(u.full_name, ''), u.email) AS actor_name
         FROM hr_activity a LEFT JOIN app_users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC LIMIT 8`,
      ),
    ]);

    const counts = {};
    for (const row of records.rows) {
      counts[row.record_type] = (counts[row.record_type] || 0) + row.count;
    }
    const countOpen = (type, terminalStatuses) => records.rows
      .filter((row) => row.record_type === type && !terminalStatuses.includes(row.status))
      .reduce((sum, row) => sum + row.count, 0);

    return res.json({
      vacancies: countOpen('vacancy', ['Filled', 'Closed']),
      candidates: counts.candidate || 0,
      onboarding: countOpen('onboarding', ['Complete']),
      pendingLeave: leave.rows[0].count,
      training: countOpen('training', ['Complete', 'Cancelled']),
      supportCases: countOpen('support-case', ['Resolved']),
      openTasks: countOpen('task', ['Complete']),
      attendanceToday: attendance.rows[0].count,
      recentActivity: activity.rows,
    });
  });

  router.get('/api/hr/records', requireUser, requireHR, async (req, res) => {
    const { type = '', status = '', search = '' } = req.query;
    if (typeof type !== 'string' || (type && !recordStatuses[type])) return res.status(400).json({ message: 'Choose a valid record type filter.' });
    if (typeof status !== 'string' || status.length > 40 || typeof search !== 'string' || search.length > 120) {
      return res.status(400).json({ message: 'Search and filter values are too long.' });
    }
    const result = await pool.query(
      `SELECT r.id, r.record_type, r.title, r.description, r.status, r.employee_id, r.assigned_to,
              r.related_record_id, r.due_date, r.metadata, r.created_at, r.updated_at,
              COALESCE(NULLIF(employee.full_name, ''), employee.email) AS employee_name,
              employee.email AS employee_email,
              COALESCE(NULLIF(assignee.full_name, ''), assignee.email) AS assignee_name
       FROM hr_records r
       LEFT JOIN app_users employee ON employee.id = r.employee_id
       LEFT JOIN app_users assignee ON assignee.id = r.assigned_to
       WHERE ($1 = '' OR r.record_type = $1)
         AND ($2 = '' OR r.status = $2)
         AND ($3 = '' OR r.title ILIKE '%' || $3 || '%' OR r.description ILIKE '%' || $3 || '%')
       ORDER BY r.created_at DESC LIMIT 250`,
      [type, status, search.trim()],
    );
    return res.json(result.rows);
  });

  router.post('/api/hr/records', requireUser, requireHR, async (req, res) => {
    const validated = await validateRecordInput(req.body);
    if (validated.error) return res.status(400).json({ message: validated.error });
    const value = validated.value;
    const result = await pool.query(
      `INSERT INTO hr_records
       (record_type, title, description, status, employee_id, assigned_to, related_record_id, due_date, metadata, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
       RETURNING id, record_type, title, description, status, employee_id, assigned_to,
                 related_record_id, due_date, metadata, created_at, updated_at`,
      [value.recordType, value.title, value.description, value.status, value.employeeId,
        value.assigneeId, value.relatedRecordId, value.dueDate, JSON.stringify(value.metadata), req.session.user.id],
    );
    await logActivity(req.session.user.id, result.rows[0].id, 'created', `Created ${value.recordType}: ${value.title}`);
    return res.status(201).json(result.rows[0]);
  });

  router.patch('/api/hr/records/:id', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'HR record ID is invalid.' });
    const currentResult = await pool.query('SELECT * FROM hr_records WHERE id = $1', [req.params.id]);
    if (!currentResult.rowCount) return res.status(404).json({ message: 'HR record not found.' });
    const current = currentResult.rows[0];
    const validated = await validateRecordInput(req.body, current);
    if (validated.error) return res.status(400).json({ message: validated.error });
    const value = validated.value;
    const result = await pool.query(
      `UPDATE hr_records
       SET title = $1, description = $2, status = $3, employee_id = $4, assigned_to = $5,
           related_record_id = $6, due_date = $7, metadata = $8::jsonb, updated_by = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING id, record_type, title, description, status, employee_id, assigned_to,
                 related_record_id, due_date, metadata, created_at, updated_at`,
      [value.title, value.description, value.status, value.employeeId, value.assigneeId,
        value.relatedRecordId, value.dueDate, JSON.stringify(value.metadata), req.session.user.id, req.params.id],
    );
    await logActivity(req.session.user.id, result.rows[0].id, 'updated', `Updated ${value.recordType}: ${value.title}`);
    return res.json(result.rows[0]);
  });

  router.delete('/api/hr/records/:id', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'HR record ID is invalid.' });
    const result = await pool.query(
      'DELETE FROM hr_records WHERE id = $1 RETURNING id, record_type, title',
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'HR record not found.' });
    await logActivity(req.session.user.id, result.rows[0].id, 'deleted', `Deleted ${result.rows[0].record_type}: ${result.rows[0].title}`);
    return res.json({ success: true });
  });

  router.get('/api/hr/records/:id/documents', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Onboarding record ID is invalid.' });
    const record = await pool.query(
      "SELECT id FROM hr_records WHERE id = $1 AND record_type = 'onboarding'",
      [req.params.id],
    );
    if (!record.rowCount) return res.status(404).json({ message: 'Onboarding record not found.' });
    const result = await pool.query(
      'SELECT id, file_name, content_type, file_size, created_at FROM hr_documents WHERE record_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    );
    return res.json(result.rows);
  });

  router.post('/api/hr/records/:id/documents', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Onboarding record ID is invalid.' });
    const { file_name: fileName, content_type: contentType, data } = req.body;
    const safeFileName = typeof fileName === 'string' ? fileName.replace(/[\\/\r\n"]/g, '').trim() : '';
    if (!safeFileName || safeFileName.length > 180 || !allowedDocumentTypes.has(contentType) || typeof data !== 'string') {
      return res.status(400).json({ message: 'Upload a PDF, JPEG, or PNG document with a valid file name.' });
    }
    const base64 = data.replace(/^data:[^,]*;base64,/, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      return res.status(400).json({ message: 'The document content is not valid base64 data.' });
    }
    const fileData = Buffer.from(base64, 'base64');
    if (fileData.length < 1 || fileData.length > 5 * 1024 * 1024) {
      return res.status(413).json({ message: 'Documents must be no larger than 5 MB.' });
    }
    const hasValidSignature = contentType === 'application/pdf'
      ? fileData.subarray(0, 5).toString('ascii') === '%PDF-'
      : contentType === 'image/png'
        ? fileData.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : fileData.length >= 3 && fileData[0] === 0xff && fileData[1] === 0xd8 && fileData[2] === 0xff;
    if (!hasValidSignature) return res.status(400).json({ message: 'The document content does not match its selected file type.' });
    const record = await pool.query(
      "SELECT id FROM hr_records WHERE id = $1 AND record_type = 'onboarding'",
      [req.params.id],
    );
    if (!record.rowCount) return res.status(404).json({ message: 'Onboarding record not found.' });
    const result = await pool.query(
      `INSERT INTO hr_documents (record_id, uploaded_by, file_name, content_type, file_data, file_size)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_name, content_type, file_size, created_at`,
      [req.params.id, req.session.user.id, safeFileName, contentType, fileData, fileData.length],
    );
    await logActivity(req.session.user.id, req.params.id, 'document uploaded', `Uploaded onboarding document: ${safeFileName}`);
    return res.status(201).json(result.rows[0]);
  });

  router.get('/api/hr/documents/:id/download', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Document ID is invalid.' });
    const result = await pool.query(
      'SELECT record_id, file_name, content_type, file_data FROM hr_documents WHERE id = $1',
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Document not found.' });
    const document = result.rows[0];
    await logActivity(req.session.user.id, document.record_id, 'document downloaded', `Downloaded onboarding document: ${document.file_name}`);
    const encodedName = encodeURIComponent(document.file_name);
    res.set({
      'Content-Type': document.content_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(document.file_data);
  });

  router.delete('/api/hr/documents/:id', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Document ID is invalid.' });
    const result = await pool.query(
      'DELETE FROM hr_documents WHERE id = $1 RETURNING record_id, file_name',
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Document not found.' });
    await logActivity(req.session.user.id, result.rows[0].record_id, 'document deleted', `Deleted onboarding document: ${result.rows[0].file_name}`);
    return res.json({ success: true });
  });

  router.get('/api/hr/activity', requireUser, async (req, res) => {
    const result = await pool.query(
      `SELECT id, action, details, created_at, 'activity' AS item_type
       FROM hr_activity WHERE actor_id = $1
       UNION ALL
       SELECT id, 'assigned task' AS action, title AS details, created_at, 'task' AS item_type
       FROM hr_records WHERE assigned_to = $1 AND record_type = 'task'
       ORDER BY created_at DESC LIMIT 50`,
      [req.session.user.id],
    );
    return res.json(result.rows);
  });

  router.get('/api/hr/leave', requireUser, async (req, res) => {
    const isHR = req.session.user.role === 'admin' || req.session.user.department === 'HR';
    const result = await pool.query(
      `SELECT l.id, l.employee_id, l.start_date, l.end_date, l.reason, l.status, l.reviewed_by, l.reviewed_at, l.created_at,
              COALESCE(NULLIF(employee.full_name, ''), employee.email) AS employee_name,
              employee.email AS employee_email
       FROM hr_leave_requests l JOIN app_users employee ON employee.id = l.employee_id
       WHERE ($1::boolean OR l.employee_id = $2)
       ORDER BY l.created_at DESC LIMIT 250`,
      [isHR, req.session.user.id],
    );
    return res.json(result.rows);
  });

  router.post('/api/hr/leave', requireUser, requireStaff, async (req, res) => {
    const startDate = validateDate(req.body.start_date);
    const endDate = validateDate(req.body.end_date);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!startDate || !endDate || endDate < startDate || !reason || reason.length > 1000) {
      return res.status(400).json({ message: 'Enter valid leave dates and a reason of up to 1,000 characters.' });
    }
    const result = await pool.query(
      `INSERT INTO hr_leave_requests (employee_id, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, employee_id, start_date, end_date, reason, status, created_at`,
      [req.session.user.id, startDate, endDate, reason],
    );
    await logActivity(req.session.user.id, result.rows[0].id, 'leave requested', `Submitted leave request for ${startDate} to ${endDate}`);
    return res.status(201).json(result.rows[0]);
  });

  router.patch('/api/hr/leave/:id/decision', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Leave request ID is invalid.' });
    const status = String(req.body.status || '');
    if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Choose Approve or Reject.' });
    const result = await pool.query(
      `UPDATE hr_leave_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3 AND status = 'Pending' AND employee_id <> $2
       RETURNING id, employee_id, status`,
      [status, req.session.user.id, req.params.id],
    );
    if (!result.rowCount) return res.status(409).json({ message: 'The request is no longer pending, was not found, or cannot be approved by its requester.' });
    await logActivity(req.session.user.id, result.rows[0].id, `leave ${status.toLowerCase()}`, `${status} a leave request.`);
    return res.json(result.rows[0]);
  });

  router.get('/api/hr/attendance', requireUser, async (req, res) => {
    const isHR = req.session.user.role === 'admin' || req.session.user.department === 'HR';
    const result = await pool.query(
      `SELECT a.id, a.employee_id, a.work_date, a.check_in, a.check_out, a.note, a.created_at,
              COALESCE(NULLIF(employee.full_name, ''), employee.email) AS employee_name,
              employee.email AS employee_email
       FROM hr_attendance a JOIN app_users employee ON employee.id = a.employee_id
       WHERE ($1::boolean OR a.employee_id = $2)
       ORDER BY a.work_date DESC, employee_name LIMIT 250`,
      [isHR, req.session.user.id],
    );
    return res.json(result.rows);
  });

  router.post('/api/hr/attendance/clock', requireUser, requireStaff, async (req, res) => {
    const action = String(req.body.action || '');
    if (!['in', 'out'].includes(action)) return res.status(400).json({ message: 'Choose clock-in or clock-out.' });
    if (action === 'in') {
      const result = await pool.query(
        `INSERT INTO hr_attendance (employee_id, check_in)
         VALUES ($1, NOW())
         ON CONFLICT (employee_id, work_date) DO NOTHING
         RETURNING id, employee_id, work_date, check_in, check_out, note`,
        [req.session.user.id],
      );
      if (!result.rowCount) return res.status(409).json({ message: 'Attendance has already been recorded for today.' });
      await logActivity(req.session.user.id, result.rows[0].id, 'clocked in', 'Recorded today’s attendance clock-in.');
      return res.status(201).json(result.rows[0]);
    }
    const result = await pool.query(
      `UPDATE hr_attendance SET check_out = NOW(), updated_at = NOW()
       WHERE employee_id = $1 AND work_date = CURRENT_DATE AND check_in IS NOT NULL AND check_out IS NULL
       RETURNING id, employee_id, work_date, check_in, check_out, note`,
      [req.session.user.id],
    );
    if (!result.rowCount) return res.status(409).json({ message: 'Clock in first; a clock-out has already been recorded or attendance is missing.' });
    await logActivity(req.session.user.id, result.rows[0].id, 'clocked out', 'Recorded today’s attendance clock-out.');
    return res.json(result.rows[0]);
  });

  router.post('/api/hr/attendance/manual', requireUser, requireHR, async (req, res) => {
    const employeeId = String(req.body.employee_id || '');
    const workDate = String(req.body.work_date || '');
    const checkIn = String(req.body.check_in || '');
    const checkOut = String(req.body.check_out || '');
    const reason = String(req.body.reason || '').trim();
    const parsedWorkDate = new Date(`${workDate}T00:00:00.000Z`);
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(workDate)
      && Number.isFinite(parsedWorkDate.getTime())
      && parsedWorkDate.toISOString().slice(0, 10) === workDate;
    const isValidTimestamp = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && Number.isFinite(Date.parse(value));

    if (!uuidPattern.test(employeeId)) return res.status(400).json({ message: 'Choose a valid employee.' });
    if (!isValidDate) return res.status(400).json({ message: 'Choose a valid work date.' });
    if (!isValidTimestamp(checkIn) || !isValidTimestamp(checkOut) || Date.parse(checkOut) <= Date.parse(checkIn)) {
      return res.status(400).json({ message: 'Enter valid clock-in and clock-out times, with clock-out after clock-in.' });
    }
    if (reason.length < 8 || reason.length > 500) {
      return res.status(400).json({ message: 'Give a reason between 8 and 500 characters.' });
    }

    const validEmployeeId = await validateEmployee(employeeId);
    if (!validEmployeeId) return res.status(400).json({ message: 'Choose an active employee.' });

    const details = `HR recorded attendance for ${employeeId} on ${workDate} (${checkIn} to ${checkOut}). Reason: ${reason}`;
    const result = await pool.query(
      `WITH inserted AS (
         INSERT INTO hr_attendance (employee_id, work_date, check_in, check_out, note)
         VALUES ($1, $2::date, $3::timestamptz, $4::timestamptz, $5)
         ON CONFLICT (employee_id, work_date) DO NOTHING
         RETURNING id, employee_id, work_date, check_in, check_out, note
       ), logged AS (
         INSERT INTO hr_activity (actor_id, record_id, action, details)
         SELECT $6, id::text, 'attendance recorded by HR', $7 FROM inserted
         RETURNING id
       )
       SELECT inserted.* FROM inserted CROSS JOIN logged`,
      [validEmployeeId, workDate, checkIn, checkOut, reason, req.session.user.id, details],
    );
    if (!result.rowCount) return res.status(409).json({ message: 'Attendance already exists for this employee and date.' });
    return res.status(201).json(result.rows[0]);
  });

  router.patch('/api/hr/attendance/:id', requireUser, requireHR, async (req, res) => {
    if (!uuidPattern.test(req.params.id)) return res.status(400).json({ message: 'Attendance ID is invalid.' });
    const note = String(req.body.note || '').trim();
    if (note.length > 500) return res.status(400).json({ message: 'Attendance note must be no longer than 500 characters.' });
    const result = await pool.query(
      'UPDATE hr_attendance SET note = $1, updated_at = NOW() WHERE id = $2 RETURNING id, note',
      [note, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Attendance record not found.' });
    await logActivity(req.session.user.id, result.rows[0].id, 'attendance updated', 'Updated an attendance note.');
    return res.json(result.rows[0]);
  });

  return router;
};
