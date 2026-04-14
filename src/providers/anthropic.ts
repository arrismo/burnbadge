import type { DailyUsage, DailyUsageBreakdown } from '../lib/types.js';
import type { ProviderFetchArgs, UsageProvider } from '../lib/provider.js';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/usage/costs';
const MAX_DAYS = 90;

type AnthropicUsageEntry = Record<string, unknown>;

interface AnthropicUsageResponse {
  data?: AnthropicUsageEntry[];
}

function clampDays(days?: number): number {
  if (typeof days === 'number' && Number.isFinite(days)) {
    return Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  }
  return 30;
}

function buildUrl(days: number, now: Date): URL {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const url = new URL(ANTHROPIC_ENDPOINT);
  url.searchParams.set('granularity', 'day');
  url.searchParams.set('start_date', start.toISOString().slice(0, 10));
  url.searchParams.set('end_date', end.toISOString().slice(0, 10));
  return url;
}

function resolveDate(entry: AnthropicUsageEntry): string {
  const candidate =
    (typeof entry.date === 'string' && entry.date) ||
    (typeof entry.day === 'string' && entry.day) ||
    (typeof entry.start_date === 'string' && entry.start_date) ||
    (typeof entry.interval_start === 'string' && entry.interval_start) ||
    (typeof entry.start_time === 'string' && entry.start_time) ||
    resolveNestedDate(entry.interval) ||
    resolveNestedDate(entry.time_window);

  if (!candidate) {
    throw new Error('Anthropic usage entry missing date');
  }

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse Anthropic usage date: ${candidate}`);
  }

  return date.toISOString().slice(0, 10);
}

function resolveNestedDate(candidate: unknown): string | undefined {
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }
  const value = (candidate as Record<string, unknown>).start;
  return typeof value === 'string' ? value : undefined;
}

function extractCostValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (
    typeof value === 'object' &&
    value &&
    'usd' in value &&
    typeof value.usd === 'number'
  ) {
    return value.usd;
  }
  if (
    typeof value === 'object' &&
    value &&
    'cost' in value &&
    typeof value.cost === 'number'
  ) {
    return value.cost;
  }
  if (
    typeof value === 'object' &&
    value &&
    'credits' in value &&
    typeof value.credits === 'number'
  ) {
    return value.credits;
  }
  return undefined;
}

function resolveCost(entry: AnthropicUsageEntry): number {
  const candidate =
    extractCostValue(entry.total_costs) ??
    extractCostValue(entry.total_cost) ??
    extractCostValue(entry.total) ??
    extractCostValue(entry.costs) ??
    extractCostValue(entry.cost) ??
    undefined;

  return typeof candidate === 'number' ? candidate : 0;
}

function normalizeBreakdown(entry: AnthropicUsageEntry): DailyUsageBreakdown[] | undefined {
  const sources =
    (Array.isArray(entry.models) && entry.models) ||
    (Array.isArray(entry.model_costs) && entry.model_costs) ||
    (Array.isArray(entry.per_model) && entry.per_model) ||
    (Array.isArray(entry.breakdown) && entry.breakdown) ||
    [];

  const breakdown = sources
    .map((raw) => {
      if (!raw || typeof raw !== 'object') {
        return undefined;
      }
      const typed = raw as Record<string, unknown>;
      const model =
        (typeof typed.model === 'string' && typed.model) ||
        (typeof typed.name === 'string' && typed.name) ||
        (typeof typed.id === 'string' && typed.id);
      const cost = extractCostValue(
        typed.costs ?? typed.cost ?? typed.usd ?? typed.total,
      );
      if (!model || typeof cost !== 'number' || cost <= 0) {
        return undefined;
      }
      return { model, cost } satisfies DailyUsageBreakdown;
    })
    .filter((value): value is DailyUsageBreakdown => Boolean(value));

  return breakdown.length > 0 ? breakdown : undefined;
}

export function normalizeAnthropicUsage(entries: AnthropicUsageEntry[]): DailyUsage[] {
  const usage: DailyUsage[] = [];

  for (const entry of entries) {
    try {
      const date = resolveDate(entry);
      const cost = resolveCost(entry);
      const breakdown = normalizeBreakdown(entry);
      usage.push(breakdown ? { date, cost, breakdown } : { date, cost });
    } catch {
      // Ignore malformed rows
    }
  }

  usage.sort((a, b) => a.date.localeCompare(b.date));
  return usage;
}

export const anthropicProvider: UsageProvider = {
  id: 'anthropic',
  displayName: 'Anthropic',
  async fetchDailyUsage(args: ProviderFetchArgs): Promise<DailyUsage[]> {
    const days = clampDays(args.days);
    const now = args.now ?? new Date();
    const url = buildUrl(days, now);

    const response = await fetch(url, {
      headers: {
        'x-api-key': args.apiKey,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Anthropic usage request failed with status ${response.status}`);
    }

    const json = (await response.json()) as AnthropicUsageResponse;
    const entries = Array.isArray(json.data) ? json.data : [];
    const usage = normalizeAnthropicUsage(entries);

    if (usage.length === 0) {
      throw new Error('No Anthropic usage data returned');
    }

    return usage;
  },
};

export default anthropicProvider;
