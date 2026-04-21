import type { UserRecord } from '../lib/types.js';
import type { TokenStorage } from './memory.js';

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createKVStorage(kv: KVNamespace): TokenStorage {
  return {
    async save(record: UserRecord): Promise<void> {
      const tokens = [record.token, record.badgeToken, record.usageToken].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      const payload = JSON.stringify(record);

      await Promise.all(tokens.map((token) => kv.put(token, payload)));
    },
    async get(token: string): Promise<UserRecord | undefined> {
      const data = await kv.get(token);
      if (!data) return undefined;
      return JSON.parse(data) as UserRecord;
    },
    async delete(token: string): Promise<void> {
      await kv.delete(token);
    },
  };
}
