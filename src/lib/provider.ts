import type { DailyUsage, ProviderId } from './types.js';

export interface ProviderFetchArgs {
  apiKey: string;
  days?: number;
  provider?: ProviderId;
  now?: Date;
}

export interface UsageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  fetchDailyUsage(args: ProviderFetchArgs): Promise<DailyUsage[]>;
}

export type ProviderRegistry = Record<ProviderId, UsageProvider>;
