/**
 * usePriceEngine.ts — React hooks that bridge the PriceEngine singleton into
 * the React component tree without causing unnecessary re-renders.
 *
 * Three hooks are provided:
 *
 *  useTicker(symbol)
 *    Subscribes to a single ticker. The component re-renders only when that
 *    one ticker's price changes. Use this in TickerRow components.
 *
 *  useAllTickers()
 *    Subscribes to all tickers. Re-renders on every tick (any ticker).
 *    Use this only in components that genuinely need the full board.
 *
 *  useTickerHistoryRef(symbol)
 *    Returns a React ref whose `.current` is always the latest history array.
 *    Does NOT trigger re-renders — the SVG chart uses this + requestAnimationFrame
 *    to redraw without going through React's reconciler.
 */

import { useState, useEffect, useRef, MutableRefObject } from 'react';
import { priceEngine, TickerSnapshot } from '../engine/priceEngine';
import { TICKER_SYMBOLS } from '../constants/tickers';

// ── useTicker ──────────────────────────────────────────────────────────────

/**
 * Returns a live TickerSnapshot for the given symbol.
 * Component re-renders only when this ticker's price changes.
 */
export function useTicker(symbol: string): TickerSnapshot {
  const [snapshot, setSnapshot] = useState<TickerSnapshot>(() =>
    priceEngine.getSnapshot(symbol),
  );

  useEffect(() => {
    // Re-sync if symbol changes
    setSnapshot(priceEngine.getSnapshot(symbol));
    const unsub = priceEngine.subscribe(symbol, setSnapshot);
    return unsub;
  }, [symbol]);

  return snapshot;
}

// ── useAllTickers ──────────────────────────────────────────────────────────

/**
 * Returns a map of all ticker snapshots, updated on every tick.
 * Prefer useTicker() for components rendering a single row.
 */
export function useAllTickers(): Record<string, TickerSnapshot> {
  const [snapshots, setSnapshots] = useState<Record<string, TickerSnapshot>>(
    () => priceEngine.getAllSnapshots(),
  );

  useEffect(() => {
    const unsub = priceEngine.subscribe('*', (updated) => {
      setSnapshots((prev) => ({ ...prev, [updated.symbol]: updated }));
    });
    return unsub;
  }, []);

  return snapshots;
}

// ── useTickerHistoryRef ───────────────────────────────────────────────────

/**
 * Returns a ref whose `.current` always holds the latest price history array
 * for the given ticker.  Updating the ref does NOT trigger a React re-render,
 * making it ideal for the SVG chart which redraws via its own mechanism.
 */
export function useTickerHistoryRef(
  symbol: string,
): MutableRefObject<readonly number[]> {
  const historyRef = useRef<readonly number[]>(
    priceEngine.getSnapshot(symbol).history,
  );

  useEffect(() => {
    // Sync immediately on symbol change
    historyRef.current = priceEngine.getSnapshot(symbol).history;

    const unsub = priceEngine.subscribe(symbol, (snap) => {
      historyRef.current = snap.history;
    });
    return unsub;
  }, [symbol]);

  return historyRef;
}

// ── useTickerSymbols ──────────────────────────────────────────────────────

/** Returns the static ordered list of all ticker symbols. */
export function useTickerSymbols(): readonly string[] {
  return TICKER_SYMBOLS;
}
