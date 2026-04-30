import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

import { createApp } from './app.js';
import { rateLimiter } from 'hono-rate-limiter';

const port = Number.parseInt(process.env.PORT ?? '', 10) || 8787;

const apiApp = createApp({
  setupRateLimiting: (app) => {
    const keyGen = (c: { req: { header: (name: string) => string | undefined } }) =>
      c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';

    const projectCreateOpts = {
      windowMs: 60_000,
      limit: 5,
      keyGenerator: keyGen,
    };

    const generalOpts = {
      windowMs: 60_000,
      limit: 100,
      keyGenerator: keyGen,
    };

    app.use('/api/projects', rateLimiter(projectCreateOpts));
    app.use('/api/register', rateLimiter(projectCreateOpts));
    app.use('*', rateLimiter(generalOpts));
  },
});

const staticApp = new Hono();
const serveDocs = serveStatic({ root: 'website/build', index: 'index.html' });

staticApp.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) {
    await next();
    return;
  }

  await serveDocs(c, next);
});

staticApp.route('/', apiApp);

console.log(`burnbadge listening on http://localhost:${port}`);

serve({
  fetch: staticApp.fetch,
  port,
});
