# TradePulse — Development Chat History

A chronological log of every major development prompt and the engineering
rationale behind each decision.

---

## #1 — Initial Route & Page Scaffold

> *"Create a default route and a component inside src/page folder."*

Established the entry point for the application. A dedicated `src/pages/`
folder separates route-level components from reusable UI components — a standard
React project convention that makes routing intent explicit and keeps `App.tsx`
clean. `react-router-dom` was wired up here so future pages can be added without
restructuring.

---

## #2 — TypeScript + UI Layout

> *"Proposed architecture looks good, however use TypeScript-based TSX everywhere.
> Start with UI layout design."*

Enforcing TypeScript from the start eliminates entire categories of
runtime bugs (especially important for monetary values and domain types like
`Holding`, `Trade`, `LimitOrder`). Starting with the layout shell — the
3-column dashboard grid — before implementing features provides a visual
skeleton to build into and avoids having to restructure the DOM later.

---

## #3 — Mock Price Engine

> *"Let's start with core feature implementation one by one. Start with mock
> price engine. Use ReactJS-style architecture as much as possible. All JS
> related functions can be placed in helper file."*

The price engine is the foundation everything else depends on. Building
it first, as a framework-free singleton (`priceEngine.ts`), meant all subsequent
components could subscribe to it rather than polling or lifting state. Placing
math helpers in `utils/math.ts` keeps the engine pure and unit-testable. The
pub/sub pattern (`subscribe(symbol, cb) → unsubscribe`) was chosen so React
hooks could bridge the engine into React's render cycle without the engine
itself knowing anything about React.

---

## #4 — Watchlist + SVG Chart

> *"Let's implement the next core feature i.e. watchlist, custom SVG chart."*

These two features together form the "read" side of the terminal —
live price monitoring. Building them before trade execution confirmed the price
engine's pub/sub design worked correctly under real component usage. The SVG
chart was implemented from scratch (`chartHelpers.ts`) to satisfy the
"no visualisation libraries" constraint. Isolating the coordinate-mapping math
into a pure helper function made it independently testable and kept the React
component thin.

---

## #5 — Trade Execution, Limit Orders, and Persistence

> *"Let's implement the next core feature i.e. trade execution, limit orders
> and persistence."*

This is the core business logic of the application. Using `useReducer`
with a pure `tradingReducer` function enforced that all state mutations are
explicit, auditable, and testable without React. `localStorage` persistence
was wired into `TradingProvider` at this stage so that state survived page
refreshes from the beginning — adding it later would have required
retrofitting.

---

## #6 — Limit Order Execution Bug Fix

> *"Limit order is not getting executed. Recheck the implemented logic and fix
> this issue if anything is found."*

The original implementation relied on `useEffect([limitOrders])` to
scan for executable orders, but this was inside React's render cycle — it
could miss windows where the price crossed the trigger between renders.
The fix replaced this with a `setInterval` (500 ms) that reads through refs
(`ordersRef`, `holdingsRef`, `balanceRef`), completely outside React. This
guarantees orders placed when the trigger is *already* met are still executed.

---

## #7 — Reset Button

> *"Add a button to reset the entire application buy/sell."*

Essential for testing and demoing. Added a `RESET` action to the
reducer (which also clears `localStorage`) and a button in the Portfolio panel.
Because the reducer is pure, the reset is a single-line state replacement with
no side effects beyond the storage clear.

---

## #8 — Sell-Side UX Improvements

> *"Sell option should be enabled if it's already added in portfolio and
> quantity should be auto populated for sell option with value as maximum
> units held."*

Prevents invalid sell attempts before they reach the reducer (UX
guard on top of the reducer guard). Auto-populating max quantity reduces
friction for the common "sell everything" case. The Sell button is disabled
when `ownedQty === 0` to make the constraint visible rather than silent.

---

## #9 — Chart / Trade Panel Layout Split

> *"Reduce the graph height (max vertically 50%) and increase the space of
> below buy/sell area (remaining 50%)."*

The original chart consumed too much vertical space, leaving the
trade form cramped. A 50/50 CSS split in the terminal column gives both areas
equal prominence, matching the mental model of "watch price, then act".

---

## #10 — Limit Order Trigger Price Pre-fill + Price Typography

> *"Triggered price in limit should be auto-filled as current price in the
> moment when it is opened. Make the right side price font a little bold and
> white in colour to make it more visible."*

Pre-filling the trigger with the current price removes a friction
point — users typically want to place a limit near the current market price,
so starting there is the sensible default. The original implementation used
`snap.priceCents` from React state in `useEffect([ticker])`, but that value
is stale on the first render after a ticker switch. The fix calls
`priceEngine.getSnapshot(ticker).priceCents` synchronously to get the live
price regardless of React's render cycle.

---

## #11 — Persistence Bug Fix

> *"On refreshing, holding data and limit orders are disappearing. It should
> persist."*

`localStorage` was being written but not fully read back on load.
`loadState()` in the reducer was updated to restore `holdings`, `trades`, and
`limitOrders` correctly. A `beforeunload` handler was also added using a
`stateRef` to guarantee a final save even when the tab is closed before
React's `useEffect` completes.

---

## #12 — 4 Decimal Place Input Limit

> *"User should not be allowed to enter more than 4 decimal places while buying."*

Fractional crypto quantities beyond 4 decimal places are not
meaningful in this context and can cause subtle precision issues. The
`onChange` handler was updated to check `val.length - dotIndex - 1 > 4`
and silently reject input that exceeds the limit, keeping quantityStr always
in a valid format.

---

## #13 — Real-Time Holding P&L Fix

> *"Holding value is not updating in real time. Fix the issue."*

`Portfolio` was reading price data from React context (trading state),
which only updates on trade actions — not on price ticks. The fix switched
`Portfolio` to call `useAllTickers()`, which subscribes to the `'*'` wildcard
and updates on every tick. `HoldingRow` was made a `memo`'d component receiving
`currentPriceCents` as a prop so only rows whose price changed re-render.

---

## #14 — Max Buy Quantity Hint

> *"Next to quantity, show the maximum quantity that can be brought with
> holding cash. Place it to the right side and make the font size same as
> Quantity."*

Displaying `Math.floor(balanceCents / priceCents × 10000) / 10000`
gives the user immediate feedback on their purchasing power without requiring
them to do mental arithmetic. Using `Math.floor` (not `Math.round`) is
important — rounding up would suggest a quantity that would actually exceed
the balance. Wrapping the label text in `<span>` was required to fix a flex
layout issue where bare text nodes consumed all available space.

---

## #15 — Limit Order Form State Bug Fix

> *"Once limit buy or sell is placed, trigger price is setting as 0. Place
> Limit Buy button is disabled."*

After order submission the trigger input was being cleared to `''`,
which parsed to `0`, failing the `triggerPriceCents > 0` form validation and
disabling the submit button. The fix resets the trigger to the current live
price after each limit order submission, keeping the form immediately valid
and ready for the next order.

---

## #16 — Double Limit Order Execution Bug

> *"I have set 2 limit orders of selling — same quantity at different sell
> price. On execution of first limit order, there is no quantity left to be
> sold, but the second limit order too gets executed. When there is no
> holding, still existing limit order is not getting auto-cancelled."*

The price engine notifies all `'*'` subscribers synchronously within
a single tick. Both limit order callbacks fired before the reducer had
processed the first execution, so both saw the original (non-zero) holdings.
The fix introduced **virtual accounting** per tick: `virtualSoldQty[symbol]`
accumulates quantity reserved by earlier dispatch calls within the same tick,
preventing the second order from seeing available quantity that was already
committed. Post-execution, `revalidatePendingOrders()` was added to the
reducer to auto-cancel any orders that can no longer be filled.

---

## #17 — Max Sell Quantity Hint

> *"Just like buy has max quantity option, add similar option to sell too.
> Keep the pre-filled value as zero."*

Symmetry with the buy side — sellers also benefit from seeing their
maximum available quantity at a glance. Pre-filling to zero (rather than
auto-filling the input) keeps the user in control; the hint is clickable to
fill max. A ternary chain replaced two separate `&&` conditionals to ensure
only one hint renders at a time.

---

## #18 — Auto-Cancel Buy Limits When Cash Runs Out

> *"Similarly when buy limit is set, once user runs out of cash, standing buy
> limit should get auto-cancelled."*

Mirror of the sell-side auto-cancel behaviour. Extended
`revalidatePendingOrders()` with buy-side logic using `virtualSpentCents` to
accumulate the cost of earlier pending buy orders in list order. Any pending
buy whose `triggerPriceCents × quantity` exceeds the remaining virtual balance
is cancelled immediately.

---

## #19 — Revalidation Architecture Correction

> *"User should be able to set multiple limit buy/sell but once a buy is
> executed, remaining buys have to be revalidated if cash available to buy
> more. Similarly, once a sell is executed, remaining sells have to be
> revalidated if quantity available in holding to sell off."*

The original implementation added proactive orphan-cancel polling in
the `setInterval` scanner every 500 ms. This was architecturally incorrect —
it meant orders could be silently cancelled even when no trade had occurred.
The correct design is to revalidate **only after a state-changing action**.
`revalidatePendingOrders()` was moved into the reducer and called after
`EXECUTE_LIMIT_ORDER`, `BUY_MARKET`, and `SELL_MARKET` — exactly the three
points where balance or holdings can decrease.

---

## #20 — Per-Symbol Sell Validation

> *"While selling, check for available quantity against each ticker type like
> BTC should be checked if BTC does exist, else auto cancel. BTC should not
> check against ETH or anything else."*

The virtual accounting in `revalidatePendingOrders` was using a
shared quantity pool across all symbols, meaning a BTC sell order could
inadvertently affect ETH validation. The fix keys `virtualSoldQty` by symbol:
`virtualSoldQty[order.symbol]`, so each symbol's pending sell orders are
validated only against that symbol's holdings. ETH and BTC are completely
independent.

---

## #21 — Stale Price Data on Ticker Switch

> *"SOL is operating in range of $100–200 but trigger price is being set to
> $3,450 automatically — that is close to ETH's value. There might be a
> mix-match of SOL and ETH data. Re-verify and fix."*

`useEffect([ticker])` read `snap.priceCents` from React state.
This value is asynchronous — React's `useEffect` runs *after* paint, and at
that point `useTicker`'s own subscription for the new ticker had not yet
updated `snap`. The result was that the previous ticker's price (ETH at ~$3,450)
was used to pre-fill SOL's trigger. The fix calls
`priceEngine.getSnapshot(ticker).priceCents` synchronously — the engine always
has the correct live price for the new ticker, regardless of React's render
timing.

---

## #22 — Unit Tests for Order Execution Logic

> *"Add unit tests. Required for the 'Order Execution' logic e.g., ensuring
> a user cannot buy more than their balance allows and all other constraints."*

`tradingReducer` is a pure function, making it ideal for unit testing
without any React mount overhead. Tests were written with Jest directly against
the reducer to verify all invariants: balance guards, holdings guards,
weighted average cost, trade recording, limit order lifecycle (pending →
executed / cancelled), auto-cancellation, and per-symbol isolation. `@types/jest`
was installed to provide TypeScript definitions for `describe`/`it`/`expect`,
and `jest.config.js` was updated to transform `.js` files so the setup file
could run correctly. All 26 tests pass.
