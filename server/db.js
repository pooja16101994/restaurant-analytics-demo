import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const schema = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    page_url TEXT NOT NULL,
    referrer TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL CHECK (source IN ('browser', 'server')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events(occurred_at);
  CREATE INDEX IF NOT EXISTS events_visitor_id_idx ON events(visitor_id);
  CREATE INDEX IF NOT EXISTS events_name_occurred_at_idx ON events(name, occurred_at);

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export function createDatabase(filename = process.env.DATABASE_PATH ?? 'data/analytics.sqlite') {
  const path = filename === ':memory:' ? filename : resolve(filename);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  return db;
}

export function insertEvent(db, event) {
  db.prepare(`
    INSERT INTO events
      (id, name, occurred_at, visitor_id, session_id, page_url, referrer, properties, source)
    VALUES
      (@id, @name, @occurred_at, @visitor_id, @session_id, @page_url, @referrer, @properties, @source)
  `).run({
    ...event,
    properties: JSON.stringify(event.properties),
  });
}

export function insertEventIfNotExists(db, event) {
  return db.prepare(`
    INSERT OR IGNORE INTO events
      (id, name, occurred_at, visitor_id, session_id, page_url, referrer, properties, source)
    VALUES
      (@id, @name, @occurred_at, @visitor_id, @session_id, @page_url, @referrer, @properties, @source)
  `).run({
    ...event,
    properties: JSON.stringify(event.properties),
  }).changes > 0;
}

export function withTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
