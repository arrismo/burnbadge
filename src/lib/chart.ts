import type { DailyUsage } from './types.js';

const WIDTH = 360;
const HEIGHT = 180;
const PADDING = 24;
const BAR_GAP = 8;
const BACKGROUND = '#111';
const BAR_COLOR = 'rgba(255,255,255,0.85)';
const TEXT_COLOR = '#f8fafc';
const FONT_FAMILY = 'IBM Plex Mono, monospace';

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return '$0.00';
  }

  const absolute = Math.abs(amount);

  if (absolute >= 1) {
    return `$${amount.toFixed(2)}`;
  }

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

export function renderUsageChart(data: DailyUsage[], providerLabel: string): string {
  const entries = data.slice(-20); // cap for readability
  if (entries.length === 0) {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      `  width="${WIDTH}" height="${HEIGHT}"`,
      `  viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
      `  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>`,
      `  <text x="${WIDTH / 2}" y="${HEIGHT / 2}"`,
      `    fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}"`,
      '    font-size="14" text-anchor="middle">No usage</text>',
      '</svg>',
    ].join('\n');
  }

  const costs = entries.map((entry) => entry.cost);
  const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
  const scale = Math.max(maxCost, 1);
  const availableWidth = WIDTH - PADDING * 2;
  const barWidth = Math.max(6, (availableWidth - BAR_GAP * (entries.length - 1)) / entries.length);
  const chartHeight = HEIGHT - PADDING * 2 - 20;
  const bars = entries
    .map((entry, index) => {
      const height = Math.max(2, (entry.cost / scale) * chartHeight);
      const x = PADDING + index * (barWidth + BAR_GAP);
      const y = HEIGHT - PADDING - height;
      const opacity = Math.min(1, 0.3 + entry.cost / scale);
      const labelX = x + barWidth / 2;
      const labelY = HEIGHT - PADDING + 12;
      return [
        '    <g>',
        `      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}"`,
        `        width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}"`,
        `        fill="${BAR_COLOR}" opacity="${opacity.toFixed(2)}" rx="1"/>`,
        `      <text x="${labelX.toFixed(1)}" y="${labelY}"`,
        `        fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}"`,
        '        font-size="9" text-anchor="middle">',
        `        ${entry.date.slice(5)}`,
        '      </text>',
        '    </g>',
      ].join('\n');
    })
    .join('\n');

  const totalSpend = entries.reduce((sum, entry) => sum + entry.cost, 0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"` +
      ` viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>`,
    `  <text x="${PADDING}" y="${PADDING - 6}"`,
    `    fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}" font-size="12">`,
    `    ${providerLabel} usage`,
    '  </text>',
    `  <text x="${WIDTH - PADDING}" y="${PADDING - 6}"`,
    `    fill="${TEXT_COLOR}" font-family="${FONT_FAMILY}" font-size="12" text-anchor="end">`,
    `    ${formatCurrency(totalSpend)}`,
    '  </text>',
    '  <g>',
    bars,
    '  </g>',
    '</svg>',
  ].join('\n');
}
