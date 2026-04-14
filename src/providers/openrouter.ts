import type { DailyUsage, DailyUsageBreakdown } from '../lib/types.js';
import type { ProviderFetchArgs, UsageProvider } from '../lib/provider.js';

const OPENROUTER_ACTIVITY_ENDPOINT = 'https://openrouter.ai/api/v1/activity';
const MAX_DAYS = 30;
const DEFAULT_DAYS = 30;
const CURRENCY_PRECISION = 4;

interface ActivityItem {
  date: string;
  model: string;
  model_permaslug?: string;
  endpoint_id?: string;
  provider_name?: string;
  usage?: number;
  byok_usage_inference?: number;
  requests?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
}

interface ActivityResponse {
  data?: ActivityItem[];
}

class OpenRouterError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function clampDays(days?: number): number {
  if (typeof days === 'number' && Number.isFinite(days)) {
    const rounded = Math.trunc(days);
    if (rounded >= 1) {
      return Math.min(rounded, MAX_DAYS);
    }
  }
  return DEFAULT_DAYS;
}

function roundCurrency(value: number, precision = CURRENCY_PRECISION): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatUTCDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractUTCDate(base: Date, days: number): Date {
  const copy = new Date(base.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

function createDailyUsage(
  date: string,
  total: number,
  models: Map<string, number>,
): DailyUsage {
  const roundedTotal = roundCurrency(total);
  if (models.size === 0 || roundedTotal === 0) {
    return { date, cost: roundedTotal };
  }

  const entries = Array.from(models.entries()).sort((a, b) => b[1] - a[1]);
  const breakdown: DailyUsageBreakdown[] = [];
  let remaining = roundedTotal;

  entries.forEach(([model, rawCost], index) => {
    const isLast = index === entries.length - 1;
    const rounded = isLast ? roundCurrency(remaining) : roundCurrency(rawCost);
    if (rounded > 0) {
      breakdown.push({ model, cost: rounded });
      remaining = roundCurrency(remaining - rounded);
    }
  });

  return breakdown.length > 0
    ? { date, cost: roundedTotal, breakdown }
    : { date, cost: roundedTotal };
}

export function normalizeOpenRouterActivity(
  items: ActivityItem[],
  options: { days: number; now: Date },
): DailyUsage[] {
  const grouped = new Map<string, { total: number; models: Map<string, number> }>();

  for (const item of items) {
    const date = typeof item.date === 'string' ? item.date.slice(0, 10) : undefined;
    if (!date) {
      continue;
    }
    const model = typeof item.model === 'string' && item.model.length > 0 ? item.model : 'unknown';
    const cost = (Number(item.usage) || 0) + (Number(item.byok_usage_inference) || 0);

    if (!grouped.has(date)) {
      grouped.set(date, { total: 0, models: new Map() });
    }

    const bucket = grouped.get(date)!;
    bucket.total += cost;
    bucket.models.set(model, (bucket.models.get(model) || 0) + cost);
  }

  const series: DailyUsage[] = [];
  const { days, now } = options;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const targetDate = formatUTCDate(subtractUTCDate(now, offset));
    const bucket = grouped.get(targetDate);
    if (!bucket) {
      series.push({ date: targetDate, cost: 0 });
      continue;
    }
    series.push(createDailyUsage(targetDate, bucket.total, bucket.models));
  }

  return series;
}

async function fetchActivity(apiKey: string): Promise<ActivityItem[]> {
  const response = await fetch(OPENROUTER_ACTIVITY_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    throw new OpenRouterError('OpenRouter API key was rejected (401 Unauthorized).', 401);
  }

  if (response.status === 403) {
    throw new OpenRouterError(
      'OpenRouter management API key required to access activity analytics.',
      403,
    );
  }

  if (!response.ok) {
    throw new OpenRouterError(
      `OpenRouter activity request failed with status ${response.status}.`,
      response.status,
    );
  }

  const payload = (await response.json()) as ActivityResponse;
  if (!payload || !Array.isArray(payload.data)) {
    return [];
  }
  return payload.data;
}

export const openrouterProvider: UsageProvider = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  async fetchDailyUsage(args: ProviderFetchArgs): Promise<DailyUsage[]> {
    const days = clampDays(args.days);
    const now = args.now ?? new Date();
    const activity = await fetchActivity(args.apiKey);
    return normalizeOpenRouterActivity(activity, { days, now });
  },
};

export default openrouterProvider;
