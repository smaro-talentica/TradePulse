/**
 * tradingReducer.ts — Pure reducer for all trading state mutations.
 *
 * Completely framework-free: no React imports. Every function is individually
 * unit-testable (see src/__tests__/tradingReducer.test.ts).
 *
 * Invariants enforced:
 *  BUY_MARKET  : totalCents (price × qty) must not exceed balanceCents
 *  SELL_MARKET : quantity must not exceed holdings[symbol].quantity
 *  EXECUTE_LIMIT_ORDER : same checks as the matching market order
 */

import { multiplyCents } from '../utils/math';
import { INITIAL_BALANCE_CENTS } from '../constants/tickers';
import type {
  TradingState,
  TradingAction,
  Holding,
  Trade,
  LimitOrder,
} from '../types/trading';

// ── Persistence ────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'tradepulse_portfolio';

export function initialState(): TradingState {
  return {
    balanceCents: INITIAL_BALANCE_CENTS,
    holdings: {},
    trades: [],
    limitOrders: [],
  };
}

export function loadState(): TradingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TradingState>;
      return {
        balanceCents: parsed.balanceCents ?? INITIAL_BALANCE_CENTS,
        holdings:    parsed.holdings    ?? {},
        trades:      parsed.trades      ?? [],
        limitOrders: parsed.limitOrders ?? [],
      };
    }
  } catch {
    // Ignore parse errors; fall back to initial state
  }
  return initialState();
}

// ── Helpers ────────────────────────────────────────────────────────────────

let _idCounter = Date.now();
function makeId(): string {
  return `tp_${(++_idCounter).toString(36)}`;
}

/** Update or create a Holding after a buy. Returns new holdings map. */
function applyBuy(
  holdings: Record<string, Holding>,
  symbol: string,
  quantity: number,
  priceCents: number,
): Record<string, Holding> {
  const existing = holdings[symbol];
  if (!existing) {
    return { ...holdings, [symbol]: { symbol, quantity, avgCostCents: priceCents } };
  }
  const totalQty = existing.quantity + quantity;
  const totalCost =
    multiplyCents(existing.avgCostCents, existing.quantity) +
    multiplyCents(priceCents, quantity);
  return {
    ...holdings,
    [symbol]: {
      symbol,
      quantity: totalQty,
      avgCostCents: Math.round(totalCost / totalQty),
    },
  };
}

/** Reduce a Holding after a sell. Removes key if quantity reaches 0. */
function applySell(
  holdings: Record<string, Holding>,
  symbol: string,
  quantity: number,
): Record<string, Holding> {
  const existing = holdings[symbol];
  if (!existing) return holdings;
  const remaining = existing.quantity - quantity;
  if (remaining <= 0) {
    const next = { ...holdings };
    delete next[symbol];
    return next;
  }
  return { ...holdings, [symbol]: { ...existing, quantity: remaining } };
}

/**
 * After a limit order executes, revalidate all remaining pending orders
 * against the new balance/holdings. Any order that can no longer be filled
 * is marked 'cancelled' immediately.
 *
 * Sell orders: validated in list order, each reserving quantity so later
 *   orders in the same symbol share the same pool correctly.
 * Buy orders:  validated in list order, each reserving cost so later orders
 *   don't double-count the same cash.
 */
function revalidatePendingOrders(
  limitOrders: LimitOrder[],
  holdings: Record<string, Holding>,
  balanceCents: number,
): LimitOrder[] {
  const virtualSoldQty: Record<string, number> = {};
  let virtualSpentCents = 0;

  return limitOrders.map((order) => {
    if (order.status !== 'pending') return order;

    if (order.side === 'sell') {
      // Per-symbol check: BTC orders only deplete BTC holdings,
      // ETH orders only deplete ETH holdings, etc.
      const heldQty     = holdings[order.symbol]?.quantity ?? 0;
      const alreadySold = virtualSoldQty[order.symbol] ?? 0;
      const remaining   = heldQty - alreadySold;
      if (remaining < order.quantity - 1e-9) {
        return { ...order, status: 'cancelled' as const };
      }
      virtualSoldQty[order.symbol] = alreadySold + order.quantity;
    } else {
      // buy: use triggerPriceCents as worst-case cost
      const costCents = multiplyCents(order.triggerPriceCents, order.quantity);
      if (costCents > balanceCents - virtualSpentCents) {
        return { ...order, status: 'cancelled' as const };
      }
      virtualSpentCents += costCents;
    }

    return order;
  });
}

/** Prepend a trade record, keeping the list capped at 50 entries. */
function recordTrade(
  trades: Trade[],
  trade: Omit<Trade, 'id' | 'timestamp'>,
): Trade[] {
  const newTrade: Trade = { ...trade, id: makeId(), timestamp: Date.now() };
  return [newTrade, ...trades].slice(0, 50);
}

// ── Reducer ────────────────────────────────────────────────────────────────

export function tradingReducer(
  state: TradingState,
  action: TradingAction,
): TradingState {
  switch (action.type) {

    // ── Market Buy ──────────────────────────────────────────────────────────
    case 'BUY_MARKET': {
      const { symbol, quantity, priceCents } = action;
      const totalCents = multiplyCents(priceCents, quantity);

      // Guard: insufficient balance
      if (totalCents > state.balanceCents) return state;

      const newBalance  = state.balanceCents - totalCents;
      const newHoldings = applyBuy(state.holdings, symbol, quantity, priceCents);
      return {
        ...state,
        balanceCents: newBalance,
        holdings:     newHoldings,
        limitOrders:  revalidatePendingOrders(state.limitOrders, newHoldings, newBalance),
        trades:       recordTrade(state.trades, {
          symbol, side: 'buy', type: 'market', quantity, priceCents, totalCents,
        }),
      };
    }

    // ── Market Sell ─────────────────────────────────────────────────────────
    case 'SELL_MARKET': {
      const { symbol, quantity, priceCents } = action;
      const holding = state.holdings[symbol];

      // Guard: no holding or insufficient quantity
      if (!holding || quantity > holding.quantity) return state;

      const totalCents  = multiplyCents(priceCents, quantity);
      const newBalance  = state.balanceCents + totalCents;
      const newHoldings = applySell(state.holdings, symbol, quantity);
      return {
        ...state,
        balanceCents: newBalance,
        holdings:     newHoldings,
        limitOrders:  revalidatePendingOrders(state.limitOrders, newHoldings, newBalance),
        trades:       recordTrade(state.trades, {
          symbol, side: 'sell', type: 'market', quantity, priceCents, totalCents,
        }),
      };
    }

    // ── Add Limit Order ─────────────────────────────────────────────────────
    case 'ADD_LIMIT_ORDER': {
      const newOrder: LimitOrder = {
        ...action.order,
        id:        makeId(),
        status:    'pending',
        createdAt: Date.now(),
      };
      return {
        ...state,
        limitOrders: [newOrder, ...state.limitOrders],
      };
    }

    // ── Execute Limit Order (called by useLimitOrderEngine) ─────────────────
    case 'EXECUTE_LIMIT_ORDER': {
      const { orderId, priceCents } = action;
      const order = state.limitOrders.find(
        (o) => o.id === orderId && o.status === 'pending',
      );
      if (!order) return state;

      const { symbol, side, quantity } = order;
      const totalCents = multiplyCents(priceCents, quantity);

      // Guard: same checks as market orders.
      // On failure mark the order 'cancelled' so it is never retried again.
      const cancelOrder = () => ({
        ...state,
        limitOrders: state.limitOrders.map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
        ),
      });
      if (side === 'buy'  && totalCents > state.balanceCents) return cancelOrder();
      if (side === 'sell' && (!state.holdings[symbol] || quantity > state.holdings[symbol].quantity)) return cancelOrder();

      const updatedOrders = state.limitOrders.map((o) =>
        o.id === orderId ? { ...o, status: 'executed' as const, executedAt: Date.now() } : o,
      );

      const holdings =
        side === 'buy'
          ? applyBuy(state.holdings, symbol, quantity, priceCents)
          : applySell(state.holdings, symbol, quantity);

      const balanceCents =
        side === 'buy'
          ? state.balanceCents - totalCents
          : state.balanceCents + totalCents;

      const revalidatedOrders = revalidatePendingOrders(
        updatedOrders,
        holdings,
        balanceCents,
      );

      return {
        ...state,
        balanceCents,
        holdings,
        limitOrders: revalidatedOrders,
        trades: recordTrade(state.trades, {
          symbol, side, type: 'limit', quantity, priceCents, totalCents,
        }),
      };
    }

    // ── Reset all state ──────────────────────────────────────────────────────
    case 'RESET': {
      localStorage.removeItem(STORAGE_KEY);
      return initialState();
    }

    // ── Cancel Limit Order ──────────────────────────────────────────────────
    case 'CANCEL_LIMIT_ORDER': {
      return {
        ...state,
        limitOrders: state.limitOrders.map((o) =>
          o.id === action.orderId && o.status === 'pending'
            ? { ...o, status: 'cancelled' as const }
            : o,
        ),
      };
    }

    default:
      return state;
  }
}
