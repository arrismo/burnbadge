import { describe, expect, it } from 'vitest';

import { formatCurrencyUSD } from './format.js';

describe('formatCurrencyUSD', () => {
  it('formats dollars to two decimals when >= 0.01', () => {
    expect(formatCurrencyUSD(12.3456)).toBe('$12.35');
  });

  it('formats small amounts with four decimals when >= 0.0001', () => {
    expect(formatCurrencyUSD(0.00942)).toBe('$0.0094');
  });

  it('formats tiny amounts in cents when < 0.0001', () => {
    expect(formatCurrencyUSD(0.000039)).toBe('0.0039¢');
  });

  it('returns $0.00 for zero or invalid numbers', () => {
    expect(formatCurrencyUSD(0)).toBe('$0.00');
    expect(formatCurrencyUSD(Number.NaN)).toBe('$0.00');
  });
});
