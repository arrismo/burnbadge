import { describe, expect, it } from 'vitest';

import { normalizeOpenRouterActivity } from './openrouter.js';

describe('normalizeOpenRouterActivity', () => {
  it('aggregates costs per day and model with padding', () => {
    const now = new Date('2025-08-26T12:00:00Z');
    const days = 3;
    const usage = normalizeOpenRouterActivity(
      [
        {
          date: '2025-08-24',
          model: 'openai/gpt-4.1',
          usage: 1.234,
          byok_usage_inference: 0.1,
        },
        {
          date: '2025-08-24',
          model: 'anthropic/claude-3',
          usage: 0.5,
        },
        {
          date: '2025-08-25',
          model: 'openai/gpt-4.1',
          usage: 2,
        },
      ],
      { days, now },
    );

    expect(usage).toEqual([
      {
        date: '2025-08-24',
        cost: 1.834,
        breakdown: [
          { model: 'openai/gpt-4.1', cost: 1.334 },
          { model: 'anthropic/claude-3', cost: 0.5 },
        ],
      },
      {
        date: '2025-08-25',
        cost: 2,
        breakdown: [{ model: 'openai/gpt-4.1', cost: 2 }],
      },
      { date: '2025-08-26', cost: 0 },
    ]);
  });

  it('handles empty activity with zeros', () => {
    const now = new Date('2025-01-10T00:00:00Z');
    const days = 2;
    const usage = normalizeOpenRouterActivity([], { days, now });

    expect(usage).toEqual([
      { date: '2025-01-09', cost: 0 },
      { date: '2025-01-10', cost: 0 },
    ]);
  });
});
