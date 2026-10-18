import { useCallback, useEffect, useRef, useState } from 'react';
import { analytics } from './sdk/browser.js';

const initialDate = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'The request failed.');
  return body;
}

function Header({ view, setView }) {
  return (
    <header className="topbar">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
        <span className="brand-mark">T<span>&</span>T</span>
        <span>TABLE <i>&</i> THYME<small>NEIGHBORHOOD KITCHEN</small></span>
      </a>
      <nav aria-label="Main navigation">
        <button className={view === 'demo' ? 'nav-link active' : 'nav-link'} onClick={() => setView('demo')}>Restaurant</button>
        <button className={view === 'dashboard' ? 'nav-link active' : 'nav-link'} onClick={() => setView('dashboard')}>Analytics</button>
      </nav>
      <span className="open-status"><span /> OPEN TODAY</span>
    </header>
  );
}

function Restaurant({ menu, loading, onOrder }) {
  const [quantity, setQuantity] = useState({});
  return (
    <main className="restaurant">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">GOOD FOOD, GROWN CLOSE</span>
          <h1>A little more<br /><em>good</em> in your day.</h1>
          <p>Seasonal plates, familiar faces, and ingredients from just around the corner.</p>
          <a href="#menu" className="button button-dark">EXPLORE THE MENU <span>↓</span></a>
        </div>
        <div className="hero-art" aria-label="Illustration of a fresh seasonal meal" role="img">
          <div className="sun" /><div className="plate"><span className="leaf leaf-one">✳</span><span className="leaf leaf-two">✿</span><span className="leaf leaf-three">✽</span><span className="tomato">●</span></div>
          <span className="art-caption">A FRESH TAKE ON THE EVERYDAY</span>
        </div>
        <div className="hero-bottom"><span>MADE WITH CARE, SERVED WITH JOY</span><span>EST. 2018 · PORTLAND, OR</span></div>
      </section>
      <section id="menu" className="menu-section">
        <div className="section-heading"><div><span className="eyebrow">FROM OUR KITCHEN</span><h2>Something lovely<br />for <em>right now.</em></h2></div><p>Thoughtfully made with what’s in season.<br />Always a little different, always delicious.</p></div>
        {loading ? <p className="notice">Loading today’s menu…</p> : (
          <div className="menu-grid">
            {menu.map((item, index) => (
              <article className="menu-card" key={item.id}>
                <div className={`dish-art dish-${index + 1}`}><span>{['🥬', '🍄', '🍊'][index]}</span><small>SEASONAL FAVORITE</small></div>
                <div className="dish-details"><div><h3>{item.name}</h3><p>{item.description}</p></div><strong>{usd.format(item.priceCents / 100)}</strong></div>
                <div className="order-row">
                  <label className="sr-only" htmlFor={`quantity-${item.id}`}>Quantity for {item.name}</label>
                  <select id={`quantity-${item.id}`} value={quantity[item.id] ?? 1} onChange={(event) => setQuantity({ ...quantity, [item.id]: Number(event.target.value) })}>
                    {Array.from({ length: 5 }, (_, i) => <option key={i + 1} value={i + 1}>Qty {i + 1}</option>)}
                  </select>
                  <button className="button button-green" onClick={() => onOrder(item, quantity[item.id] ?? 1)}>ADD TO ORDER <span>↗</span></button>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="menu-note"><span>✳</span> GOOD THINGS TAKE ROOT LOCALLY <span>✳</span></div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, icon }) {
  return <article className="metric"><div className="metric-icon">{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Dashboard() {
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(initialDate);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await request(`/api/analytics?from=${from}&to=${to}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((key) => key + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const maxEvents = Math.max(1, ...(data?.daily ?? []).map((day) => day.events));
  return (
    <main className="dashboard">
      <div className="dashboard-heading"><div><span className="eyebrow">YOUR RESTAURANT, AT A GLANCE</span><h1>Good morning,<br /><em>here’s the picture.</em></h1></div><div className="date-filter"><label>FROM<input aria-label="From date" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><span>—</span><label>TO<input aria-label="To date" type="date" value={to} min={from} max={initialDate} onChange={(event) => setTo(event.target.value)} /></label><button aria-label="Refresh analytics" onClick={() => setRefreshKey((key) => key + 1)}>↻</button></div></div>
      {error && <p className="error notice" role="alert">{error}</p>}
      {!data && !error ? <p className="notice">Loading analytics…</p> : data && <>
        <section className="metrics-grid" aria-label="Analytics summary">
          <Metric label="TOTAL VISITS" value={data.summary.pageViews.toLocaleString()} detail="Page views in this period" icon="↗" />
          <Metric label="UNIQUE VISITORS" value={data.summary.uniqueVisitors.toLocaleString()} detail="Distinct anonymous browsers" icon="◎" />
          <Metric label="EVENTS TRACKED" value={data.summary.totalEvents.toLocaleString()} detail="Browser + server events" icon="✳" />
          <Metric label="ORDERS PLACED" value={(data.eventCounts.find((event) => event.name === 'order_created')?.count ?? 0).toLocaleString()} detail="Server-confirmed orders" icon="▤" />
        </section>
        <section className="dashboard-grid">
          <article className="panel trend-panel">
            <div className="panel-heading"><div><span className="eyebrow">ACTIVITY OVER TIME</span><h2>Daily events</h2></div><span className="legend"><i /> EVENTS</span></div>
            {data.daily.length === 0 ? <p className="empty-state">No events in this date range yet. Try the restaurant demo to generate activity.</p> : <div className="chart" role="img" aria-label={`Daily events: ${data.daily.map((day) => `${day.date} ${day.events} events`).join(', ')}`}>
              {data.daily.map((day) => <div className="chart-column" key={day.date}><span className="bar-value">{day.events}</span><div className="bar" style={{ height: `${Math.max(5, (day.events / maxEvents) * 100)}%` }} /><span className="chart-date">{day.date.slice(5).replace('-', '/')}</span></div>)}
            </div>}
          </article>
          <article className="panel pages-panel">
            <div className="panel-heading"><div><span className="eyebrow">WHERE THEY GO</span><h2>Popular pages</h2></div><span className="table-label">VIEWS</span></div>
            {data.popularPages.length === 0 ? <p className="empty-state">Pages will show up here after your first visit.</p> : <ol className="pages-list">{data.popularPages.map((page, index) => <li key={page.page}><span className="page-rank">{String(index + 1).padStart(2, '0')}</span><span className="page-path">{page.page}</span><span className="page-views">{page.views.toLocaleString()}</span></li>)}</ol>}
          </article>
          <article className="panel events-panel">
            <div className="panel-heading"><div><span className="eyebrow">WHAT PEOPLE DO</span><h2>Top events</h2></div></div>
            {data.eventCounts.length === 0 ? <p className="empty-state">Tracked actions will appear here.</p> : <div className="event-list">{data.eventCounts.map((event) => <div className="event-row" key={event.name}><span className="event-dot" /><code>{event.name}</code><strong>{event.count}</strong></div>)}</div>}
          </article>
          <article className="panel note-panel"><span className="eyebrow">A NOTE ON THE NUMBERS</span><p>Visitors are anonymous browser IDs. Server-confirmed orders are tracked separately from clicks, so the numbers reflect what actually made it through.</p><button className="text-button" onClick={() => setRefreshKey((key) => key + 1)}>REFRESH DATA ↗</button></article>
        </section>
      </>}
    </main>
  );
}

export default function App() {
  const [view, setView] = useState('demo');
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const lastTrackedView = useRef(null);

  useEffect(() => {
    void request('/api/menu').then((result) => setMenu(result.items))
      .catch((error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (lastTrackedView.current !== view) {
      analytics.trackPageView(view === 'demo' ? '/demo' : '/dashboard');
      lastTrackedView.current = view;
    }
  }, [view]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(''), 4_000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const order = async (item, quantity) => {
    analytics.trackEvent('add_to_order', { item_id: item.id, item_name: item.name, quantity });
    try {
      const result = await request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          quantity,
          visitorId: analytics.visitorId,
          sessionId: analytics.sessionId,
        }),
      });
      setNotice(`Order confirmed — ${quantity} × ${item.name}, ${usd.format(result.order.totalCents / 100)}.`);
    } catch (error) {
      setNotice(`Order could not be placed: ${error.message}`);
    }
  };

  return <><Header view={view} setView={setView} />{notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}{view === 'demo' ? <Restaurant menu={menu} loading={loading} onOrder={order} /> : <Dashboard />}<footer className="footer"><span>TABLE <i>&</i> THYME · GOOD FOOD, GROWN CLOSE</span><span>BUILT WITH CARE <b>✳</b> ANALYTICS DEMO</span></footer></>;
}
