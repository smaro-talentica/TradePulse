# TradePulse — Architecture

## Table of Contents

1. [Chart Rendering Logic](#1-chart-rendering-logic)
2. [Mock Price Engine](#2-mock-price-engine)
3. [State Management](#3-state-management)
4. [Limit Order Engine](#4-limit-order-engine)
5. [Re-render Isolation Strategy](#5-re-render-isolation-strategy)
6. [Currency Precision](#6-currency-precision)

---

## 1. Chart Rendering Logic

### How an array of prices becomes a visual line

The chart is built entirely from native SVG — no charting library is used.
The pipeline has three stages:

```
number[] (integer cents)
    │
    ▼
buildChartCoords()          ← src/utils/chartHelpers.ts
    │
    ▼
{ polylinePoints, fillPolygonPoints, yLabels, currentX, currentY }
    │
    ▼
<PriceChart />              ← renders <polyline>, <polygon>, <line>, <text>, <circle>
```

---

### Stage 1 — Define the usable drawing area

The SVG has a fixed `viewBox="0 0 800 300"`. A padding object reserves space
for the y-axis labels on the right and a small margin on all sides:

```
PAD = { top: 24, right: 72, bottom: 28, left: 8 }

chartW = 800 - 8  - 72 = 720   (horizontal drawing width)
chartH = 300 - 24 - 28 = 248   (vertical drawing height)
```

---

### Stage 2 — Determine the Y-axis range

Raw min/max of the price history are expanded by 5% on each side so the line
never touches the chart edges:

```
rawMin   = Math.min(...history)
rawMax   = Math.max(...history)
rawRange = rawMax - rawMin          (or 1 if flat — prevents division by zero)

yPad  = rawRange × 0.05
yMin  = rawMin - yPad              ← effective bottom of the chart
yMax  = rawMax + yPad              ← effective top of the chart
yRange = yMax - yMin
```

---

### Stage 3 — Map each price to an (x, y) coordinate

For the i-th price in an array of length N:

$$x_i = \text{pad.left} + \frac{i}{N - 1} \times \text{chartW}$$

$$y_i = \text{pad.top} + \left(1 - \frac{price_i - y_{min}}{y_{range}}\right) \times \text{chartH}$$

**Why `(1 - normalised)`?**  
SVG's Y-axis grows *downward* (Y = 0 is at the top). A higher price should
appear *higher* on screen (smaller Y value), so the formula inverts the
normalised value before scaling.

| normalised value | meaning | SVG y result |
|---|---|---|
| `1.0` | highest price in range | `pad.top` (top of chart) |
| `0.5` | midpoint | `pad.top + chartH / 2` |
| `0.0` | lowest price in range | `pad.top + chartH` (bottom) |

---

### Stage 4 — Build SVG geometry strings

**Polyline** (the price line):
```
"120.0,180.3 121.4,175.1 122.8,182.7 ..."
```
Each `x,y` pair is joined by spaces and passed directly to the SVG
`<polyline points="...">` attribute.

**Fill polygon** (gradient area below the line):
The polyline points are extended with two baseline corners to close the shape:
```
...last point → (lastX, baselineY) → (firstX, baselineY)
```
where `baselineY = pad.top + chartH`. This creates a closed polygon that SVG
fills with a `<linearGradient>` from the line color (top) to transparent (bottom).

**Y-axis grid labels** — 5 evenly-spaced horizontal lines:
```
for i in 0..4:
    frac       = i / 4              // 0.0, 0.25, 0.5, 0.75, 1.0
    priceCents = yMax - frac × yRange    // high → low
    y          = pad.top + frac × chartH
```

---

### Stage 5 — React renders the SVG elements

`PriceChart.tsx` receives the geometry and renders:

```tsx
<polyline points={coords.polylinePoints} />          // price line
<polygon  points={coords.fillPolygonPoints} />       // gradient fill
{coords.yLabels.map(l => <line /> + <text />)}       // grid + labels
<circle cx={coords.currentX} cy={coords.currentY} /> // current price dot
<line ... strokeDasharray="4 3" />                   // dashed guide line
```

`PriceChart` is wrapped in `React.memo` — it only re-renders when its own
`useTicker(ticker)` subscription fires, not when any other part of the UI
changes.

---

## 2. Mock Price Engine

### Design goal

Every component that displays a price must show the *same* value at the *same*
moment, even though components are spread across different parts of the tree
and subscribe independently. A naive approach (each component calling
`Math.random()` itself) would produce different prices in different places.

### The singleton pattern

There is exactly **one** `PriceEngine` instance for the entire application:

```typescript
// src/engine/priceEngine.ts
class PriceEngine { ... }

export const priceEngine = new PriceEngine();   // ← module-level singleton
```

Because JavaScript modules are cached after the first `import`, every file
that imports `priceEngine` receives the exact same object reference. There is
no way for two components to end up with different engine instances.

---

### How a tick works

```
setInterval(1000ms)
    │
    └─ _onTick()
          │
          ├─ for each symbol:
          │     newPrice = randomWalkStep(currentPrice, volatility)
          │     history.push(newPrice)          // rolling buffer, max 300 entries
          │     state.priceCents = newPrice
          │
          └─ notify ALL subscribers
                ├─ _subscribers.get('BTC') → [cb1, cb2, ...]
                ├─ _subscribers.get('ETH') → [cb3, ...]
                └─ _subscribers.get('*')   → [cb4, cb5, ...]   // wildcard
```

All subscriber callbacks for a symbol fire **synchronously within the same
tick iteration**. A BTC subscriber and an ETH subscriber called during the
same tick always see prices that were computed together — there is no
possibility of one component seeing the new BTC price while another still
shows the old one.

---

### The pub/sub API

```typescript
// Subscribe to a single ticker
const unsub = priceEngine.subscribe('BTC', (snap: TickerSnapshot) => { ... });

// Subscribe to ALL tickers (wildcard)
const unsub = priceEngine.subscribe('*', (snap: TickerSnapshot) => { ... });

// Synchronous read — safe before the first tick
const snap = priceEngine.getSnapshot('BTC');

// Call unsub() to stop receiving updates (used in useEffect cleanup)
unsub();
```

The subscriber registry is a `Map<string, Set<callback>>`. Using a `Set`
prevents the same callback from being registered twice and gives O(1) add/delete.

---

### How hooks bridge the engine into React

Hooks translate engine callbacks into React state updates, providing the
standard React re-render model on top of the engine's push notifications:

**`useTicker(symbol)`** — per-symbol isolation:
```typescript
export function useTicker(symbol: string): TickerSnapshot {
  const [snapshot, setSnapshot] = useState(() => priceEngine.getSnapshot(symbol));

  useEffect(() => {
    setSnapshot(priceEngine.getSnapshot(symbol));       // sync on symbol change
    const unsub = priceEngine.subscribe(symbol, setSnapshot);
    return unsub;                                        // cleanup on unmount
  }, [symbol]);

  return snapshot;
}
```

When the engine fires a BTC tick, only components subscribed to `'BTC'` via
`useTicker('BTC')` re-render. An `ETH` component is completely unaffected.

**`useAllTickers()`** — full board (used only by Portfolio):
```typescript
const unsub = priceEngine.subscribe('*', (updated) => {
  setSnapshots(prev => ({ ...prev, [updated.symbol]: updated }));
});
```

**`useTickerHistoryRef(symbol)`** — zero re-renders:
```typescript
const historyRef = useRef(priceEngine.getSnapshot(symbol).history);

priceEngine.subscribe(symbol, (snap) => {
  historyRef.current = snap.history;   // mutates ref — React never re-renders
});
```
Used by chart redraw logic that operates independently of React's reconciler.

---

### Consistency guarantee across components

| Scenario | Outcome |
|---|---|
| BTC row and BTC chart both mounted | Both subscribe to `'BTC'`, both receive the exact same `TickerSnapshot` object from the same tick |
| BTC ticks while ETH is selected | BTC's `TickerRow` re-renders; ETH's chart/panel are untouched |
| Component reads `getSnapshot()` synchronously (e.g. on ticker switch) | Returns the latest committed price — never stale |
| Two `useTicker('BTC')` calls in different components | Each gets its own `useState` slot but both receive the same snapshot value from the same tick callback |

---

### The random-walk algorithm

```typescript
function randomWalkStep(priceCents: number, volatility: number): number {
  const delta = (Math.random() * 2 - 1) * volatility;
  return Math.max(1, Math.round(priceCents * (1 + delta)));
}
```

- `delta` is uniform in `[-volatility, +volatility]`
- Multiplicative (not additive), so volatility scales with price level
- `Math.max(1, ...)` ensures the price never reaches zero
- `Math.round(...)` keeps the result in integer cents

Each ticker has its own `volatility` constant:

| Ticker | Volatility | Max move per tick |
|---|---|---|
| BTC | 0.005 | ±0.5% |
| ETH | 0.006 | ±0.6% |
| SOL | 0.008 | ±0.8% |

---

## 3. State Management

### Architecture

```
<TradingProvider>          ← src/context/TradingContext.tsx
    useReducer(tradingReducer, loadState)
    │
    ├─ state    ─── TradingContext.Provider value
    └─ dispatch ─── TradingContext.Provider value
```

`tradingReducer` is a pure function with no React imports — it can be
unit-tested directly without any React setup (see `src/__tests__/tradingReducer.test.ts`).

### Persistence

State is mirrored to `localStorage` in two ways:

1. **After every dispatch** — `useEffect([state])` serialises and saves.
2. **On `beforeunload`** — a `stateRef` (always current via `stateRef.current = state`)
   is serialised synchronously. This guarantees save even when the user closes
   the tab before React's paint cycle completes.

---

## 4. Limit Order Engine

### The problem

A limit order should execute when the market price crosses the trigger. Two
edge cases make this non-trivial:

1. **Already-crossed trigger** — if the user places a limit buy at $100 when
   the price is already $90, the next tick might never cross $100 from above.
   A tick-only subscriber would never fire.

2. **Double execution** — the price engine notifies all `'*'` subscribers
   within a single tick. If two sell orders for the same symbol are pending,
   both callbacks fire before the reducer has processed the first execution,
   so both see the original holdings and both try to execute.

### Solution: two complementary scanning paths

```
Path 1 — tick subscriber (priceEngine.subscribe('*'))
    Fires on every price tick.
    Virtual accounting per tick:
      virtualSoldQty[symbol]  — tracks qty reserved by earlier executions
      virtualBoughtCents      — tracks cash reserved by earlier buy executions
    Prevents double-execution within the same tick without waiting for state.

Path 2 — 500 ms setInterval
    Reads pending orders and live prices through refs (never stale).
    Catches orders placed when the trigger was already met.
    Deduplicates with Path 1 via the reducer guard:
      EXECUTE_LIMIT_ORDER only acts on orders with status === 'pending'.
```

Both paths use `ordersRef`, `holdingsRef`, and `balanceRef` — refs that are
updated synchronously on every render — so they always reflect the latest
reducer state without creating new effect dependencies.

### Post-execution revalidation

After any state-changing action (`BUY_MARKET`, `SELL_MARKET`,
`EXECUTE_LIMIT_ORDER`), the reducer calls `revalidatePendingOrders()` to
auto-cancel any standing orders that can no longer be filled:

```
sell order: heldQty - virtualSoldQty[symbol] < order.quantity  → cancel
buy  order: balanceCents - virtualSpentCents < cost             → cancel
```

This is validated in list order with virtual accounting, so multiple pending
orders for the same symbol are checked cumulatively against the same pool.

---

## 5. Re-render Isolation Strategy

The price engine ticks every second. Without isolation, every tick would
re-render the entire component tree. The following measures prevent this:

| Technique | Where applied | Effect |
|---|---|---|
| Per-symbol `useTicker(symbol)` | `TickerRow`, `PriceChart`, `TradePanel` | Only the subscribed symbol's components re-render |
| `React.memo` | `TickerRow`, `PriceChart`, `HoldingRow` | Sibling/parent re-renders don't cascade in |
| `useCallback` | `Watchlist.handleAdd`, `handleRemove` | Stable function refs keep memo'd `TickerRow` props unchanged |
| `useTickerHistoryRef` | Chart history | History updates mutate a ref — zero re-renders |
| `useReducer` + stable `dispatch` | `TradingProvider` | `dispatch` reference never changes; price ticks don't touch trading state |

**Result:** a single BTC tick causes at most 3 components to re-render
(`TickerRow[BTC]`, `PriceChart[BTC]` if selected, `Portfolio`).
`Dashboard`, `DashboardInner`, `Watchlist`, and all other `TickerRow`
instances are completely skipped.

---

## 6. Currency Precision

All monetary values are stored and computed as **integer cents** to eliminate
IEEE 754 floating-point drift.

```
$67,124.00  →  6_712_400  (integer, no rounding error)
```

The only operation that crosses the integer boundary is `multiplyCents`:

```typescript
export function multiplyCents(priceCents: number, quantity: number): number {
  return Math.round(priceCents * quantity);
}
```

`Math.round` collapses any sub-cent remainder back to an integer immediately.
Every balance deduction, credit, weighted-average cost calculation, and
estimated total goes through this function — raw `*` is never used on monetary
values.

User input (trigger price in dollars) is converted at the form boundary:
```typescript
const triggerPriceCents = Math.round(triggerDollars * 100);
```
After this point the value is an integer and stays an integer throughout the
reducer and engine.
