const assert = require('node:assert/strict');
const express = require('express');
const { test } = require('node:test');
const registerMainstoreRoutes = require('../routes/mainstore');

async function createTestServer(user, pool) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(registerMainstoreRoutes({ pool, requireUser: (req, res, next) => next() }));
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

test('non-Mainstore staff cannot read inventory balances', async (context) => {
  let queryCount = 0;
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'Sales' },
    { query: async () => { queryCount += 1; return { rows: [] }; } },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/mainstore/stock`);
  assert.equal(response.status, 403);
  assert.equal(queryCount, 0);
});

test('Mainstore receipt updates stock and records the operator and balance', async (context) => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '7';
  const calls = [];
  const movement = {
    id: '22222222-2222-4222-8222-222222222222',
    product_id: Number(productId),
    movement_type: 'receipt',
    quantity: 15,
    balance_before: 20,
    balance_after: 35,
    reference_number: 'GRN-104',
  };
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql === 'SELECT id, quantity FROM products WHERE id = $1 FOR UPDATE') {
        return { rowCount: 1, rows: [{ id: Number(productId), quantity: 20 }] };
      }
      if (sql.startsWith('INSERT INTO inventory_movements')) return { rowCount: 1, rows: [movement] };
      return { rowCount: 1, rows: [] };
    },
    release: () => {},
  };
  const app = await createTestServer(
    { id: actorId, role: 'user', department: 'Mainstore' },
    { connect: async () => client },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/mainstore/stock/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      movement_type: 'receipt',
      quantity: 15,
      reference_number: 'GRN-104',
      counterparty: 'North Supply Co',
      reason: 'Accepted against purchase receipt',
    }),
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).balance_after, 35);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.deepEqual(calls[2].values, [35, productId]);
  assert.match(calls[3].sql, /INSERT INTO inventory_movements/);
  assert.equal(calls[3].values[8], actorId);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('Mainstore cannot issue more than available stock', async (context) => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql === 'SELECT id, quantity FROM products WHERE id = $1 FOR UPDATE') {
        return { rowCount: 1, rows: [{ id: 7, quantity: 4 }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release: () => {},
  };
  const app = await createTestServer(
    { id: '11111111-1111-4111-8111-111111111111', role: 'user', department: 'Mainstore' },
    { connect: async () => client },
  );
  context.after(() => app.close());

  const response = await fetch(`${app.url}/api/mainstore/stock/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: '7',
      movement_type: 'issue',
      quantity: 5,
      reference_number: 'ISS-209',
      counterparty: 'Production line 2',
      reason: 'Material issue for work order 209',
    }),
  });

  assert.equal(response.status, 409);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.some((sql) => sql.startsWith('UPDATE products')), false);
  assert.equal(calls.some((sql) => sql.startsWith('INSERT INTO inventory_movements')), false);
});