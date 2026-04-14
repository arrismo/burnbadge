import { describe, expect, it } from 'vitest';

import { mockProvider, getMockUsage } from './mock.js';

describe('mockProvider', () => {
  it('returns a high-usage series capped to the requested days', async () => {
    const days = 3;
    const usage = await mockProvider.fetchDailyUsage({ apiKey: 'ignored', days });

    expect(usage).toHaveLength(days);
    expect(usage.every((entry) => entry.cost > 1)).toBe(true);
  });

  it('limits the maximum days to the mock dataset size', async () => {
    const usage = await mockProvider.fetchDailyUsage({ apiKey: 'ignored', days: 99 });

    expect(usage).toHaveLength(getMockUsage().length);
  });
});
