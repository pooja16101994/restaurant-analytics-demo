import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

async function withApi(run) {
  const db = createDatabase(':memory:');
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, db);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
}

test('accepts browser events and reports visitor, page, and event aggregates by date', async () => {
  await withApi(async (base) => {
    const event = {
      id: 'event-1',
      name: 'page_view',
      occurred_at: '2026-01-12T12:00:00.000Z',
      visitor_id: 'visitor-1',
      session_id: 'session-1',
      page_url: '/demo',
      properties: { title: 'Restaurant' },
    };
    const ingest = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event, { ...event, id: 'event-2', visitor_id: 'visitor-2' }] }),
    });
    assert.equal(ingest.status, 202);
    assert.deepEqual(await ingest.json(), { accepted: 2, duplicates: 0 });

    const response = await fetch(`${base}/api/analytics?from=2026-01-12&to=2026-01-12`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.summary, { totalEvents: 2, uniqueVisitors: 2, pageViews: 2 });
    assert.deepEqual(data.popularPages[0], { page: '/demo', views: 2, visitors: 2 });
    assert.deepEqual(data.daily, [{ date: '2026-01-12', events: 2, page_views: 2, visitors: 2 }]);
  });
});

test('rejects malformed events and invalid date ranges while treating retries idempotently', async () => {
  await withApi(async (base) => {
    const invalid = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ name: 'bad name' }] }),
    });
    assert.equal(invalid.status, 400);

    const event = {
      id: 'event-dup', name: 'page_view', occurred_at: '2026-01-12T12:00:00Z',
      visitor_id: 'visitor-1', session_id: 'session-1', page_url: '/demo', properties: {},
    };
    const send = () => fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    });
    assert.equal((await send()).status, 202);
    assert.deepEqual(await (await send()).json(), { accepted: 0, duplicates: 1 });

    const range = await fetch(`${base}/api/analytics?from=2026-02-30&to=2026-01-01`);
    assert.equal(range.status, 400);
  });
});

test('creates an order and its server-confirmed event atomically', async () => {
  await withApi(async (base, db) => {
    const response = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: 'garden-bowl', quantity: 2, visitorId: 'visitor-order', sessionId: 'session-order',
      }),
    });
    assert.equal(response.status, 201);
    const { order } = await response.json();
    assert.equal(order.totalCents, 2900);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1);
    const event = db.prepare('SELECT name, source, visitor_id FROM events').get();
    assert.deepEqual({ ...event }, { name: 'order_created', source: 'server', visitor_id: 'visitor-order' });
  });
});

test('returns JSON for unknown API routes', async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'API endpoint not found.' });
  });
});
