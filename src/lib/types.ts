export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'mock';

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
  usage?: DailyUsage[];
  updatedAt?: string;
  createdAt: string;
}

export interface UsageQuery {
  token: string;
  provider: ProviderId;
  days?: number;
}
