import { serve } from '@hono/node-server';

import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '', 10) || 8787;

const app = createApp();

console.log(`burnbadge API listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
