import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from 'hono';
import { z } from 'zod';

import { renderUsageChart } from '../lib/chart.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { formatCurrencyUSD } from '../lib/format.js';
import type { ProviderRegistry, UsageProvider } from '../lib/provider.js';
import { getProvider } from '../providers/registry.js';
import type { DailyUsage, ProviderId, UserRecord } from '../lib/types.js';
import {
  memoryTokenStorage,
  type TokenStorage,
} from '../storage/memory.js';

const CACHE_HEADER = 's-maxage=3600';

const providerIds = ['anthropic', 'openai', 'openrouter', 'mock'] as const satisfies
  readonly ProviderId[];

const registerSchema = z.object({
  apiKey: z.string().min(12, 'apiKey must be at least 12 characters'),
  provider: z.enum(providerIds),
});

const daysSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  });

const labelSchema = z.string().optional();
const colorSchema = z.string().optional();

export interface AppOptions {
  storage?: TokenStorage;
  registry?: ProviderRegistry;
  defaultSecret?: string;
  defaultBaseUrl?: string;
  kvStorage?: TokenStorage;
}

export interface AppBindings extends Env {
  Bindings: {
    BURNBADGE_SECRET: string;
    BASE_URL?: string;
    BURNBADGE_KV?: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
  };
}

function resolveSecret(requestSecret?: string, fallbackSecret?: string): string {
  const secret = requestSecret ?? fallbackSecret;
  if (!secret) {
    throw new HTTPException(500, { message: 'Missing BURNBADGE_SECRET' });
  }
  return secret;
}

function makeBadgeResponse({
  label,
  message,
  color,
}: {
  label?: string;
  message: string;
  color?: string;
}) {
  return {
    schemaVersion: 1,
    label: label ?? 'ai spend',
    message,
    color: color ?? 'blueviolet',
    cacheSeconds: 3600,
  } as const;
}

async function loadRecord(token: string, storage: TokenStorage): Promise<UserRecord> {
  const record = await storage.get(token);
  if (!record) {
    throw new HTTPException(404, { message: 'Unknown token' });
  }
  return record;
}

function buildResourceUrls(baseUrl: string, token: string) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    badgeUrl: `${base}/api/badge/${token}`,
    chartUrl: `${base}/api/chart/${token}`,
    usageUrl: `${base}/api/usage/${token}`,
  };
}

function resolveBaseUrl(
  requestUrl: URL,
  envBaseUrl?: string,
  defaultBaseUrl?: string,
): string {
  return envBaseUrl ?? defaultBaseUrl ?? `${requestUrl.protocol}//${requestUrl.host}`;
}

type ShieldsForwardParams = Record<string, string | undefined>;

const SHIELDS_FORWARD_KEYS = [
  'style',
  'logo',
  'logoColor',
  'labelColor',
  'cacheSeconds',
  'logoWidth',
  'logoPosition',
  'link',
] as const;

function pickShieldsParams(
  query: Record<string, string | string[] | undefined>,
): ShieldsForwardParams {
  const params: ShieldsForwardParams = {};
  for (const key of SHIELDS_FORWARD_KEYS) {
    const value = query[key];
    if (typeof value === 'string') {
      params[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      params[key] = value[value.length - 1];
    }
  }
  return params;
}

function buildShieldsUrls(
  baseUrl: string,
  token: string,
  options: {
    days?: number;
    label?: string;
    color?: string;
    forwardParams: ShieldsForwardParams;
  },
): { badgeUrl: string; shieldsUrl: string } {
  const resources = buildResourceUrls(baseUrl, token);
  const badgeUrl = new URL(resources.badgeUrl);

  if (typeof options.days === 'number') {
    badgeUrl.searchParams.set('days', String(options.days));
  }
  if (options.label !== undefined) {
    badgeUrl.searchParams.set('label', options.label);
  }
  if (options.color !== undefined) {
    badgeUrl.searchParams.set('color', options.color);
  }

  const shieldsUrl = new URL('https://img.shields.io/endpoint');
  shieldsUrl.searchParams.set('url', badgeUrl.toString());

  for (const [key, value] of Object.entries(options.forwardParams)) {
    if (value !== undefined && value.length > 0) {
      shieldsUrl.searchParams.set(key, value);
    }
  }

  return {
    badgeUrl: badgeUrl.toString(),
    shieldsUrl: shieldsUrl.toString(),
  };
}

function resolveProvider(
  providerId: ProviderId,
  registry?: ProviderRegistry,
): UsageProvider {
  if (registry) {
    const provider = registry[providerId];
    if (!provider) {
      throw new HTTPException(400, { message: `Unsupported provider: ${providerId}` });
    }
    return provider;
  }
  return getProvider(providerId);
}

function unwrapProviderUsage(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Unknown provider error';
  const safeMessage = message || 'Provider request failed';
  throw new HTTPException(502, { message: `Provider error: ${safeMessage}` });
}

async function fetchUsage(
  provider: UsageProvider,
  apiKey: string,
  days: number | undefined,
): Promise<DailyUsage[]> {
  try {
    return await provider.fetchDailyUsage({ apiKey, days });
  } catch (error) {
    unwrapProviderUsage(error);
  }
}

export function createApp(options: AppOptions = {}) {
  const fallbackStorage = options.storage ?? memoryTokenStorage;
  const kvStorage = options.kvStorage;
  const registry = options.registry;
  const defaultSecret = options.defaultSecret ?? process.env.BURNBADGE_SECRET;
  const defaultBaseUrl = options.defaultBaseUrl ?? process.env.BURNBADGE_BASE_URL;

  const app = new Hono<AppBindings>();

  const getStorage = (c: { env: AppBindings['Bindings'] }): TokenStorage => {
    if (kvStorage && c.env.BURNBADGE_KV) {
      return kvStorage;
    }
    return fallbackStorage;
  };

  app.use('*', cors());

  app.get('/', (c) => c.text('burnbadge api ready'));

  app.post('/api/register', async (c) => {
    const payload = await c.req.json().catch(() => {
      throw new HTTPException(400, { message: 'Invalid JSON body' });
    });

    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const { apiKey, provider } = parsed.data;
    const secret = resolveSecret(c.env?.BURNBADGE_SECRET, defaultSecret);
    const encryptedKey = encryptSecret(apiKey, secret);
    const token = randomUUID();

    const record: UserRecord = {
      token,
      provider,
      encryptedKey,
      createdAt: new Date().toISOString(),
    };

    const storage = getStorage(c);
    await storage.save(record);

    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const urls = buildResourceUrls(baseUrl, token);

    return c.json({ token, ...urls }, 201);
  });

  app.get('/api/badge/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);
    const label = labelSchema.parse(query.label);
    const color = colorSchema.parse(query.color);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    const secret = resolveSecret(c.env?.BURNBADGE_SECRET, defaultSecret);
    const apiKey = decryptSecret(record.encryptedKey, secret);

    const provider = resolveProvider(record.provider, registry);
    const usage = await fetchUsage(provider, apiKey, days);
    const total = usage.reduce((sum, entry) => sum + entry.cost, 0);
    const message = formatCurrencyUSD(total);

    c.header('Cache-Control', CACHE_HEADER);
    return c.json(makeBadgeResponse({ label, message, color }));
  });

  app.get('/api/usage/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    const secret = resolveSecret(c.env?.BURNBADGE_SECRET, defaultSecret);
    const apiKey = decryptSecret(record.encryptedKey, secret);
    const provider = resolveProvider(record.provider, registry);
    const usage = await fetchUsage(provider, apiKey, days);

    c.header('Cache-Control', CACHE_HEADER);
    return c.json({ provider: record.provider, usage });
  });

  app.get('/api/chart/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    const secret = resolveSecret(c.env?.BURNBADGE_SECRET, defaultSecret);
    const apiKey = decryptSecret(record.encryptedKey, secret);
    const provider = resolveProvider(record.provider, registry);
    const usage = await fetchUsage(provider, apiKey, days);
    const svg = renderUsageChart(usage, provider.displayName);

    c.header('Content-Type', 'image/svg+xml; charset=utf-8');
    c.header('Cache-Control', CACHE_HEADER);
    return c.body(svg);
  });

  app.get('/api/shields/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);
    const label = labelSchema.parse(query.label);
    const color = colorSchema.parse(query.color);
    const forwardParams = pickShieldsParams(query);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    const provider = resolveProvider(record.provider, registry);
    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const { badgeUrl, shieldsUrl } = buildShieldsUrls(baseUrl, token, {
      days,
      label,
      color,
      forwardParams,
    });

    const altText = label && label.trim().length > 0 ? label : `${provider.displayName} spend`;
    const markdown = `![${altText}](${shieldsUrl})`;
    const html = `<img src="${shieldsUrl}" alt="${altText}" />`;

    c.header('Cache-Control', 'no-store');
    return c.json({
      provider: record.provider,
      providerName: provider.displayName,
      badgeEndpoint: badgeUrl,
      imageUrl: shieldsUrl,
      markdown,
      html,
    });
  });

  app.get('/api/shields/:token/image', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);
    const label = labelSchema.parse(query.label);
    const color = colorSchema.parse(query.color);
    const forwardParams = pickShieldsParams(query);

    const storage = getStorage(c);
    await loadRecord(token, storage);
    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const { shieldsUrl } = buildShieldsUrls(baseUrl, token, {
      days,
      label,
      color,
      forwardParams,
    });

    return c.redirect(shieldsUrl, 302);
  });

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    console.error('Unhandled error', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}
