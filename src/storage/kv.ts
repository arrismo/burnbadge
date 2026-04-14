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
      await kv.put(record.token, JSON.stringify(record));
    },
    async get(token: string): Promise<UserRecord | undefined> {
      const data = await kv.get(token);
      if (!data) return undefined;
      return JSON.parse(data) as UserRecord;
    },
  };
}
