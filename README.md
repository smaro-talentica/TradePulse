# TradePulse

A paper trading terminal built with React 19 + TypeScript. Simulates real-time crypto price feeds and supports market and limit orders with live P&L tracking.

---

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later (comes with Node.js)

---

## Installation

```bash
npm install
```

---

## Development

Start the Vite dev server with hot-module replacement:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Production Build

Compile and bundle for production:

```bash
npm run build
```

Output is written to `dist/`. To preview the production build locally:

```bash
npm run preview
```

---

## Testing

Run the full unit test suite (Jest):

```bash
npm test
```

Run tests in watch mode (re-runs on file save):

```bash
npm run test:watch
```

Tests live in `src/__tests__/` and cover:
- `BUY_MARKET` / `SELL_MARKET` order execution guards (balance, holdings)
- `EXECUTE_LIMIT_ORDER` execution and auto-cancellation
- `revalidatePendingOrders` — orphan order cleanup after state changes
- `RESET`, `ADD_LIMIT_ORDER`, `CANCEL_LIMIT_ORDER`

---

## Linting

```bash
npm run lint
```

---

## Project Structure

```
src/
├── __tests__/          # Unit tests (Jest)
├── components/
│   ├── Chart/          # SVG price chart (no external charting libraries)
│   ├── Layout/         # Dashboard layout + provider wiring
│   ├── Portfolio/      # Holdings, P&L, limit orders, trade history
│   ├── Trade/          # Market + limit order entry form
│   └── Watchlist/      # Per-ticker rows with isolated price subscriptions
├── constants/          # Ticker config, initial prices, history length
├── context/            # TradingContext, reducer, persistence
├── engine/             # PriceEngine singleton — random-walk price simulation
├── hooks/              # useTicker, useAllTickers, useTickerHistoryRef
├── pages/              # Route-level page components
├── types/              # Shared TypeScript domain types
└── utils/              # math.ts (integer-cents arithmetic), chartHelpers.ts
```

---

## Key Design Decisions

| Concern | Approach |
|---|---|
| Currency precision | All monetary values stored as integer cents — no floating-point drift |
| Re-render isolation | Per-symbol `useTicker()` subscriptions + `memo` prevent dashboard-wide re-renders on every 1 s price tick |
| Chart | Hand-written SVG coordinate mapping (`chartHelpers.ts`) — no charting libraries |
| Price engine | Custom pub/sub singleton (`priceEngine.ts`) — framework-free, testable in isolation |
| State | `useReducer` + React Context — no Redux or external state library |
