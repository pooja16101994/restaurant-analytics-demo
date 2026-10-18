import { randomUUID } from 'node:crypto';
import { insertEvent } from './db.js';

export function trackServerEvent(db, { name, visitorId, sessionId, pageUrl, properties = {} }) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
    throw new TypeError('Event names must be lowercase snake_case and at most 64 characters.');
  }
  if (!visitorId || !sessionId) {
    throw new TypeError('Server events require visitor and session identifiers.');
  }

  const event = {
    id: randomUUID(),
    name,
    occurred_at: new Date().toISOString(),
    visitor_id: visitorId,
    session_id: sessionId,
    page_url: pageUrl,
    referrer: '',
    properties,
    source: 'server',
  };
  insertEvent(db, event);
  return event.id;
}
