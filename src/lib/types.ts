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
  encryptedKey: string;
  provider: ProviderId;
  createdAt: string;
}

export interface UsageQuery {
  token: string;
  provider: ProviderId;
  days?: number;
}
