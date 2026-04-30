import { createApp } from './app.js';
import { createKVStorage } from '../storage/kv.js';
import { rateLimiter } from 'hono-rate-limiter';
import type { AppBindings } from './app.js';

type CfEnv = AppBindings['Bindings'] & {
  PROJECT_CREATE_LIMITER: RateLimit;
  GENERAL_LIMITER: RateLimit;
};

export default {
  async fetch(
    request: Request,
    env: CfEnv,
  ): Promise<Response> {
    if (!env.BURNBADGE_KV) {
      return new Response(
        JSON.stringify({ error: 'BURNBADGE_KV not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const kvStorage = createKVStorage(env.BURNBADGE_KV);
    const app = createApp({
      kvStorage,
      setupRateLimiting: (app) => {
        const projectCreateKeyGen = (
          c: { req: { header: (name: string) => string | undefined } },
        ) => c.req.header('cf-connecting-ip') ?? '';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bindProjectCreate = (c: any) => c.env.PROJECT_CREATE_LIMITER;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bindGeneral = (c: any) => c.env.GENERAL_LIMITER;

        app.use('/api/projects', rateLimiter({
          binding: bindProjectCreate,
          keyGenerator: projectCreateKeyGen,
          message: { error: 'Too many project creations. Try again later.' },
        }));

        app.use('/api/register', rateLimiter({
          binding: bindProjectCreate,
          keyGenerator: projectCreateKeyGen,
          message: { error: 'Too many project creations. Try again later.' },
        }));

        app.use('*', rateLimiter({
          binding: bindGeneral,
          keyGenerator: projectCreateKeyGen,
        }));
      },
    });

    return app.fetch(request, env);
  },
};
