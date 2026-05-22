import { randomUUID, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from 'hono';
import { z } from 'zod';

import { renderUsageChart } from '../lib/chart.js';
import { formatCurrencyUSD } from '../lib/format.js';
import type { DailyUsage, ProviderId, UserRecord } from '../lib/types.js';
import {
  memoryTokenStorage,
  type TokenStorage,
} from '../storage/memory.js';

const CACHE_HEADER = 's-maxage=3600';

const providerIds = ['anthropic', 'openai', 'openrouter', 'opencode', 'mock'] as const satisfies
  readonly ProviderId[];

const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_USAGE_DAYS = 366;
const MAX_BREAKDOWN_ITEMS = 100;
const MAX_MODEL_LENGTH = 128;
const MAX_PROJECT_NAME_LENGTH = 128;
const MAX_PROJECT_SOURCE_LENGTH = 64;

const createProjectSchema = z.object({
  provider: z.enum(providerIds).optional(),
  name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH).optional(),
  source: z.string().trim().min(1).max(MAX_PROJECT_SOURCE_LENGTH).optional(),
});

const dailyUsageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD format'),
  cost: z.number().finite().nonnegative(),
  breakdown: z
    .array(
      z.object({
        model: z.string().min(1, 'model is required').max(MAX_MODEL_LENGTH),
        cost: z.number().finite().nonnegative(),
      }),
    )
    .max(MAX_BREAKDOWN_ITEMS, `breakdown must include at most ${MAX_BREAKDOWN_ITEMS} items`)
    .optional(),
});

const ingestUsageSchema = z.object({
  provider: z.enum(providerIds).optional(),
  usage: z
    .array(dailyUsageSchema)
    .min(1, 'usage must include at least one daily entry')
    .max(MAX_USAGE_DAYS, `usage must include at most ${MAX_USAGE_DAYS} daily entries`),
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
  defaultBaseUrl?: string;
  kvStorage?: TokenStorage;
  setupRateLimiting?: (app: Hono<AppBindings>) => void;
}

export interface AppBindings extends Env {
  Bindings: {
    BASE_URL?: string;
    BURNBADGE_KV?: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
  };
}

type AppContext = {
  req: {
    url: string;
    json: () => Promise<unknown>;
  };
  env: AppBindings['Bindings'];
  json: (body: unknown, status?: number) => Response;
};

function makeBadgeResponse({
  label,
  provider,
  message,
  color,
}: {
  label?: string;
  provider?: string;
  message: string;
  color?: string;
}) {
  return {
    schemaVersion: 1,
    label: label ?? provider ?? 'burnbadge',
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
  if (!safeEqual(getBadgeToken(record), token)) {
    throw new HTTPException(404, { message: 'Unknown token' });
  }
}

function assertUsageAccess(record: UserRecord, token: string): void {
  if (!safeEqual(getUsageToken(record), token)) {
    throw new HTTPException(404, { message: 'Unknown token' });
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function normalizeUsageWindow(usage: DailyUsage[]): DailyUsage[] {
  const usageByDate = new Map<string, DailyUsage>();

  for (const entry of usage) {
    const breakdown = entry.breakdown
      ?.filter((item) => item.cost > 0)
      .map((item) => ({ model: item.model, cost: item.cost }));

    usageByDate.set(entry.date, {
      date: entry.date,
      cost: entry.cost,
      breakdown: breakdown && breakdown.length > 0 ? breakdown : undefined,
    });
  }

  return Array.from(usageByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function filterUsageWindow(usage: DailyUsage[] | undefined, days?: number): DailyUsage[] {
  const series = normalizeUsageWindow(usage ?? []);
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
    return series;
  }
  return series.slice(-Math.trunc(days));
}

function sumUsageCost(usage: DailyUsage[]): number {
  return usage.reduce((sum, entry) => sum + entry.cost, 0);
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUsageCostForDate(usage: DailyUsage[], date: string): number {
  return usage
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + entry.cost, 0);
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch((error: unknown) => {
    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof Error && error.name === 'BodyLimitError') {
      throw new HTTPException(413, { message: 'Payload Too Large' });
    }

    throw new HTTPException(400, { message: 'Invalid JSON body' });
  });
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

const DEFAULT_PROVIDER_LOGOS: Partial<Record<ProviderId, string>> = {
  anthropic: 'anthropic',
  openai: 'openaigym',
  openrouter: 'openrouter',
};

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

function resolveShieldsParams(
  forwardParams: ShieldsForwardParams,
  provider?: ProviderId,
): ShieldsForwardParams {
  if (forwardParams.logo || !provider) {
    return forwardParams;
  }

  const logo = DEFAULT_PROVIDER_LOGOS[provider];
  if (!logo) {
    return forwardParams;
  }

  return {
    ...forwardParams,
    logo,
  };
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

export function createApp(options: AppOptions = {}) {
  const fallbackStorage = options.storage ?? memoryTokenStorage;
  const kvStorage = options.kvStorage;
  const defaultBaseUrl = options.defaultBaseUrl ?? process.env.BURNBADGE_BASE_URL;

  const app = new Hono<AppBindings>();

  const getStorage = (c: { env: AppBindings['Bindings'] }): TokenStorage => {
    if (kvStorage && c.env.BURNBADGE_KV) {
      return kvStorage;
    }
    return fallbackStorage;
  };

  if (options.setupRateLimiting) {
    options.setupRateLimiting(app);
  }

  app.use('/api/*', bodyLimit({
    maxSize: MAX_REQUEST_BODY_BYTES,
    onError: (c) => c.json({ error: 'Payload Too Large' }, 413),
  }));

  app.use('*', cors());

  app.get('/', (c) => c.text('burnbadge api ready'));

  const handleCreateProject = async (c: AppContext) => {
    const payload = await parseJsonBody(c);
    const parsed = createProjectSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const badgeToken = randomUUID();
    const usageToken = randomUUID();
    const createdAt = new Date().toISOString();

    const record: UserRecord = {
      badgeToken,
      usageToken,
      provider: parsed.data.provider,
      name: parsed.data.name,
      source: parsed.data.source,
      usage: [],
      createdAt,
      updatedAt: createdAt,
    };

    const storage = getStorage(c);
    await storage.save(record);

    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const urls = buildResourceUrls(baseUrl, record);

    return c.json(urls, 201);
  };

  app.post('/api/projects', handleCreateProject);

  app.post('/api/register', handleCreateProject);

  app.post('/api/usage/:token', async (c) => {
    const token = c.req.param('token');
    const payload = await parseJsonBody(c);

    const parsed = ingestUsageSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertUsageAccess(record, token);

    const updatedAt = new Date().toISOString();
    const nextRecord: UserRecord = {
      ...record,
      provider: parsed.data.provider ?? record.provider,
      usage: normalizeUsageWindow(parsed.data.usage),
      lastUpdated: updatedAt,
      updatedAt,
    };

    await replaceRecordTokens(storage, record, nextRecord);

    return c.json({
      provider: nextRecord.provider ?? null,
      usage: nextRecord.usage ?? [],
      lastUpdated: nextRecord.lastUpdated,
      updatedAt: nextRecord.updatedAt,
    });
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
    const usage = filterUsageWindow(record.usage, days);
    const message = formatCurrencyUSD(sumUsageCost(usage));

    c.header('Cache-Control', CACHE_HEADER);
    return c.json(makeBadgeResponse({ label, provider: record.provider, message, color }));
  });

  app.get('/api/usage/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertUsageAccess(record, token);
    const usage = filterUsageWindow(record.usage, days);

    c.header('Cache-Control', CACHE_HEADER);
    return c.json({
      provider: record.provider ?? null,
      name: record.name ?? null,
      source: record.source ?? null,
      usage,
      lastUpdated: record.lastUpdated ?? null,
      updatedAt: record.updatedAt ?? null,
    });
  });

  app.get('/api/status/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertBadgeAccess(record, token);

    const usage = filterUsageWindow(record.usage, days);
    const totalCost = sumUsageCost(usage);
    const todayCost = getUsageCostForDate(usage, todayUtcDate());
    const latestDate = usage.length > 0 ? usage[usage.length - 1]?.date : null;
    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const base = baseUrl.replace(/\/$/, '');
    const badgeUrl = new URL(`${base}/api/badge/${token}`);
    const shieldsImageUrl = new URL(`${base}/api/shields/${token}/image`);

    if (typeof days === 'number') {
      badgeUrl.searchParams.set('days', String(days));
      shieldsImageUrl.searchParams.set('days', String(days));
    }

    c.header('Cache-Control', CACHE_HEADER);
    return c.json({
      provider: record.provider ?? null,
      name: record.name ?? null,
      source: record.source ?? null,
      days: typeof days === 'number' ? days : null,
      totalCost,
      todayCost,
      currency: 'USD',
      latestDate,
      lastUpdated: record.lastUpdated ?? null,
      updatedAt: record.updatedAt ?? null,
      badgeUrl: badgeUrl.toString(),
      shieldsUrl: shieldsImageUrl.toString(),
    });
  });

  app.get('/api/chart/:token', async (c) => {
    const token = c.req.param('token');
    const query = c.req.query();
    const days = daysSchema.parse(query.days);

    const storage = getStorage(c);
    const record = await loadRecord(token, storage);
    assertUsageAccess(record, token);
    const usage = filterUsageWindow(record.usage, days);
    const svg = renderUsageChart(usage, record.provider ?? 'Burnbadge');

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
    const requestUrl = new URL(c.req.url);
    const baseUrl = resolveBaseUrl(requestUrl, c.env?.BASE_URL, defaultBaseUrl);
    const shieldsParams = resolveShieldsParams(forwardParams, record.provider);
    const { badgeUrl, shieldsUrl } = buildShieldsUrls(baseUrl, token, {
      days,
      label,
      color,
      forwardParams: shieldsParams,
    });

    const providerName = record.provider ?? 'Burnbadge';
    const altText = label && label.trim().length > 0 ? label : `${providerName} spend`;
    const markdown = `![${altText}](${shieldsUrl})`;
    const html = `<img src="${shieldsUrl}" alt="${altText}" />`;

    c.header('Cache-Control', 'no-store');
    return c.json({
      provider: record.provider ?? null,
      providerName,
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
    const shieldsParams = resolveShieldsParams(forwardParams, record.provider);
    const { shieldsUrl } = buildShieldsUrls(baseUrl, token, {
      days,
      label,
      color,
      forwardParams: shieldsParams,
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
