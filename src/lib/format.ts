export function formatCurrencyUSD(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return '$0.00';
  }

  const absolute = Math.abs(amount);

  if (absolute >= 0.01) {
    return `$${amount.toFixed(2)}`;
  }

  if (absolute >= 0.0001) {
    return `$${amount.toFixed(4)}`;
  }

  const cents = amount * 100;
  const formatted = cents.toFixed(4);
  return `${formatted}¢`;
}
