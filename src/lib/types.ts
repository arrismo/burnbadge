export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'opencode' | 'mock';

export interface DailyUsageBreakdown {
  model: string;
  cost: number;
}

export interface DailyUsage {
  date: string;
  cost: number;
  breakdown?: DailyUsageBreakdown[];
}

export interface UserRecord {
  token?: string;
  badgeToken?: string;
  usageToken?: string;
  provider?: ProviderId;
  name?: string;
  source?: string;
  usage?: DailyUsage[];
  lastUpdated?: string;
  updatedAt?: string;
  createdAt: string;
}

export interface UsageQuery {
  token: string;
  provider: ProviderId;
  days?: number;
}
