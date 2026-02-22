# Performance Notes — 1s Price Updates

The price engine ticks every second across all watched symbols. The goal was
to make sure those ticks don't cause the whole component tree to redraw on
every interval.

## Engine lives outside React

`PriceEngine` is a plain TypeScript class — no `useState`, no `useEffect`.
Its `setInterval` runs on its own. React doesn't know a tick happened until
a subscriber explicitly calls `setState`.

```typescript
this._intervalId = setInterval(() => this._onTick(), TICK_INTERVAL_MS);
```

## Per-symbol subscriptions

Each component subscribes to one symbol via `useTicker`:

```typescript
const unsub = priceEngine.subscribe('BTC', setSnapshot);
```

When BTC ticks, only components subscribed to `'BTC'` re-render. The ETH row,
the SOL row, and any other unrelated components are untouched.

On a single BTC tick:

| Component | Re-renders? |
|---|---|
| `TickerRow[BTC]` | yes |
| `TickerRow[ETH]` | no |
| `TickerRow[SOL]` | no |
| `PriceChart[BTC]` | yes (if selected) |
| `TradePanel[BTC]` | yes (if selected) |
| `Portfolio` | yes — needs all prices |
| `Watchlist`, `Dashboard` | no |

## `React.memo` stops cascades

`TickerRow`, `PriceChart`, and `HoldingRow` are wrapped with `memo`. Even if a
parent re-renders for some other reason, the child bails out if its props
haven't changed. `HoldingRow` in particular matters because `Portfolio`
re-renders on every tick — without memo every holding row would redraw even if
its symbol didn't tick.

```typescript
const TickerRow = memo(function TickerRow({ symbol, selected, onSelect, ... }) {
  const snap = useTicker(symbol);
  ...
});
```

## `useCallback` keeps memo comparisons valid

`Watchlist` wraps `handleAdd` and `handleRemove` in `useCallback` so
`TickerRow` receives a stable function reference between renders:

```typescript
const handleAdd    = useCallback(() => { ... }, [addValue, available, watchlist]);
const handleRemove = useCallback((sym) => { ... }, [watchlist, selectedTicker, onSelectTicker]);
```

## `useRef` for chart history

The chart history (up to 300 points) is kept in a ref rather than state.
`useTickerHistoryRef` mutates `historyRef.current` on each tick — no re-render
scheduled, the data is just there when the chart next draws:

```typescript
priceEngine.subscribe(symbol, (snap) => {
  historyRef.current = snap.history;
});
```

## Refs in the limit order scanner

`useLimitOrderEngine` needs the latest orders, holdings, and balance on every
interval check. Keeping those in sync through state would cause extra renders,
so refs are assigned on each render instead:

```typescript
ordersRef.current   = state.limitOrders;
holdingsRef.current = state.holdings;
balanceRef.current  = state.balanceCents;
```

The interval callback reads through refs, so it always has fresh data without
triggering anything.

## `dispatch` is stable

`useReducer`'s dispatch is referentially stable across renders. Components that
only dispatch (never read state) can take it as a prop and won't re-render when
trading state changes. Price ticks never touch `TradingState` at all, so
`TradingProvider` only re-renders on actual trade actions.
