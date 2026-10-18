const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;

function createId() {
  return crypto.randomUUID();
}

function getOrCreate(storage, key) {
  let value = storage.getItem(key);
  if (!value) {
    value = createId();
    storage.setItem(key, value);
  }
  return value;
}

function safeReferrer() {
  if (!document.referrer) return '';
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

export function createAnalytics({ endpoint = '/api/events', flushIntervalMs = 2_000 } = {}) {
  const visitorId = getOrCreate(localStorage, 'restaurant-analytics-visitor');
  const sessionId = getOrCreate(sessionStorage, 'restaurant-analytics-session');
  let queue = [];
  let timer;

  async function flush() {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Analytics ingestion returned HTTP ${response.status}.`);
    } catch (error) {
      queue = [...batch, ...queue].slice(-200);
      console.warn('Analytics events could not be delivered; they will be retried.', error);
    }
  }

  function track(name, properties = {}, pageUrl = window.location.pathname) {
    if (!EVENT_NAME.test(name)) throw new TypeError('Event names must be lowercase snake_case and at most 64 characters.');
    if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new TypeError('Event properties must be an object.');
    }
    if (queue.length >= 200) queue.shift();
    queue.push({
      id: createId(),
      name,
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      page_url: pageUrl.slice(0, 500),
      referrer: safeReferrer(),
      properties,
    });
    if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, flushIntervalMs);
  }

  function trackPageView(pageUrl = window.location.pathname) {
    track('page_view', { title: document.title }, pageUrl);
  }

  function handlePageHide() {
    if (!queue.length || !navigator.sendBeacon) return;
    const payload = JSON.stringify({ events: queue });
    if (navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))) queue = [];
  }

  window.addEventListener('pagehide', handlePageHide);

  return {
    visitorId,
    sessionId,
    trackPageView,
    trackEvent: track,
    flush,
    destroy() {
      clearTimeout(timer);
      window.removeEventListener('pagehide', handlePageHide);
      void flush();
    },
  };
}

export const analytics = createAnalytics();
