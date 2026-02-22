// ── Ticker configuration ──────────────────────────────────────────────────

export interface TickerConfig {
  /** Display symbol e.g. "BTC" */
  symbol: string;
  /** Full name e.g. "Bitcoin" */
  name: string;
  /** Starting price in integer cents (e.g. $67 124.00 → 6_712_400) */
  initialPriceCents: number;
  /**
   * Maximum fractional price movement per tick.
   * 0.005 → price can move up to ±0.5% per second.
   */
  volatility: number;
}

export const TICKERS: Record<string, TickerConfig> = {
  BTC: { symbol: 'BTC', name: 'Bitcoin',  initialPriceCents: 6_712_400, volatility: 0.005 },
  ETH: { symbol: 'ETH', name: 'Ethereum', initialPriceCents:   351_820, volatility: 0.006 },
  SOL: { symbol: 'SOL', name: 'Solana',   initialPriceCents:    17_645, volatility: 0.008 },
};

/** Ordered list of all supported ticker symbols. */
export const TICKER_SYMBOLS = Object.keys(TICKERS) as (keyof typeof TICKERS)[];

/** Starting paper-trading balance: $10 000.00 → 1 000 000 cents */
export const INITIAL_BALANCE_CENTS = 1_000_000;

/** Number of price ticks to keep in rolling history per ticker */
export const HISTORY_LENGTH = 300;

/** Price engine tick interval in milliseconds */
export const TICK_INTERVAL_MS = 1_000;
