/**
 * priceEngine.ts — Mock Price Engine (plain TS singleton, outside React)
 *
 * Generates new prices for all tickers every TICK_INTERVAL_MS using a
 * random-walk algorithm.  Components subscribe via hooks (see usePriceEngine.ts)
 * so the engine never triggers React renders directly — hooks call setState.
 *
 * Architecture:
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  setInterval (1 s)                                       │
 *  │    └─ _onTick()                                          │
 *  │         ├─ randomWalkStep() per ticker                   │
 *  │         ├─ push to rolling history[]                     │
 *  │         └─ notify all subscribers (symbol + '*')         │
 *  └──────────────────────────────────────────────────────────┘
 */

import { TICKERS, TICKER_SYMBOLS, HISTORY_LENGTH, TICK_INTERVAL_MS } from '../constants/tickers';
import { randomWalkStep, pctChange } from '../utils/math';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TickerSnapshot {
  symbol: string;
  priceCents: number;
  /** Rolling price history (oldest → newest), length ≤ HISTORY_LENGTH */
  history: readonly number[];
  /** Price 24 h ago (uses engine start price as proxy) */
  openCents: number;
  /** Percentage change since engine started (proxy for 24h %) */
  changePct: number;
  /** Which direction did the last tick move? */
  direction: 'up' | 'down' | 'flat';
  tickCount: number;
}

export type TickerSubscriberCallback = (snapshot: TickerSnapshot) => void;
/** Symbol or '*' for all-ticker events */
export type SubscriptionTarget = string;
export type Unsubscribe = () => void;

// ── Internal state per ticker ──────────────────────────────────────────────

interface TickerState {
  priceCents: number;
  openCents: number;
  history: number[];
  prevPriceCents: number;
}

// ── PriceEngine class ──────────────────────────────────────────────────────

class PriceEngine {
  private _states: Map<string, TickerState> = new Map();
  private _subscribers: Map<SubscriptionTarget, Set<TickerSubscriberCallback>> = new Map();
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _tickCount = 0;

  constructor() {
    // Initialise state for each ticker
    for (const symbol of TICKER_SYMBOLS) {
      const { initialPriceCents } = TICKERS[symbol];
      this._states.set(symbol, {
        priceCents: initialPriceCents,
        openCents: initialPriceCents,
        history: [initialPriceCents],
        prevPriceCents: initialPriceCents,
      });
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this._intervalId !== null) return; // already running
    this._intervalId = setInterval(() => this._onTick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this._intervalId === null) return;
    clearInterval(this._intervalId);
    this._intervalId = null;
  }

  get isRunning(): boolean {
    return this._intervalId !== null;
  }

  // ── Subscription ─────────────────────────────────────────────────────────

  /**
   * Subscribe to price updates for a specific ticker symbol, or '*' for all.
   * Returns an unsubscribe function — call it in useEffect cleanup.
   */
  subscribe(target: SubscriptionTarget, cb: TickerSubscriberCallback): Unsubscribe {
    if (!this._subscribers.has(target)) {
      this._subscribers.set(target, new Set());
    }
    this._subscribers.get(target)!.add(cb);

    return () => {
      this._subscribers.get(target)?.delete(cb);
    };
  }

  // ── Snapshot access (synchronous, safe before first tick) ────────────────

  getSnapshot(symbol: string): TickerSnapshot {
    const state = this._states.get(symbol);
    if (!state) throw new Error(`Unknown ticker: ${symbol}`);
    return this._buildSnapshot(symbol, state);
  }

  getAllSnapshots(): Record<string, TickerSnapshot> {
    const result: Record<string, TickerSnapshot> = {};
    for (const symbol of TICKER_SYMBOLS) {
      result[symbol] = this.getSnapshot(symbol);
    }
    return result;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _onTick(): void {
    this._tickCount++;

    for (const symbol of TICKER_SYMBOLS) {
      const state = this._states.get(symbol)!;
      const { volatility } = TICKERS[symbol];

      const newPrice = randomWalkStep(state.priceCents, volatility);

      // Rolling history — mutate in place for efficiency, then freeze on read
      if (state.history.length >= HISTORY_LENGTH) {
        state.history.shift();
      }
      state.history.push(newPrice);

      state.prevPriceCents = state.priceCents;
      state.priceCents = newPrice;

      const snapshot = this._buildSnapshot(symbol, state);

      // Notify per-symbol subscribers
      this._subscribers.get(symbol)?.forEach((cb) => cb(snapshot));
      // Notify wildcard subscribers
      this._subscribers.get('*')?.forEach((cb) => cb(snapshot));
    }
  }

  private _buildSnapshot(symbol: string, state: TickerState): TickerSnapshot {
    const { priceCents, openCents, prevPriceCents, history } = state;
    const direction: TickerSnapshot['direction'] =
      priceCents > prevPriceCents ? 'up'
      : priceCents < prevPriceCents ? 'down'
      : 'flat';

    return {
      symbol,
      priceCents,
      history: history as readonly number[],
      openCents,
      changePct: pctChange(openCents, priceCents),
      direction,
      tickCount: this._tickCount,
    };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

/** Global singleton — import this wherever you need price data. */
export const priceEngine = new PriceEngine();
