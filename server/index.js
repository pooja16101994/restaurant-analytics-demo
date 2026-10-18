import { createDatabase } from './db.js';
import { createApp } from './app.js';

const db = createDatabase();
const app = createApp(db);
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Analytics API listening on http://localhost:${port}`);
});
