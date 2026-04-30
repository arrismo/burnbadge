import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import type { TokenStorage } from '../storage/memory.js';
import type { DailyUsage, UserRecord } from '../lib/types.js';
import { getMockUsage } from '../providers/mock.js';

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

  async delete(token: string): Promise<void> {
    this.store.delete(token);
  }

  clear() {
    this.store.clear();
  }
}

const DEFAULT_BASE_URL = 'https://badge.test';

interface ShieldsResponseBody {
  provider: string | null;
  providerName: string;
  badgeEndpoint: string;
  imageUrl: string;
  markdown: string;
  html: string;
}

const MOCK_USAGE = getMockUsage();

function createRecord(
  badgeToken: string,
  provider: UserRecord['provider'] = 'mock',
  usageToken = `${badgeToken}-usage`,
  usage: DailyUsage[] = MOCK_USAGE,
): UserRecord {
  const timestamp = new Date().toISOString();
  return {
    badgeToken,
    usageToken,
    provider,
    usage,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createLegacyRecord(
  token: string,
  provider: UserRecord['provider'] = 'mock',
  usage: DailyUsage[] = MOCK_USAGE,
): UserRecord {
  const timestamp = new Date().toISOString();
  return {
    token,
    provider,
    usage,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('createApp push usage model', () => {
  const storage = new StubStorage();

  beforeEach(() => {
    storage.clear();
  });

  it('returns a Shields.io payload with snippet helpers', async () => {
    const token = 'token-123';
    await storage.save(createRecord(token));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(
      `/api/shields/${token}?label=AI%20Spend&color=navy&style=flat-square`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ShieldsResponseBody;

    expect(body.provider).toBe('mock');
    expect(body.providerName).toBe('mock');
    expect(body.badgeEndpoint).toContain(`/api/badge/${token}`);
    expect(body.imageUrl).toContain('https://img.shields.io/endpoint');
    expect(body.imageUrl).toContain('style=flat-square');
    expect(body.markdown).toContain(body.imageUrl);
    expect(body.html).toContain('img');
  });

  it('adds a default provider logo to Shields URLs', async () => {
    const token = 'token-openrouter';
    await storage.save(createRecord(token, 'openrouter'));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/shields/${token}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ShieldsResponseBody;
    const shieldsUrl = new URL(body.imageUrl);
    expect(shieldsUrl.searchParams.get('logo')).toBe('openrouter');
  });

  it('preserves an explicit Shields logo override', async () => {
    const token = 'token-anthropic';
    await storage.save(createRecord(token, 'anthropic'));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/shields/${token}?logo=github`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ShieldsResponseBody;
    const shieldsUrl = new URL(body.imageUrl);
    expect(shieldsUrl.searchParams.get('logo')).toBe('github');
  });

  it('redirects to the Shields.io endpoint for the image route', async () => {
    const token = 'token-image';
    await storage.save(createRecord(token));

    const app = createApp({
      storage,
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
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const badgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(badgeResponse.status).toBe(200);
    expect(await badgeResponse.json()).toMatchObject({ message: '$4364.21' });

    const privateResponse = await app.request(`/api/badge/${usageToken}`);
    expect(privateResponse.status).toBe(404);
  });

  it('uses the provider name as the default badge label', async () => {
    const badgeToken = 'badge-provider';
    await storage.save(createRecord(badgeToken, 'openrouter'));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/badge/${badgeToken}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      label: 'openrouter',
      message: '$4364.21',
    });
  });

  it('returns usage data when the private usage token is used', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/usage/${usageToken}?days=3`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string; usage: DailyUsage[] };
    expect(body.provider).toBe('mock');
    expect(body.usage).toHaveLength(3);
  });

  it('accepts pushed usage with the private usage token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, undefined, usageToken, []));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/usage/${usageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        usage: [
          { date: '2026-04-20', cost: 1.25 },
          { date: '2026-04-21', cost: 2.5, breakdown: [{ model: 'openai/gpt-4.1', cost: 2.5 }] },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string; usage: DailyUsage[] };
    expect(body.provider).toBe('openrouter');
    expect(body.usage).toHaveLength(2);

    const badgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(badgeResponse.status).toBe(200);
    expect(await badgeResponse.json()).toMatchObject({ message: '$3.75' });
  });

  it('rejects usage ingestion with more than 366 daily entries', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, undefined, usageToken, []));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const usage = Array.from({ length: 367 }, (_, index) => ({
      date: `2026-04-${String((index % 30) + 1).padStart(2, '0')}`,
      cost: 1,
    }));

    const response = await app.request(`/api/usage/${usageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usage }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('at most 366 daily entries'),
    });
  });

  it('rejects usage ingestion with more than 100 breakdown items', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, undefined, usageToken, []));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const breakdown = Array.from({ length: 101 }, (_, index) => ({
      model: `model-${index}`,
      cost: 1,
    }));

    const response = await app.request(`/api/usage/${usageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usage: [{ date: '2026-04-21', cost: 101, breakdown }],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('at most 100 items'),
    });
  });

  it('rejects payloads larger than 64KB', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, undefined, usageToken, []));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const oversizedModel = 'm'.repeat(70_000);
    const response = await app.request(`/api/usage/${usageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usage: [{ date: '2026-04-21', cost: 1, breakdown: [{ model: oversizedModel, cost: 1 }] }],
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'Payload Too Large' });
  });

  it('rejects usage ingestion from the public badge token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/usage/${badgeToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usage: [{ date: '2026-04-21', cost: 1 }] }),
    });

    expect(response.status).toBe(404);
  });

  it('blocks chart reads when only the public badge token is known', async () => {
    const badgeToken = 'badge-public';
    await storage.save(createRecord(badgeToken, 'mock', 'usage-private'));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request(`/api/chart/${badgeToken}`);

    expect(response.status).toBe(404);
  });

  it('returns private usage and chart URLs on project creation', async () => {
    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'mock' }),
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

  it('keeps the legacy register route as a create-project alias', async () => {
    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'mock' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { badgeToken: string; usageToken: string };
    expect(body.badgeToken).toBeTruthy();
    expect(body.usageToken).toBeTruthy();
  });

  it('rotates only the badge token when requested with the private usage token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${usageToken}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badgeToken: true, usageToken: false }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      badgeToken: string;
      usageToken: string;
    };

    expect(body.badgeToken).not.toBe(badgeToken);
    expect(body.usageToken).toBe(usageToken);

    const oldBadgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(oldBadgeResponse.status).toBe(404);

    const newBadgeResponse = await app.request(`/api/badge/${body.badgeToken}`);
    expect(newBadgeResponse.status).toBe(200);

    const usageResponse = await app.request(`/api/usage/${usageToken}`);
    expect(usageResponse.status).toBe(200);
  });

  it('rotates only the usage token when requested with the private usage token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${usageToken}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badgeToken: false, usageToken: true }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      badgeToken: string;
      usageToken: string;
    };

    expect(body.badgeToken).toBe(badgeToken);
    expect(body.usageToken).not.toBe(usageToken);

    const oldUsageResponse = await app.request(`/api/usage/${usageToken}`);
    expect(oldUsageResponse.status).toBe(404);

    const newUsageResponse = await app.request(`/api/usage/${body.usageToken}`);
    expect(newUsageResponse.status).toBe(200);

    const badgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(badgeResponse.status).toBe(200);
  });

  it('rejects token rotation when called with the public badge token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${badgeToken}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badgeToken: true }),
    });

    expect(response.status).toBe(404);
  });

  it('revokes all token access when requested with the private usage token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${usageToken}/revoke`, {
      method: 'POST',
    });

    expect(response.status).toBe(204);

    const badgeResponse = await app.request(`/api/badge/${badgeToken}`);
    expect(badgeResponse.status).toBe(404);

    const usageResponse = await app.request(`/api/usage/${usageToken}`);
    expect(usageResponse.status).toBe(404);
  });

  it('rejects token revocation when called with the public badge token', async () => {
    const badgeToken = 'badge-public';
    const usageToken = 'usage-private';
    await storage.save(createRecord(badgeToken, 'mock', usageToken));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${badgeToken}/revoke`, {
      method: 'POST',
    });

    expect(response.status).toBe(404);
  });

  it('splits legacy single-token records during rotation', async () => {
    const token = 'legacy-token';
    await storage.save(createLegacyRecord(token));

    const app = createApp({
      storage,
      defaultBaseUrl: DEFAULT_BASE_URL,
    });

    const response = await app.request(`/api/tokens/${token}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badgeToken: true, usageToken: true }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      badgeToken: string;
      usageToken: string;
    };

    expect(body.badgeToken).not.toBe(token);
    expect(body.usageToken).not.toBe(token);
    expect(body.badgeToken).not.toBe(body.usageToken);

    const oldBadgeResponse = await app.request(`/api/badge/${token}`);
    expect(oldBadgeResponse.status).toBe(404);

    const newBadgeResponse = await app.request(`/api/badge/${body.badgeToken}`);
    expect(newBadgeResponse.status).toBe(200);

    const newUsageResponse = await app.request(`/api/usage/${body.usageToken}`);
    expect(newUsageResponse.status).toBe(200);
  });

  it('keeps legacy single-token records readable', async () => {
    const token = 'legacy-token';
    await storage.save(createLegacyRecord(token));

    const app = createApp({
      storage,
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
      defaultBaseUrl: DEFAULT_BASE_URL,
    });
    const response = await app.request('/api/shields/unknown-token');

    expect(response.status).toBe(404);
  });
});
