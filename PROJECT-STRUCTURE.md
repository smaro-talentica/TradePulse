# TradePulse — Project Structure

## Top-Level Layout

```
TradePulse/
├── src/                    # All application source code
├── public/                 # Static assets served as-is
├── index.html              # Vite HTML entry point
├── vite.config.js          # Vite bundler configuration
├── babel.config.js         # Babel config (used by Jest only)
├── jest.config.js          # Jest test runner configuration
├── jest.setup.js           # Jest global setup (@testing-library/jest-dom)
├── tsconfig.json           # TypeScript compiler options
├── eslint.config.js        # ESLint flat config
├── package.json            # Dependencies and npm scripts
├── README.md               # Build/run/test instructions
└── PROJECT-STRUCTURE.md    # This file
```

---

## `src/` Module Map

```
src/
├── main.tsx                # React DOM root — mounts <App />
├── App.tsx                 # Router setup (react-router-dom)
├── vite-env.d.ts           # Vite/ImportMeta type augmentations
├── css-modules.d.ts        # *.module.css type declaration
│
├── pages/
│   └── Home.tsx            # Route "/" — renders <Dashboard />
│
├── components/
│   ├── Layout/
│   │   ├── Dashboard.tsx         # Root layout: 3-column grid, provider wiring
│   │   └── Dashboard.module.css
│   ├── Chart/
│   │   ├── PriceChart.tsx        # SVG price chart (no external libraries)
│   │   └── PriceChart.module.css
│   ├── Trade/
│   │   ├── TradePanel.tsx        # Market + limit order entry form
│   │   └── TradePanel.module.css
│   ├── Watchlist/
│   │   ├── Watchlist.tsx         # Watchlist container (add/remove tickers)
│   │   ├── TickerRow.tsx         # Single ticker row — memo'd, own subscription
│   │   └── Watchlist.module.css
│   └── Portfolio/
│       ├── Portfolio.tsx         # Holdings, P&L, limit orders, trade history
│       └── Portfolio.module.css
│
├── context/
│   ├── TradingContextDef.ts  # Context object + TradingContextValue type
│   ├── TradingContext.tsx    # <TradingProvider> component (useReducer + persistence)
│   ├── tradingReducer.ts     # Pure reducer — all state mutations live here
│   └── useTradingContext.ts  # Hook to consume TradingContext
│
├── engine/
│   └── priceEngine.ts        # PriceEngine singleton — random-walk price simulation
│
├── hooks/
│   ├── usePriceEngine.ts         # useTicker, useAllTickers, useTickerHistoryRef
│   ├── usePriceEngineLifecycle.ts # start/stop engine on mount/unmount
│   └── useLimitOrderEngine.ts    # 500 ms scanner — executes pending limit orders
│
├── constants/
│   └── tickers.ts            # Ticker configs (symbol, name, initialPriceCents, volatility)
│
├── types/
│   └── trading.ts            # Shared domain types: TradingState, Holding, Trade, LimitOrder
│
├── utils/
│   ├── math.ts               # Integer-cents arithmetic: multiplyCents, formatUsd, etc.
│   └── chartHelpers.ts       # SVG coordinate mapping: buildChartCoords()
│
└── __tests__/
    └── tradingReducer.test.ts  # 26 unit tests for order execution logic
```

---

## Module Responsibilities

### `engine/priceEngine.ts`
Framework-free TypeScript singleton. Runs a `setInterval` (1 s) and generates
new prices via a random-walk algorithm. Exposes a pub/sub API:

```
priceEngine.subscribe(symbol | '*', callback) → unsubscribe()
priceEngine.getSnapshot(symbol) → TickerSnapshot
priceEngine.start() / .stop()
```

Components never access this directly — they go through hooks.

---

### `hooks/usePriceEngine.ts`
Three hooks that bridge the engine into React's render cycle:

| Hook | Re-renders | Use case |
|---|---|---|
| `useTicker(symbol)` | When that symbol ticks | Single ticker row, chart, trade form |
| `useAllTickers()` | On every tick (any symbol) | Portfolio — needs all live prices |
| `useTickerHistoryRef(symbol)` | Never | Chart history via ref mutation only |

---

### `context/tradingReducer.ts`
Pure reducer (no React imports). Handles all state mutations:
- `BUY_MARKET` / `SELL_MARKET` — with balance/holdings guards
- `ADD_LIMIT_ORDER` / `CANCEL_LIMIT_ORDER` / `EXECUTE_LIMIT_ORDER`
- `RESET`
- `revalidatePendingOrders()` — auto-cancels orphaned orders after every trade

All monetary arithmetic uses `multiplyCents()` (integer cents, no float drift).

---

### `hooks/useLimitOrderEngine.ts`
Bridges the price engine and the trading reducer for limit orders.
Two parallel scanning paths:
1. **Price-tick subscriber** (`priceEngine.subscribe('*')`) — immediate execution
   when a tick crosses the trigger, with virtual accounting to prevent
   double-execution within a single tick.
2. **500 ms `setInterval`** — catches orders placed when the condition was
   already met (the tick subscriber would have fired before the order existed).

Both paths read state through refs to avoid stale closures.

---

### `utils/chartHelpers.ts`
Stateless coordinate-mapping function. Converts a `number[]` price history
(integer cents) into SVG geometry:

```
x = pad.left + (i / (N-1)) * chartW
y = pad.top  + (1 - (price - yMin) / yRange) * chartH
```

Returns `{ polylinePoints, fillPolygonPoints, yLabels, currentX, currentY }`.
No charting library is used anywhere in the project.

---

### `utils/math.ts`
All monetary helpers:

| Function | Purpose |
|---|---|
| `multiplyCents(priceCents, qty)` | `Math.round(priceCents × qty)` — no fractional cents |
| `formatUsd(cents)` | `Intl.NumberFormat` → `"$67,124.00"` |
| `pctChange(from, to)` | Decimal percentage, e.g. `0.025` |
| `formatPct(pct)` | `"+2.50%"` |
| `randomWalkStep(priceCents, volatility)` | Used by price engine only |

---

## Data Flow

```
priceEngine (setInterval 1s)
    │
    ├─ subscribe(symbol) → useTicker()     → TickerRow, PriceChart, TradePanel
    ├─ subscribe('*')    → useAllTickers() → Portfolio
    ├─ subscribe('*')    → useLimitOrderEngine → dispatch(EXECUTE_LIMIT_ORDER)
    └─ getSnapshot()     → direct reads in TradePanel (stale-state bypass)

User action (buy/sell/limit)
    │
    └─ dispatch(action) → tradingReducer → new TradingState
                              │
                              └─ revalidatePendingOrders() → auto-cancel orphans
                              └─ localStorage.setItem (via useEffect in TradingProvider)
```

---

## State Shape

```typescript
TradingState {
  balanceCents:  number                      // integer cents, e.g. 1_000_000 = $10,000
  holdings:      Record<symbol, Holding>     // keyed by ticker symbol
  trades:        Trade[]                     // newest first, capped at 50
  limitOrders:   LimitOrder[]                // pending | executed | cancelled
}
```

All state is persisted to `localStorage` on every change and restored on load.
