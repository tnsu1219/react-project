const assert = require('node:assert/strict');
const express = require('express');
const { test } = require('node:test');
const registerSalesRoutes = require('../routes/sales');

async function createTestServer(user, pool) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(registerSalesRoutes({ pool, requireUser: (req, res, next) => next() }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('non-Sales staff cannot read customer orders', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'HR' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/sales/orders`);
  assert.equal(response.status, 403);
  assert.equal(queryCount, 0);
});

test('Sales order acceptance updates status and records its actor atomically', async (context) => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql === 'SELECT status FROM customer_orders WHERE id = $1 FOR UPDATE') {
        return { rowCount: 1, rows: [{ status: 'placed' }] };
      }
      if (sql.startsWith('UPDATE customer_orders')) {
        return { rowCount: 1, rows: [{ id: orderId, status: 'accepted', updated_at: '2026-10-13T09:00:00.000Z' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release: () => {},
  };
  const app = await createTestServer(
    { id: actorId, role: 'user', department: 'Sales' },
    { connect: async () => client },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/sales/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'accepted' }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'accepted');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[3].sql, /INSERT INTO customer_order_status_history/);
  assert.deepEqual(calls[3].values, [orderId, actorId, 'placed', 'accepted']);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('Sales cannot skip directly from a new order to preparation', async (context) => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql === 'SELECT status FROM customer_orders WHERE id = $1 FOR UPDATE') {
        return { rowCount: 1, rows: [{ status: 'placed' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release: () => {},
  };
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'Sales' },
    { connect: async () => client },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/sales/orders/22222222-2222-4222-8222-222222222222/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'preparing' }),
  });

  assert.equal(response.status, 409);
  assert.equal(calls.at(-1), 'ROLLBACK');
});