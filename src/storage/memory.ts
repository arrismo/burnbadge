import type { UserRecord } from '../lib/types.js';

export interface TokenStorage {
  save(record: UserRecord): Promise<void>;
  get(token: string): Promise<UserRecord | undefined>;
}

class InMemoryTokenStorage implements TokenStorage {
  private readonly store = new Map<string, UserRecord>();

  async save(record: UserRecord): Promise<void> {
    const tokens = [record.token, record.badgeToken, record.usageToken].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    for (const token of tokens) {
      this.store.set(token, record);
    }
  }

  async get(token: string): Promise<UserRecord | undefined> {
    return this.store.get(token);
  }
}

export const memoryTokenStorage = new InMemoryTokenStorage();
