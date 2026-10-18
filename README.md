# Restaurant Analytics Demo

A small, end-to-end analytics system with a React restaurant demo, a reusable browser tracking SDK, server-confirmed order events, a Node/Express ingestion and reporting API, and SQLite storage.

## Run locally

Requirements: Node.js 22.13 or newer and npm (`node:sqlite` is enabled with Node's `--experimental-sqlite` flag).

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The React dev server proxies `/api` requests to the API at [http://localhost:3001](http://localhost:3001). SQLite data is created at `data/analytics.sqlite`.

To build and run the production app:

```bash
npm run build
npm start
```

The production server serves the built client and API from port 3001. Set `PORT` or `DATABASE_PATH` to override the defaults. Run automated API and persistence tests with `npm test`.

## Deploy to Render

The [`render.yaml`](./render.yaml) blueprint builds the React app, starts the API and static site in one Node service, configures `/api/health` as its health check, and mounts a persistent disk for SQLite.

1. Push this project to a GitHub repository.
2. In Render, choose **New → Blueprint**, connect that repository, and apply the `render.yaml` configuration.
3. Wait for the deploy to finish, then open the `.onrender.com` URL shown for the service.
4. Test a menu order, open Analytics, and confirm the dashboard updates.

The blueprint uses a paid Render instance because persistent disks are not available on the free web-service tier. Keep a single instance: a SQLite database on a persistent disk is not suitable for multiple app instances. Render must be able to use Node 22.13 or newer for the built-in SQLite module.

## Try the complete flow

1. Open **Restaurant** to generate an anonymous `page_view`.
2. Add a menu item to an order. The browser sends `add_to_order`; the API validates and persists the order, then writes an `order_created` event in the same SQLite transaction.
3. Open **Analytics** to see page views, unique visitors, total events, orders, popular pages, event counts, and daily activity.
4. Use the date inputs to filter the dashboard. It refreshes automatically every 15 seconds.

## Browser SDK integration

The importable SDK is in [`src/sdk/browser.js`](./src/sdk/browser.js). A minimal integration looks like:

```js
import { createAnalytics } from './src/sdk/browser.js';

const analytics = createAnalytics({ endpoint: '/api/events' });
analytics.trackPageView();
analytics.trackEvent('search_submitted', { query_length: 12 });
```

`trackEvent` accepts lowercase snake_case event names and object properties. Events are buffered and sent in batches; a page-hide beacon is attempted when the browser supports it. Failed requests are retried on the next flush and logged to the console. The restaurant app uses a shared SDK instance to track virtual page views and order intent. `visitorId` and `sessionId` are exposed for association with a server request. The demo uses those IDs in its order API request; production applications should authenticate and validate identity according to their own trust model.

## Server tracking integration

Use `trackServerEvent` for trusted server-side business events rather than accepting a browser claim that a business action succeeded:

```js
import { trackServerEvent } from './server/tracking.js';

trackServerEvent(db, {
  name: 'subscription_started',
  visitorId,
  sessionId,
  pageUrl: '/checkout',
  properties: { plan: 'monthly' },
});
```

The helper records a timestamp and event ID on the server and marks the source as `server`. In this demo it is called inside the order-creation transaction, so a failed write cannot leave an order without its analytics event or vice versa.

## Architecture and event model

- `src/sdk/browser.js`: framework-independent browser SDK; creates anonymous browser/session IDs, validates event names and payload types, buffers events, and delivers them to the ingestion API.
- `server/app.js`: REST API for menu, browser event ingestion, analytics reports, and demo order creation.
- `server/tracking.js`: trusted server-side event helper.
- `server/db.js`: built-in Node.js SQLite schema, indexes, and persistence helpers.
- `src/App.jsx`: restaurant demo and date-filtered analytics dashboard.

An event contains a UUID `id`, lowercase snake_case `name`, UTC `occurred_at`, anonymous `visitor_id` and `session_id`, a path-only `page_url`, a sanitized `referrer`, object `properties`, and a server-assigned `source`. The visitor ID is stored in local storage; the session ID is stored in session storage. Neither is tied to a login or device fingerprint. The dashboard counts unique visitors across the selected period, not unique people.

### API

- `POST /api/events` — ingest 1–50 browser events. Returns `202` with accepted and duplicate counts; invalid payloads return `400`.
- `GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` — inclusive UTC date range, limited to 366 days. Returns summary metrics, popular pages, top event names, and daily aggregates. Omitting both dates defaults to the previous seven days including today.
- `GET /api/menu` — demo menu.
- `POST /api/orders` — validates a demo order and tracks `order_created` server-side.
- `GET /api/health` — process health check.

## Decisions, tradeoffs, and limitations

- **SQLite** keeps setup reproducible with no external service or native add-on. Node's built-in SQLite API is experimental in this supported Node release; WAL mode and indexes support the demo’s read/write patterns. A high-volume deployment should move to a managed database and define retention/partitioning.
- **At-least-once delivery with idempotency:** browser events have stable IDs and duplicate submissions are ignored, so a retried batch does not double-count. Failed batches remain in memory for retry, but are lost if the tab closes before delivery; durable offline storage is not implemented.
- **Anonymous identity:** local/session storage IDs are simple and privacy-conscious compared with fingerprinting. Clearing storage or switching browsers creates a new visitor. Consent management and authenticated identity stitching are outside this demo.
- **Data minimization:** the SDK records a path, not query parameters, and the server does not persist client IP addresses or user-agent strings. Callers should avoid placing personal or sensitive data in custom properties.
- **Validation and abuse resistance:** request body and field sizes, event shapes, batch size, event names, order quantities, and date windows are bounded. Event ingestion has a per-process in-memory request limit; production deployments need a shared rate limiter, authentication/authorization strategy, TLS, monitoring, and stronger controls against forged browser events.
- **Reporting semantics:** page views count `page_view` events, orders count server-confirmed `order_created` events, and unique visitors are distinct anonymous browser IDs. Trend chart bars show event totals and daily unique visitors are not summed into the visitor KPI.
- **Dashboard scope:** this is a compact reporting surface rather than a general-purpose analytics product. It has no user accounts, saved dashboards, CSV export, timezone selector, or event retention job.
- The visual styling imports Google Fonts; the application remains usable with fallback fonts when external fonts are unavailable.

## Tests

`npm test` exercises event validation and ingestion, idempotency, UTC date-filtered reporting, and atomic order/event persistence using an isolated in-memory SQLite database.

## Submission assets

Before submission, publish the repository under a name and description that do not identify the hiring company, then record and upload:

1. A short demo showing an event flow from the restaurant interaction through the dashboard, with a brief explanation of the architecture and event-delivery decisions.
2. A 1–2 minute personal introduction covering your background, relevant experience, and a recent project or technical challenge.

Verify both videos and the repository are accessible to reviewers. Do not include the hiring company’s name in repository metadata, README content, or submitted materials.
