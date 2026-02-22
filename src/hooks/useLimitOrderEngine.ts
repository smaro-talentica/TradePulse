/**
 * useLimitOrderEngine.ts
 *
 * Monitors all pending limit orders and automatically executes them when
 * the Mock Price Engine ticks through their trigger price.
 *
 * Trigger rules:
 *   BUY  limit — fires when priceCents <= triggerPriceCents
 *                (user wants to buy cheap; trigger when price falls to level)
 *   SELL limit — fires when priceCents >= triggerPriceCents
 *                (user wants to sell high; trigger when price rises to level)
 *
 * Key design — why refs are updated in the RENDER BODY (not in useEffect):
 *   useEffect runs asynchronously after paint. A price-engine tick can fire
 *   in the gap between "state updates" and "useEffect syncs the ref", causing
 *   the callback to see a stale ordersRef with no pending orders. By updating
 *   the refs directly in the render body (synchronous), they are always current
 *   before any async callback executes.
 */
import { useEffect, useRef } from 'react';
import { priceEngine, type TickerSnapshot } from '../engine/priceEngine';
import { useTradingContext } from '../context/useTradingContext';
import type { LimitOrder } from '../types/trading';

export function useLimitOrderEngine(): void {
  const { state, dispatch } = useTradingContext();

  // ── Synchronous ref updates (in render body, NOT in useEffect) ────────────
  const ordersRef   = useRef<LimitOrder[]>(state.limitOrders);
  const dispatchRef = useRef(dispatch);
  const holdingsRef = useRef(state.holdings);
  const balanceRef  = useRef(state.balanceCents);

  // These lines run synchronously on every render, ensuring the callback
  // always has fresh values without re-subscribing to the price engine.
  ordersRef.current   = state.limitOrders;
  dispatchRef.current = dispatch;
  holdingsRef.current = state.holdings;
  balanceRef.current  = state.balanceCents;

  // ── Interval-based fallback scanner (500 ms) ─────────────────────────────
  // React 18 concurrent mode can defer re-renders, so ordersRef may remain
  // stale for longer than one tick interval after a dispatch. This scanner
  // runs independently of the render cycle and catches:
  //   (a) orders placed while the trigger is already met
  //   (b) any order the tick subscriber missed due to stale refs
  useEffect(() => {
    const intervalId = setInterval(() => {
      const pending = ordersRef.current.filter((o) => o.status === 'pending');
      if (pending.length === 0) return;

      const virtualSoldQty: Record<string, number> = {};
      const virtualBoughtCents: Record<string, number> = {};

      for (const order of pending) {
        const snap = priceEngine.getSnapshot(order.symbol);

        const shouldExecute =
          (order.side === 'buy'  && snap.priceCents <= order.triggerPriceCents) ||
          (order.side === 'sell' && snap.priceCents >= order.triggerPriceCents);

        if (!shouldExecute) continue;

        if (order.side === 'sell') {
          const heldQty     = holdingsRef.current[order.symbol]?.quantity ?? 0;
          const alreadySold = virtualSoldQty[order.symbol] ?? 0;
          const remaining   = heldQty - alreadySold;
          if (remaining < order.quantity - 1e-9) continue;
          virtualSoldQty[order.symbol] = alreadySold + order.quantity;
        }

        if (order.side === 'buy') {
          const totalCents       = Math.round(snap.priceCents * order.quantity);
          const alreadySpent     = virtualBoughtCents[order.symbol] ?? 0;
          const availableBalance = balanceRef.current - alreadySpent;
          if (totalCents > availableBalance) continue;
          virtualBoughtCents[order.symbol] = alreadySpent + totalCents;
        }

        dispatchRef.current({
          type: 'EXECUTE_LIMIT_ORDER',
          orderId: order.id,
          priceCents: snap.priceCents,
        });
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, []); // runs once; reads live data through refs

  // ── Subscribe once; reads fresh data through refs ─────────────────────────
  useEffect(() => {
    const unsub = priceEngine.subscribe('*', (snap: TickerSnapshot) => {
      const pending = ordersRef.current.filter(
        (o) => o.status === 'pending' && o.symbol === snap.symbol,
      );

      // Track how many units of each symbol have been virtually "sold" or
      // "bought" by orders dispatched earlier in this same tick, so we don't
      // over-execute when multiple orders for the same symbol all trigger at
      // once (the reducer state hasn't updated yet within a single tick).
      const virtualSoldQty: Record<string, number>  = {};
      const virtualBoughtCents: Record<string, number> = {};

      // We need the live holdings to validate sell orders within the tick.
      // Use a separate holdings ref that is kept in sync (see below).
      const holdings = holdingsRef.current;
      const balance  = balanceRef.current;

      for (const order of pending) {
        const shouldExecute =
          (order.side === 'buy'  && snap.priceCents <= order.triggerPriceCents) ||
          (order.side === 'sell' && snap.priceCents >= order.triggerPriceCents);

        if (!shouldExecute) continue;

        if (order.side === 'sell') {
          const heldQty   = (holdings[order.symbol]?.quantity ?? 0);
          const alreadySold = virtualSoldQty[order.symbol] ?? 0;
          const remaining = heldQty - alreadySold;
          // Not enough left to fill this order — skip it this tick.
          // The reducer will also cancel it on the next dispatch, but
          // skipping here prevents a spurious execution before state updates.
          if (remaining < order.quantity - 1e-9) continue;
          virtualSoldQty[order.symbol] = alreadySold + order.quantity;
        }

        if (order.side === 'buy') {
          const totalCents = Math.round(snap.priceCents * order.quantity);
          const alreadySpent = virtualBoughtCents[order.symbol] ?? 0;
          const availableBalance = balance - alreadySpent;
          if (totalCents > availableBalance) continue;
          virtualBoughtCents[order.symbol] = alreadySpent + totalCents;
        }

        dispatchRef.current({
          type: 'EXECUTE_LIMIT_ORDER',
          orderId: order.id,
          priceCents: snap.priceCents,
        });
      }
    });

    return unsub;
  }, []); // empty deps — subscribes once, reads via refs
}
