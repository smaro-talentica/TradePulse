/**
 * math.ts — Precision math helpers for integer-cents currency arithmetic.
 *
 * All monetary values are stored as integer cents to eliminate floating-point
 * drift (e.g. $67 124.00 = 6 712 400 cents).
 */

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format integer cents as a USD currency string.
 * e.g. 6_712_400 → "$67,124.00"
 */
export function formatUsd(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/**
 * Format integer cents as a price string (no $ symbol for compact display).
 * e.g. 6_712_400 → "67,124.00"
 */
export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Multiply a price in cents by a decimal quantity; result in cents.
 * Uses Math.round to avoid fractional cents.
 * e.g. multiplyCents(6_712_400, 0.5) → 3_356_200
 */
export function multiplyCents(priceCents: number, quantity: number): number {
  return Math.round(priceCents * quantity);
}

/**
 * Calculate percentage change from `fromCents` to `toCents`.
 * Returns a decimal, e.g. 0.025 = +2.5%.
 */
export function pctChange(fromCents: number, toCents: number): number {
  if (fromCents === 0) return 0;
  return (toCents - fromCents) / fromCents;
}

/**
 * Format a decimal percentage for display.
 * e.g. pctChange result 0.025 → "+2.50%",  -0.01 → "-1.00%"
 */
export function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

/**
 * Apply a random walk step to a price.
 * newPrice = Math.round(currentPrice * (1 + delta))
 * where delta ∈ [-volatility, +volatility]
 */
export function randomWalkStep(
  priceCents: number,
  volatility: number,
): number {
  const delta = (Math.random() * 2 - 1) * volatility;
  return Math.max(1, Math.round(priceCents * (1 + delta)));
}
