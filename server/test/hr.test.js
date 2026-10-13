const assert = require('node:assert/strict');
const express = require('express');
const { test } = require('node:test');
const registerHRRoutes = require('../routes/hr');

async function createTestServer(user, pool) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(registerHRRoutes({
    pool,
    requireUser: (req, res, next) => next(),
  }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('non-HR staff cannot read HR records', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'Sales' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/records`);
  assert.equal(response.status, 403);
  assert.equal(queryCount, 0);
});

test('invalid HR records are rejected before database access', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'HR' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_type: 'unknown', title: '', status: 'Open' }),
  });
  assert.equal(response.status, 400);
  assert.equal(queryCount, 0);
});

test('HR record creation uses parameterized queries and writes an audit event', async (context) => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const record = {
    id: '22222222-2222-4222-8222-222222222222',
    record_type: 'task',
    title: 'Prepare onboarding schedule',
    description: '',
    status: 'To do',
    employee_id: null,
    assigned_to: null,
    related_record_id: null,
    due_date: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO hr_records')) return { rowCount: 1, rows: [record] };
      if (sql.includes('INSERT INTO hr_activity')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected database query: ${sql}`);
    },
  };
  const app = await createTestServer({ id: userId, role: 'user', department: 'HR' }, pool);
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_type: 'task', title: record.title, description: '', status: 'To do' }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).id, record.id);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /VALUES \(\$1, \$2, \$3/);
  assert.deepEqual(calls[0].values.slice(0, 4), ['task', record.title, '', 'To do']);
  assert.match(calls[1].sql, /INSERT INTO hr_activity/);
});

test('leave requests cannot end before they start', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'HR' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: '2026-10-12', end_date: '2026-10-10', reason: 'Personal leave' }),
  });
  assert.equal(response.status, 400);
  assert.equal(queryCount, 0);
});

test('applications require valid candidate and vacancy links', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'HR' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_type: 'application', title: 'New application', status: 'Received', metadata: {} }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Choose a (candidate|vacancy)/);
  assert.equal(queryCount, 0);
});

test('HR manual attendance requires valid input before database access', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'HR' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/attendance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee_id: '22222222-2222-4222-8222-222222222222',
      work_date: '2026-10-13',
      check_in: '2026-10-13T09:00:00.000Z',
      check_out: '2026-10-13T08:00:00.000Z',
      reason: 'Forgot to clock out',
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(queryCount, 0);
});

test('non-HR staff cannot create manual attendance records', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'Sales' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/attendance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee_id: '22222222-2222-4222-8222-222222222222',
      work_date: '2026-10-13',
      check_in: '2026-10-13T08:00:00.000Z',
      check_out: '2026-10-13T16:00:00.000Z',
      reason: 'Verified missed punch',
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(queryCount, 0);
});

test('HR manual attendance writes the attendance and audit event together', async (context) => {
  const employeeId = '22222222-2222-4222-8222-222222222222';
  const calls = [];
  const attendance = {
    id: '33333333-3333-4333-8333-333333333333',
    employee_id: employeeId,
    work_date: '2026-10-13',
    check_in: '2026-10-13T08:00:00.000Z',
    check_out: '2026-10-13T16:00:00.000Z',
    note: 'Employee forgot to clock in',
  };
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('SELECT id FROM app_users')) return { rowCount: 1, rows: [{ id: employeeId }] };
      if (sql.includes('WITH inserted AS')) return { rowCount: 1, rows: [attendance] };
      throw new Error(`Unexpected database query: ${sql}`);
    },
  };
  const actorId = '11111111-1111-4111-8111-111111111111';
  const app = await createTestServer({ id: actorId, role: 'user', department: 'HR' }, pool);
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/hr/attendance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee_id: employeeId,
      work_date: '2026-10-13',
      check_in: attendance.check_in,
      check_out: attendance.check_out,
      reason: attendance.note,
    }),
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).id, attendance.id);
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /INSERT INTO hr_attendance/);
  assert.match(calls[1].sql, /INSERT INTO hr_activity/);
  assert.match(calls[1].sql, /ON CONFLICT \(employee_id, work_date\) DO NOTHING/);
  assert.equal(calls[1].values[5], actorId);
  assert.match(calls[1].values[6], /Employee forgot to clock in/);
});
