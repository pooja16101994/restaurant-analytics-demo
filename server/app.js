import express from 'express';
import { randomUUID } from 'node:crypto';
import { insertEvent, insertEventIfNotExists, withTransaction } from './db.js';
import { trackServerEvent } from './tracking.js';

const menu = [
  { id: 'garden-bowl', name: 'Harvest garden bowl', description: 'Roasted squash, farro, greens & maple tahini', priceCents: 1450 },
  { id: 'mushroom-toast', name: 'Wild mushroom toast', description: 'Sourdough, whipped ricotta & herbs', priceCents: 1250 },
  { id: 'citrus-cake', name: 'Olive oil citrus cake', description: 'Seasonal citrus, crème fraîche', priceCents: 850 },
];

const eventNamePattern = /^[a-z][a-z0-9_]{0,63}$/;
const identifierPattern = /^[a-zA-Z0-9_-]{1,80}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validIdentifier(value) {
  return typeof value === 'string' && identifierPattern.test(value);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function rangeFromQuery(query) {
  const from = query.from;
  const to = query.to;
  if (from === undefined && to === undefined) {
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    return { from: startDate.toISOString().slice(0, 10), to: end };
  }
  if (!validDate(from) || !validDate(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > 365) return null;
  return { from, to };
}

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb', strict: true }));

  const eventRequests = new Map();
  app.use('/api/events', (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (eventRequests.get(key) ?? []).filter((time) => now - time < 60_000);
    if (recent.length >= 120) return res.status(429).json({ error: 'Event rate limit exceeded.' });
    recent.push(now);
    eventRequests.set(key, recent);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/menu', (_req, res) => res.json({ items: menu }));

  app.post('/api/events', (req, res) => {
    const { events } = req.body ?? {};
    if (!Array.isArray(events) || events.length < 1 || events.length > 50) {
      return res.status(400).json({ error: 'Provide between 1 and 50 events.' });
    }

    const normalized = [];
    for (const event of events) {
      if (!isPlainObject(event) ||
        typeof event.name !== 'string' || !eventNamePattern.test(event.name) ||
        !validIdentifier(event.id) || !validIdentifier(event.visitor_id) ||
        !validIdentifier(event.session_id) ||
        typeof event.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at)) ||
        typeof event.page_url !== 'string' || event.page_url.length > 500 ||
        typeof (event.referrer ?? '') !== 'string' || (event.referrer ?? '').length > 500 ||
        !isPlainObject(event.properties) || JSON.stringify(event.properties).length > 4_000) {
        return res.status(400).json({ error: 'An event has an invalid shape or exceeds a field limit.' });
      }
      normalized.push({
        id: event.id,
        name: event.name,
        occurred_at: new Date(event.occurred_at).toISOString(),
        visitor_id: event.visitor_id,
        session_id: event.session_id,
        page_url: event.page_url,
        referrer: event.referrer ?? '',
        properties: event.properties,
        source: 'browser',
      });
    }

    const accepted = withTransaction(db, () => {
      let accepted = 0;
      for (const event of normalized) {
        if (insertEventIfNotExists(db, event)) accepted += 1;
      }
      return accepted;
    });
    return res.status(202).json({ accepted, duplicates: normalized.length - accepted });
  });

  app.get('/api/analytics', (req, res) => {
    const range = rangeFromQuery(req.query);
    if (!range) return res.status(400).json({ error: 'Use valid from/to dates spanning no more than 366 days.' });
    const start = `${range.from}T00:00:00.000Z`;
    const endExclusive = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 86_400_000).toISOString();
    const params = { start, end: endExclusive };
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_events,
        COUNT(DISTINCT visitor_id) AS unique_visitors,
        COALESCE(SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END), 0) AS page_views
      FROM events WHERE occurred_at >= @start AND occurred_at < @end
    `).get(params);
    const popularPages = db.prepare(`
      SELECT page_url AS page, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM events
      WHERE name = 'page_view' AND occurred_at >= @start AND occurred_at < @end
      GROUP BY page_url ORDER BY views DESC, page ASC LIMIT 10
    `).all(params);
    const eventCounts = db.prepare(`
      SELECT name, COUNT(*) AS count FROM events
      WHERE occurred_at >= @start AND occurred_at < @end
      GROUP BY name ORDER BY count DESC, name ASC LIMIT 10
    `).all(params);
    const daily = db.prepare(`
      SELECT substr(occurred_at, 1, 10) AS date,
        COUNT(*) AS events,
        SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        COUNT(DISTINCT visitor_id) AS visitors
      FROM events
      WHERE occurred_at >= @start AND occurred_at < @end
      GROUP BY substr(occurred_at, 1, 10) ORDER BY date ASC
    `).all(params);
    return res.json({
      range,
      summary: {
        totalEvents: summary.total_events,
        uniqueVisitors: summary.unique_visitors,
        pageViews: summary.page_views,
      },
      popularPages,
      eventCounts,
      daily,
    });
  });

  app.post('/api/orders', (req, res) => {
    const { itemId, quantity, visitorId, sessionId } = req.body ?? {};
    const item = menu.find((entry) => entry.id === itemId);
    if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 ||
      !validIdentifier(visitorId) || !validIdentifier(sessionId)) {
      return res.status(400).json({ error: 'Choose a menu item, quantity from 1 to 10, and valid analytics identifiers.' });
    }

    const order = {
      id: randomUUID(),
      itemId: item.id,
      itemName: item.name,
      quantity,
      totalCents: item.priceCents * quantity,
      createdAt: new Date().toISOString(),
    };

    withTransaction(db, () => {
      db.prepare(`
        INSERT INTO orders (id, item_id, item_name, quantity, total_cents, created_at)
        VALUES (@id, @itemId, @itemName, @quantity, @totalCents, @createdAt)
      `).run(order);
      trackServerEvent(db, {
        name: 'order_created',
        visitorId,
        sessionId,
        pageUrl: '/demo',
        properties: {
          order_id: order.id,
          item_id: item.id,
          item_name: item.name,
          quantity,
          total_cents: order.totalCents,
          currency: 'USD',
        },
      });
    });
    return res.status(201).json({ order });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    if (error.status === 413) {
      return res.status(413).json({ error: 'Request body exceeds the 64 KB limit.' });
    }
    console.error('API request failed:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => res.sendFile('index.html', { root: 'dist' }));
  }

  return app;
}
