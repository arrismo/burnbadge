import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { encryptSecret } from '../lib/crypto.js';
import type { TokenStorage } from '../storage/memory.js';
import type { UserRecord } from '../lib/types.js';

class StubStorage implements TokenStorage {
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

  clear() {
    this.store.clear();
  }
}

const DEFAULT_BASE_URL = 'https://badge.test';
const DEFAULT_SECRET = 'secret';

interface ShieldsResponseBody {
  provider: string;
  providerName: string;
  badgeEndpoint: string;
  imageUrl: string;
  markdown: string;
  html: string;
}

function createRecord(
  badgeToken: string,
  provider: UserRecord['provider'] = 'mock',
  usageToken = `${badgeToken}-usage`,
): UserRecord {
  return {
    badgeToken,
    usageToken,
    provider,
    encryptedKey: encryptSecret('mock-api-key-12345', DEFAULT_SECRET),
    createdAt: new Date().toISOString(),
  };
}

function createLegacyRecord(
  token: string,
  provider: UserRecord['provider'] = 'mock',
): UserRecord {
  return {
    token,
    provider,
    encryptedKey: encryptSecret('mock-api-key-12345', DEFAULT_SECRET),
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

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
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

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
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

  it('blocks usage reads when only the public badge token is known', async () => {
    const badgeToken = 'badge-public';
    await storage.save(createRecord(badgeToken, 'mock', 'usage-private'));

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/usage/${badgeToken}`);

    expect(response.status).toBe(404);
  });

  it('serves badge data only from the public badge token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const badgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(badgeResponse.status).toBe(200);

    const privateResponse = await app.request(`/api/badge/${usageToken}`);
    expect(privateResponse.status).toBe(404);
  });

  it('returns usage data when the private usage token is used', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/usage/${usageToken}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string; usage: unknown[] };
    expect(body.provider).toBe('mock');
    expect(Array.isArray(body.usage)).toBe(true);
  });

  it('blocks chart reads when only the public badge token is known', async () => {
    const badgeToken = 'badge-public';
    await storage.save(createRecord(badgeToken, 'mock', 'usage-private'));

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/chart/${badgeToken}`);

    expect(response.status).toBe(404);
  });

  it('returns private usage and chart URLs on registration', async () => {
    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'mock-api-key-12345', provider: 'mock' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      token: string;
      badgeToken: string;
      usageToken: string;
      badgeUrl: string;
      chartUrl: string;
      usageUrl: string;
    };

    expect(body.token).toBe(body.badgeToken);
    expect(body.badgeUrl).toContain(`/api/badge/${body.badgeToken}`);
    expect(body.chartUrl).toContain(`/api/chart/${body.usageToken}`);
    expect(body.usageUrl).toContain(`/api/usage/${body.usageToken}`);
  });

  it('keeps legacy single-token records readable', async () => {
    const token = 'legacy-token';
    await storage.save(createLegacyRecord(token));

    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const badgeResponse = await app.request(`/api/badge/${token}`);
    expect(badgeResponse.status).toBe(200);

    const usageResponse = await app.request(`/api/usage/${token}`);
    expect(usageResponse.status).toBe(200);
  });

  it('returns 404 when the token is unknown', async () => {
    const app = createApp({
      storage,
      defaultSecret: DEFAULT_SECRET,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request('/api/shields/unknown-token');

    expect(response.status).toBe(404);
  });
});
