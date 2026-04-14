import { describe, expect, it } from 'vitest';

import { normalizeAnthropicUsage } from './anthropic.js';

describe('normalizeAnthropicUsage', () => {
  it('normalizes diverse Anthropic usage payloads', () => {
    const usage = normalizeAnthropicUsage([
      {
        date: '2024-03-19',
        total_costs: { usd: 1.23 },
        models: [
          { model: 'claude-3-opus', costs: { usd: 0.53 } },
          { model: 'claude-3-sonnet', costs: { usd: 0.7 } },
        ],
      },
      {
        time_window: { start: '2024-03-20T00:00:00Z' },
        cost: 2.5,
      },
      {
        start_date: 'invalid-date',
        total_cost: 9,
      },
    ]);

    expect(usage).toEqual([
      {
        date: '2024-03-19',
        cost: 1.23,
        breakdown: [
          { model: 'claude-3-opus', cost: 0.53 },
          { model: 'claude-3-sonnet', cost: 0.7 },
        ],
      },
      {
        date: '2024-03-20',
        cost: 2.5,
        breakdown: undefined,
      },
    ]);
  });
});
