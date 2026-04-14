import { createApp } from './app.js';
import { createKVStorage } from '../storage/kv.js';
import type { AppBindings } from './app.js';

export default {
  async fetch(
    request: Request,
    env: AppBindings['Bindings'],
  ): Promise<Response> {
    if (!env.BURNBADGE_KV) {
      return new Response(
        JSON.stringify({ error: 'BURNBADGE_KV not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const kvStorage = createKVStorage(env.BURNBADGE_KV);
    const app = createApp({ kvStorage });

    return app.fetch(request, env);
  },
};
