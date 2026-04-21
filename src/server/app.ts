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

const rotateTokensSchema = z
  .object({
    badgeToken: z.boolean().optional(),
    usageToken: z.boolean().optional(),
  })
  .transform((value) => ({
    badgeToken: value.badgeToken ?? true,
    usageToken: value.usageToken ?? true,
  }))
  .refine((value) => value.badgeToken || value.usageToken, {
    message: 'At least one token must be rotated',
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

function getBadgeToken(record: UserRecord): string {
  return record.badgeToken ?? record.token ?? '';
}

function getUsageToken(record: UserRecord): string {
  return record.usageToken ?? record.token ?? '';
}

function getRecordTokens(record: UserRecord): string[] {
  return [record.token, record.badgeToken, record.usageToken].filter(
    (value, index, list): value is string =>
      typeof value === 'string' && value.length > 0 && list.indexOf(value) === index,
  );
}

function assertBadgeAccess(record: UserRecord, token: string): void {
  if (getBadgeToken(record) !== token) {
    throw new HTTPException(404, { message: 'Unknown token' });
  }
}

function assertUsageAccess(record: UserRecord, token: string): void {
  if (getUsageToken(record) !== token) {
    throw new HTTPException(404, { message: 'Unknown token' });
  }
}

function buildResourceUrls(baseUrl: string, record: UserRecord) {
  const base = baseUrl.replace(/\/$/, '');
  const badgeToken = getBadgeToken(record);
  const usageToken = getUsageToken(record);

  return {
    token: badgeToken,
    badgeToken,
    usageToken,
    badgeUrl: `${base}/api/badge/${badgeToken}`,
    chartUrl: `${base}/api/chart/${usageToken}`,
    usageUrl: `${base}/api/usage/${usageToken}`,
  };
}

async function replaceRecordTokens(
  storage: TokenStorage,
  previousRecord: UserRecord,
  nextRecord: UserRecord,
): Promise<void> {
  const previousTokens = getRecordTokens(previousRecord);
  await Promise.all(previousTokens.map((token) => storage.delete(token)));
  await storage.save(nextRecord);
}

async function revokeRecord(storage: TokenStorage, record: UserRecord): Promise<void> {
  const tokens = getRecordTokens(record);
  await Promise.all(tokens.map((token) => storage.delete(token)));
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
  const base = baseUrl.replace(/\/$/, '');
  const badgeUrl = new URL(`${base}/api/badge/${token}`);

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
    const badgeToken = randomUUID();
    const usageToken = randomUUID();

    const record: UserRecord = {
      badgeToken,
      usageToken,
      provider,
      encryptedKey,
      createdAt: new Date().toISOString(),
    };

    const storage = getStorage(c);
    await storage.save(record);

    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const urls = buildResourceUrls(baseUrl, record);

    return c.json(urls, 201);
  });

  app.post('/api/tokens/:token/rotate', async (c) => {
    const token = c.req.param('token');
    const payload = await c.req.json().catch(() => ({}));
    const parsed = rotateTokensSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertUsageAccess(record, token);

    const nextRecord: UserRecord = {
      ...record,
      badgeToken: parsed.data.badgeToken ? randomUUID() : getBadgeToken(record),
      usageToken: parsed.data.usageToken ? randomUUID() : getUsageToken(record),
      createdAt: record.createdAt,
    };
    delete nextRecord.token;

    await replaceRecordTokens(storage, record, nextRecord);

    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    return c.json(buildResourceUrls(baseUrl, nextRecord));
  });

  app.post('/api/tokens/:token/revoke', async (c) => {
    const token = c.req.param('token');
    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertUsageAccess(record, token);

    await revokeRecord(storage, record);

    return c.body(null, 204);
  });

  app.get('/api/badge/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);
    const label = labelSchema.parse(query.label);
    const color = colorSchema.parse(query.color);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertBadgeAccess(record, token);
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
    assertUsageAccess(record, token);
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
    assertUsageAccess(record, token);
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
    assertBadgeAccess(record, token);
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
    const record = await loadRecord(token, storage);
    assertBadgeAccess(record, token);
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
