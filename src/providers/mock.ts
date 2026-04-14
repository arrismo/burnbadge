import type { DailyUsage, DailyUsageBreakdown } from '../lib/types.js';
import type { ProviderFetchArgs, UsageProvider } from '../lib/provider.js';

const DEFAULT_DAYS = 7;

type ImmutableDailyUsage = Readonly<DailyUsage>;

const MOCK_BREAKDOWNS: readonly DailyUsageBreakdown[][] = [
  [
    { model: 'anthropic/claude-3-opus', cost: 640.25 },
    { model: 'google/gemini-2.0-pro', cost: 208.75 },
  ],
  [
    { model: 'openai/gpt-4.1', cost: 412.65 },
    { model: 'mistral/mixtral-8x22b', cost: 185.1 },
  ],
  [
    { model: 'anthropic/claude-3-haiku', cost: 289.44 },
    { model: 'perplexity/sonar', cost: 142.02 },
  ],
  [
    { model: 'openai/gpt-4o', cost: 505.33 },
    { model: 'google/gemini-1.5-pro', cost: 214.67 },
  ],
  [
    { model: 'openrouter/gpt-oss-120b', cost: 398.91 },
    { model: 'anthropic/claude-3-opus', cost: 256.09 },
  ],
  [
    { model: 'mistral/mistral-large', cost: 331.78 },
    { model: 'meta/llama-3.1-405b', cost: 289.22 },
  ],
  [
    { model: 'openai/gpt-4o-mini', cost: 278.42 },
    { model: 'anthropic/claude-3-sonnet', cost: 211.58 },
  ],
];

const MOCK_USAGE_SERIES: readonly ImmutableDailyUsage[] = [
  { date: '2026-03-18', cost: 849, breakdown: MOCK_BREAKDOWNS[0] },
  { date: '2026-03-19', cost: 597.75, breakdown: MOCK_BREAKDOWNS[1] },
  { date: '2026-03-20', cost: 431.46, breakdown: MOCK_BREAKDOWNS[2] },
  { date: '2026-03-21', cost: 720, breakdown: MOCK_BREAKDOWNS[3] },
  { date: '2026-03-22', cost: 655, breakdown: MOCK_BREAKDOWNS[4] },
  { date: '2026-03-23', cost: 621, breakdown: MOCK_BREAKDOWNS[5] },
  { date: '2026-03-24', cost: 490, breakdown: MOCK_BREAKDOWNS[6] },
];

function clampDays(days?: number): number {
  if (typeof days !== 'number' || !Number.isFinite(days)) {
    return DEFAULT_DAYS;
  }
  const rounded = Math.trunc(days);
  if (rounded <= 0) {
    return 1;
  }
  return Math.min(rounded, MOCK_USAGE_SERIES.length);
}

function cloneUsage(series: readonly ImmutableDailyUsage[]): DailyUsage[] {
  return series.map((entry) => ({
    date: entry.date,
    cost: entry.cost,
    breakdown: entry.breakdown?.map((item) => ({ model: item.model, cost: item.cost })),
  }));
}

async function fetchMockUsage(args: ProviderFetchArgs): Promise<DailyUsage[]> {
  const days = clampDays(args.days);
  const slice = MOCK_USAGE_SERIES.slice(-days);
  return cloneUsage(slice);
}

export const mockProvider: UsageProvider = {
  id: 'mock',
  displayName: 'Mock High Usage',
  fetchDailyUsage: fetchMockUsage,
};

export function getMockUsage(days?: number): DailyUsage[] {
  return cloneUsage(MOCK_USAGE_SERIES.slice(-clampDays(days)));
}
