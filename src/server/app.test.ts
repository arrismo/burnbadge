import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import type { TokenStorage } from '../storage/memory.js';
import type { UserRecord } from '../lib/types.js';

class StubStorage implements TokenStorage {
  private readonly store = new Map<string, UserRecord>();

  async save(record: UserRecord): Promise<void> {
    this.store.set(record.token, record);
  }

  async get(token: string): Promise<UserRecord | undefined> {
    return this.store.get(token);
  }

  clear() {
    this.store.clear();
  }
}

const DEFAULT_BASE_URL = 'https://badge.test';

interface ShieldsResponseBody {
  provider: string;
  providerName: string;
  badgeEndpoint: string;
  imageUrl: string;
  markdown: string;
  html: string;
}

function createRecord(token: string, provider: UserRecord['provider'] = 'mock'): UserRecord {
  return {
    token,
    provider,
    encryptedKey: 'encrypted-key',
    createdAt: new Date().toISOString(),
  };
}

describe('createApp shields badge helpers', () => {
  const storage = new StubStorage();

  beforeEach(() => {
    storage.clear();
  });

  it('returns a Shields.io payload with snippet helpers', async () => {
    const token = 'token-123';
    await storage.save(createRecord(token));

    const app = createApp({ storage, defaultSecret: 'secret', defaultBaseUrl: DEFAULT_BASE_URL });
    const response = await app.request(
      `/api/shields/${token}?label=AI%20Spend&color=navy&style=flat-square`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ShieldsResponseBody;

    expect(body.provider).toBe('mock');
    expect(body.providerName).toBeDefined();
    expect(body.badgeEndpoint).toContain(`/api/badge/${token}`);
    expect(body.imageUrl).toContain('https://img.shields.io/endpoint');
    expect(body.imageUrl).toContain('style=flat-square');
    expect(body.markdown).toContain(body.imageUrl);
    expect(body.html).toContain('img');
  });

  it('redirects to the Shields.io endpoint for the image route', async () => {
    const token = 'token-image';
    await storage.save(createRecord(token));

    const app = createApp({ storage, defaultSecret: 'secret', defaultBaseUrl: DEFAULT_BASE_URL });
    const response = await app.request(`/api/shields/${token}/image?days=7`);

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    expect(location).toContain('https://img.shields.io/endpoint');

    const shieldsUrl = new URL(location!);
    expect(shieldsUrl.pathname).toBe('/endpoint');
    const badgeEndpoint = shieldsUrl.searchParams.get('url');
    expect(badgeEndpoint).toBe(`${DEFAULT_BASE_URL}/api/badge/${token}?days=7`);
  });

  it('returns 404 when the token is unknown', async () => {
    const app = createApp({ storage, defaultSecret: 'secret', defaultBaseUrl: DEFAULT_BASE_URL });
    const response = await app.request('/api/shields/unknown-token');

    expect(response.status).toBe(404);
  });
});
