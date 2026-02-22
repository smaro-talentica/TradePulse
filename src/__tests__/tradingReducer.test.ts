/**
 * tradingReducer.test.ts — Unit tests for order execution logic.
 *
 * Covers the core invariants enforced by tradingReducer:
 *  - BUY_MARKET:          balance guard, holding creation, weighted avg cost
 *  - SELL_MARKET:         holdings guard, balance credit, holding removal
 *  - EXECUTE_LIMIT_ORDER: same guards as market orders, auto-cancel on fail
 *  - ADD_LIMIT_ORDER:     pending order creation
 *  - CANCEL_LIMIT_ORDER:  status transition
 *  - RESET:               full state wipe
 *  - revalidatePendingOrders: auto-cancel after market trades
 */

import { tradingReducer, initialState } from '../context/tradingReducer';
import type { TradingState, LimitOrder } from '../types/trading';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<TradingState> = {}): TradingState {
  return { ...initialState(), ...overrides };
}

/** A minimal pending LimitOrder for test setup */
function pendingOrder(overrides: Partial<LimitOrder> = {}): LimitOrder {
  return {
    id: 'test-order-1',
    symbol: 'BTC',
    side: 'buy',
    quantity: 0.5,
    triggerPriceCents: 100_00, // $100.00
    status: 'pending',
    createdAt: 0,
    ...overrides,
  };
}

// ── BUY_MARKET ──────────────────────────────────────────────────────────────

describe('BUY_MARKET', () => {
  it('returns unchanged state when cost exceeds balance', () => {
    const state = makeState({ balanceCents: 5_000 }); // $50.00
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 10_000, // $100.00 — exceeds balance
    });
    expect(next).toBe(state); // referential equality: exact same object
  });

  it('deducts cost from balance on a valid buy', () => {
    const state = makeState({ balanceCents: 1_000_000 }); // $10,000
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00, // $100.00
    });
    expect(next.balanceCents).toBe(1_000_000 - 100_00);
  });

  it('creates a new holding with correct quantity and cost basis', () => {
    const state = makeState({ balanceCents: 1_000_000 });
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'ETH',
      quantity: 2,
      priceCents: 50_000, // $500.00 each
    });
    expect(next.holdings['ETH']).toEqual({
      symbol: 'ETH',
      quantity: 2,
      avgCostCents: 50_000,
    });
  });

  it('updates weighted average cost basis on subsequent buy', () => {
    // First buy: 1 BTC @ $100 → avgCost = $100
    const state1 = tradingReducer(makeState({ balanceCents: 1_000_000 }), {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    // Second buy: 1 BTC @ $200 → avgCost = ($100 + $200) / 2 = $150
    const state2 = tradingReducer(state1, {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 200_00,
    });
    expect(state2.holdings['BTC'].quantity).toBe(2);
    expect(state2.holdings['BTC'].avgCostCents).toBe(150_00);
  });

  it('records a trade entry', () => {
    const state = makeState({ balanceCents: 1_000_000 });
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 0.5,
      priceCents: 100_00,
    });
    expect(next.trades).toHaveLength(1);
    expect(next.trades[0]).toMatchObject({
      symbol: 'BTC',
      side: 'buy',
      type: 'market',
      quantity: 0.5,
      priceCents: 100_00,
      totalCents: 50_00, // 0.5 × $100
    });
  });

  it('allows a buy that exactly exhausts the balance', () => {
    const state = makeState({ balanceCents: 100_00 });
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    expect(next.balanceCents).toBe(0);
    expect(next.holdings['BTC'].quantity).toBe(1);
  });
});

// ── SELL_MARKET ─────────────────────────────────────────────────────────────

describe('SELL_MARKET', () => {
  it('returns unchanged state when no holding exists', () => {
    const state = makeState(); // no holdings
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    expect(next).toBe(state);
  });

  it('returns unchanged state when sell quantity exceeds holding', () => {
    const state = makeState({
      holdings: { BTC: { symbol: 'BTC', quantity: 0.5, avgCostCents: 100_00 } },
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1, // only own 0.5
      priceCents: 100_00,
    });
    expect(next).toBe(state);
  });

  it('credits balance on a valid sell', () => {
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } },
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 200_00,
    });
    expect(next.balanceCents).toBe(200_00);
  });

  it('reduces holding quantity after partial sell', () => {
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 2, avgCostCents: 100_00 } },
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    expect(next.holdings['BTC'].quantity).toBe(1);
  });

  it('removes the holding entirely when all units are sold', () => {
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } },
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    expect(next.holdings['BTC']).toBeUndefined();
  });

  it('records a trade entry', () => {
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } },
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 150_00,
    });
    expect(next.trades[0]).toMatchObject({
      symbol: 'BTC',
      side: 'sell',
      type: 'market',
      quantity: 1,
      priceCents: 150_00,
      totalCents: 150_00,
    });
  });
});

// ── ADD_LIMIT_ORDER ──────────────────────────────────────────────────────────

describe('ADD_LIMIT_ORDER', () => {
  it('adds a pending limit order', () => {
    const state = makeState();
    const next = tradingReducer(state, {
      type: 'ADD_LIMIT_ORDER',
      order: {
        symbol: 'BTC',
        side: 'buy',
        quantity: 0.5,
        triggerPriceCents: 100_00,
      },
    });
    expect(next.limitOrders).toHaveLength(1);
    expect(next.limitOrders[0]).toMatchObject({
      symbol: 'BTC',
      side: 'buy',
      quantity: 0.5,
      triggerPriceCents: 100_00,
      status: 'pending',
    });
    expect(next.limitOrders[0].id).toBeTruthy();
  });
});

// ── CANCEL_LIMIT_ORDER ───────────────────────────────────────────────────────

describe('CANCEL_LIMIT_ORDER', () => {
  it('marks a pending order as cancelled', () => {
    const order = pendingOrder();
    const state = makeState({ limitOrders: [order] });
    const next = tradingReducer(state, {
      type: 'CANCEL_LIMIT_ORDER',
      orderId: order.id,
    });
    expect(next.limitOrders[0].status).toBe('cancelled');
  });

  it('does not affect already-executed orders', () => {
    const order = pendingOrder({ status: 'executed' });
    const state = makeState({ limitOrders: [order] });
    const next = tradingReducer(state, {
      type: 'CANCEL_LIMIT_ORDER',
      orderId: order.id,
    });
    expect(next.limitOrders[0].status).toBe('executed');
  });
});

// ── EXECUTE_LIMIT_ORDER ──────────────────────────────────────────────────────

describe('EXECUTE_LIMIT_ORDER', () => {
  it('returns unchanged state when order id does not exist', () => {
    const state = makeState();
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: 'nonexistent',
      priceCents: 100_00,
    });
    expect(next).toBe(state);
  });

  it('cancels a buy limit order when balance is insufficient', () => {
    const order = pendingOrder({ side: 'buy', quantity: 1, triggerPriceCents: 100_00 });
    const state = makeState({
      balanceCents: 50_00, // only $50, order costs $100
      limitOrders: [order],
    });
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: order.id,
      priceCents: 100_00,
    });
    expect(next.limitOrders[0].status).toBe('cancelled');
    expect(next.balanceCents).toBe(50_00); // balance unchanged
  });

  it('cancels a sell limit order when holding is insufficient', () => {
    const order = pendingOrder({ side: 'sell', quantity: 2, triggerPriceCents: 100_00 });
    const state = makeState({
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } }, // only 1, need 2
      limitOrders: [order],
    });
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: order.id,
      priceCents: 100_00,
    });
    expect(next.limitOrders[0].status).toBe('cancelled');
  });

  it('executes a buy limit order: deducts balance and creates holding', () => {
    const order = pendingOrder({ side: 'buy', quantity: 1, triggerPriceCents: 100_00 });
    const state = makeState({
      balanceCents: 1_000_000,
      limitOrders: [order],
    });
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: order.id,
      priceCents: 100_00,
    });
    expect(next.limitOrders[0].status).toBe('executed');
    expect(next.balanceCents).toBe(1_000_000 - 100_00);
    expect(next.holdings['BTC']).toMatchObject({ symbol: 'BTC', quantity: 1, avgCostCents: 100_00 });
  });

  it('executes a sell limit order: credits balance and removes holding', () => {
    const order = pendingOrder({ side: 'sell', quantity: 1, triggerPriceCents: 200_00 });
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } },
      limitOrders: [order],
    });
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: order.id,
      priceCents: 200_00,
    });
    expect(next.limitOrders[0].status).toBe('executed');
    expect(next.balanceCents).toBe(200_00);
    expect(next.holdings['BTC']).toBeUndefined();
  });

  it('records a trade entry on execution', () => {
    const order = pendingOrder({ side: 'buy', quantity: 0.5, triggerPriceCents: 100_00 });
    const state = makeState({ balanceCents: 1_000_000, limitOrders: [order] });
    const next = tradingReducer(state, {
      type: 'EXECUTE_LIMIT_ORDER',
      orderId: order.id,
      priceCents: 100_00,
    });
    expect(next.trades[0]).toMatchObject({
      symbol: 'BTC',
      side: 'buy',
      type: 'limit',
      quantity: 0.5,
      priceCents: 100_00,
    });
  });
});

// ── revalidatePendingOrders (via BUY_MARKET / SELL_MARKET) ──────────────────

describe('revalidatePendingOrders', () => {
  it('cancels a pending sell order after holdings are spent via market sell', () => {
    // Hold 1 BTC, have a pending limit sell for 1 BTC
    const sellOrder = pendingOrder({ side: 'sell', quantity: 1, triggerPriceCents: 200_00 });
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 } },
      limitOrders: [sellOrder],
    });
    // Market-sell the 1 BTC — holdings become zero
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    // The standing sell limit should now be cancelled (nothing left to sell)
    expect(next.limitOrders[0].status).toBe('cancelled');
  });

  it('cancels a pending buy order after balance is exhausted via market buy', () => {
    // Balance $200, pending buy limit for 1 BTC @ $200
    const buyOrder = pendingOrder({ side: 'buy', quantity: 1, triggerPriceCents: 200_00 });
    const state = makeState({
      balanceCents: 200_00,
      limitOrders: [buyOrder],
    });
    // Market-buy something that costs the entire balance
    const next = tradingReducer(state, {
      type: 'BUY_MARKET',
      symbol: 'ETH',
      quantity: 1,
      priceCents: 200_00, // spends all $200
    });
    // Standing buy limit now has no funding
    expect(next.limitOrders[0].status).toBe('cancelled');
  });

  it('keeps a pending sell order valid when holdings are partially sold', () => {
    // Hold 2 BTC, limit sell for 1 BTC — after selling 1 BTC via market, still have 1 left
    const sellOrder = pendingOrder({ side: 'sell', quantity: 1, triggerPriceCents: 200_00 });
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 2, avgCostCents: 100_00 } },
      limitOrders: [sellOrder],
    });
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    // 1 BTC still held — the pending sell for 1 BTC is still valid
    expect(next.limitOrders[0].status).toBe('pending');
  });

  it('does not cross-cancel sell orders for a different symbol', () => {
    // Hold 1 ETH, sell 1 BTC via market (no BTC holdings — guard fires, state unchanged)
    // Instead: hold 1 BTC, pending SOL sell order — selling BTC should not cancel SOL order
    const solSellOrder = pendingOrder({
      id: 'sol-order',
      symbol: 'SOL',
      side: 'sell',
      quantity: 10,
      triggerPriceCents: 20_00,
    });
    const state = makeState({
      balanceCents: 0,
      holdings: {
        BTC: { symbol: 'BTC', quantity: 1, avgCostCents: 100_00 },
        SOL: { symbol: 'SOL', quantity: 10, avgCostCents: 20_00 },
      },
      limitOrders: [solSellOrder],
    });
    // Sell all BTC — should not affect SOL sell limit
    const next = tradingReducer(state, {
      type: 'SELL_MARKET',
      symbol: 'BTC',
      quantity: 1,
      priceCents: 100_00,
    });
    expect(next.limitOrders[0].status).toBe('pending');
  });
});

// ── RESET ────────────────────────────────────────────────────────────────────

describe('RESET', () => {
  it('returns fresh initial state', () => {
    const state = makeState({
      balanceCents: 0,
      holdings: { BTC: { symbol: 'BTC', quantity: 5, avgCostCents: 100_00 } },
      trades: [{ id: 't1', symbol: 'BTC', side: 'buy', type: 'market', quantity: 5, priceCents: 100_00, totalCents: 500_00, timestamp: 0 }],
    });
    const next = tradingReducer(state, { type: 'RESET' });
    expect(next.balanceCents).toBe(initialState().balanceCents);
    expect(next.holdings).toEqual({});
    expect(next.trades).toEqual([]);
    expect(next.limitOrders).toEqual([]);
  });
});
