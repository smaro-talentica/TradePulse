/**
 * trading.ts — Core trading domain types shared across context, reducer,
 * hooks and components.
 */

// ── Enums / Unions ─────────────────────────────────────────────────────────

export type TradeSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type LimitOrderStatus = 'pending' | 'executed' | 'cancelled';

// ── Domain models ──────────────────────────────────────────────────────────

export interface Holding {
  symbol: string;
  /** Number of units held (supports fractional, e.g. 0.5 BTC) */
  quantity: number;
  /** Weighted-average cost-basis per unit, in integer cents */
  avgCostCents: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  type: OrderType;
  quantity: number;
  /** Execution price in integer cents */
  priceCents: number;
  /** quantity × priceCents (integer cents) */
  totalCents: number;
  timestamp: number;
}

export interface LimitOrder {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  /** Price level that triggers execution, in integer cents */
  triggerPriceCents: number;
  status: LimitOrderStatus;
  createdAt: number;
  executedAt?: number;
}

// ── Top-level state ────────────────────────────────────────────────────────

export interface TradingState {
  /** Cash available, in integer cents */
  balanceCents: number;
  /** Keyed by symbol */
  holdings: Record<string, Holding>;
  /** Chronological trade history (newest first, capped at 50) */
  trades: Trade[];
  /** All limit orders — pending, executed, cancelled */
  limitOrders: LimitOrder[];
}

// ── Reducer actions ────────────────────────────────────────────────────────

export type TradingAction =
  | { type: 'BUY_MARKET';  symbol: string; quantity: number; priceCents: number }
  | { type: 'SELL_MARKET'; symbol: string; quantity: number; priceCents: number }
  | { type: 'ADD_LIMIT_ORDER';     order: Omit<LimitOrder, 'id' | 'status' | 'createdAt'> }
  | { type: 'EXECUTE_LIMIT_ORDER'; orderId: string; priceCents: number }
  | { type: 'CANCEL_LIMIT_ORDER';  orderId: string }
  | { type: 'RESET' };
