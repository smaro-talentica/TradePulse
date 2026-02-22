# Testing the Limit Order Logic

Limit orders go through two steps: `useLimitOrderEngine` watches the price and
dispatches `EXECUTE_LIMIT_ORDER` when the trigger is crossed, then
`tradingReducer` handles the actual execution and re-checks balance/holdings
before committing.

The hook isn't tested directly — it depends on timers, a live price engine, and
the React lifecycle, which makes deterministic testing painful. The reducer is
a plain `(state, action) → state` function, so everything interesting can be
covered by just calling it with crafted inputs.

Test file: [src/\_\_tests\_\_/tradingReducer.test.ts](src/__tests__/tradingReducer.test.ts) — 26 tests.

## Fixtures

```typescript
function makeState(overrides: Partial<TradingState> = {}): TradingState {
  return { ...initialState(), ...overrides };
}

function pendingOrder(overrides: Partial<LimitOrder> = {}): LimitOrder {
  return {
    id: 'test-order-1',
    symbol: 'BTC',
    side: 'buy',
    quantity: 0.5,
    triggerPriceCents: 100_00,
    status: 'pending',
    createdAt: 0,
    ...overrides,
  };
}
```

Each test builds only the state it needs. No shared `beforeEach` state that
could silently affect unrelated cases.

## EXECUTE_LIMIT_ORDER cases

**Unknown order id** — action references an id that doesn't exist. The reducer
returns the exact same state object (referential equality), no allocation.

**Insufficient balance on buy** — balance $50, order costs $100. The order
gets marked `cancelled` and balance is untouched. This covers the race where a
market trade drains funds between when the order was placed and when the price
hits the trigger.

```typescript
it('cancels a buy limit order when balance is insufficient', ...)
// expects: status === 'cancelled', balanceCents === 50_00
```

**Insufficient holding on sell** — 1 BTC held, limit sell for 2 BTC. Same
outcome: `cancelled`, no state mutation. Same guard as `SELL_MARKET`.

**Successful buy** — $10k balance, buy 1 BTC at $100. After execution:
`status === 'executed'`, balance reduced by $100, holding created at the
execution price.

**Successful sell** — hold 1 BTC, sell limit at $200. After execution: balance
credited $200, holding entry removed.

**Trade record** — on execution a trade is appended with `type: 'limit'` so the
history panel can distinguish it from market fills.

## revalidatePendingOrders cases

After any `BUY_MARKET` or `SELL_MARKET` the reducer calls
`revalidatePendingOrders` to cancel standing orders that can no longer be
filled. Four cases cover the main scenarios:

**Holdings fully spent** — hold 1 BTC, market-sell it, pending limit-sell for
1 BTC should immediately flip to `cancelled`.

**Balance exhausted** — $200 balance, market-buy ETH for $200, pending
limit-buy that would cost $200 should flip to `cancelled`.

**Partial sell — order stays valid** — hold 2 BTC, market-sell 1, pending
limit-sell for 1 BTC should remain `pending` since 1 BTC is still held. This
catches off-by-one mistakes in the quantity comparison.

**Symbol isolation** — hold BTC and SOL, market-sell all BTC, pending SOL
limit-sell should be unaffected. The revalidation tracks sold quantity per
symbol with a `virtualSoldQty` map, so BTC activity can't cancel SOL orders.

## Running

```bash
npx jest --testPathPattern="tradingReducer" --no-coverage
```

Runs in under a second, no browser or network needed.
