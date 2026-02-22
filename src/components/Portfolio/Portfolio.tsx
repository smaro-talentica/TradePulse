/**
 * Portfolio.tsx — Right-panel: holdings, live P/L, pending limit orders,
 * and chronological trade history.
 *
 * Uses useTicker per holding so each P/L value updates independently.
 */
import { memo, type Dispatch } from 'react';
import { useTradingContext } from '../../context/useTradingContext';
import { useAllTickers } from '../../hooks/usePriceEngine';
import { formatUsd, formatPct, multiplyCents, pctChange } from '../../utils/math';
import type { Holding, LimitOrder, Trade, TradingAction } from '../../types/trading';
import styles from './Portfolio.module.css';

// ── Sub-components ─────────────────────────────────────────────────────────

/** Renders one holding row with a live market value + unrealised P/L.
 * currentPriceCents is passed from the parent which calls useAllTickers(),
 * guaranteeing this row re-renders on every price tick.
 */
const HoldingRow = memo(function HoldingRow({
  holding,
  currentPriceCents,
}: {
  holding: Holding;
  currentPriceCents: number;
}) {
  const marketValueCents = multiplyCents(currentPriceCents, holding.quantity);
  const costBasisCents   = multiplyCents(holding.avgCostCents, holding.quantity);
  const unrealisedPnl    = marketValueCents - costBasisCents;
  const unrealisedPct    = pctChange(costBasisCents, marketValueCents);
  const isUp             = unrealisedPnl >= 0;

  return (
    <div className={styles.holdingRow}>
      <div>
        <div className={styles.holdingRow__symbol}>{holding.symbol}</div>
        <div className={styles.holdingRow__detail}>
          {holding.quantity.toFixed(4)} @ {formatUsd(holding.avgCostCents)}
        </div>
      </div>
      <div className={styles.holdingRow__right}>
        <div className={styles.holdingRow__value}>{formatUsd(marketValueCents)}</div>
        <div className={`${styles.holdingRow__pnl} ${isUp ? styles['holdingRow__pnl--up'] : styles['holdingRow__pnl--down']}`}>
          {isUp ? '+' : ''}{formatUsd(unrealisedPnl)} ({formatPct(unrealisedPct)})
        </div>
      </div>
    </div>
  );
});

/** Renders one pending limit order with a cancel button. */
function OrderRow({
  order,
  onCancel,
}: {
  order: LimitOrder;
  onCancel: () => void;
}) {
  return (
    <div className={styles.orderRow}>
      <span className={`${styles.orderRow__badge} ${styles[`orderRow__badge--${order.side}`]}`}>
        {order.side.toUpperCase()}
      </span>
      <span className={styles.orderRow__info}>
        {order.quantity.toFixed(4)} {order.symbol} @ {formatUsd(order.triggerPriceCents)}
      </span>
      <button className={styles.cancelBtn} onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  );
}

/** One trade history row. */
function TradeHistoryRow({ trade }: { trade: Trade }) {
  const time = new Date(trade.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div className={styles.tradeRow}>
      <span className={`${styles[`tradeRow__side--${trade.side}`]}`}>
        {trade.side.toUpperCase()} {trade.symbol}
      </span>
      <span className={styles.tradeRow__total}>{formatUsd(trade.totalCents)}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{time}</span>
    </div>
  );
}

// ── TotalValueWatcher — computes live total portfolio value ────────────────
// We need live prices for each holding without calling hooks in loops,
// so we gather all symbols and subscribe once per symbol via useAllTickers.

function PortfolioSummary({
  balanceCents,
  holdings,
  snapshots,
}: {
  balanceCents: number;
  holdings: Record<string, Holding>;
  snapshots: Record<string, { priceCents: number }>;
}) {

  const holdingsValueCents = Object.values(holdings).reduce((sum, h) => {
    const price = snapshots[h.symbol]?.priceCents ?? h.avgCostCents;
    return sum + multiplyCents(price, h.quantity);
  }, 0);

  const costBasisCents = Object.values(holdings).reduce(
    (sum, h) => sum + multiplyCents(h.avgCostCents, h.quantity),
    0,
  );

  const totalValueCents = balanceCents + holdingsValueCents;
  const totalPnl        = holdingsValueCents - costBasisCents;
  const isUp            = totalPnl >= 0;

  return (
    <div className={styles.summary}>
      <div className={styles.summaryCard}>
        <span className={styles.summaryCard__label}>Cash</span>
        <span className={styles.summaryCard__value}>{formatUsd(balanceCents)}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryCard__label}>Total Value</span>
        <span className={styles.summaryCard__value}>{formatUsd(totalValueCents)}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryCard__label}>Unrealised P/L</span>
        <span className={`${styles.summaryCard__value} ${styles[isUp ? 'summaryCard__value--up' : 'summaryCard__value--down']}`}>
          {isUp ? '+' : ''}{formatUsd(totalPnl)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function ResetButton({ dispatch }: { dispatch: Dispatch<TradingAction> }) {
  const handleReset = () => {
    if (window.confirm('Reset all trades, holdings, orders and balance back to $10,000?')) {
      dispatch({ type: 'RESET' });
    }
  };
  return (
    <button className={styles.resetBtn} onClick={handleReset} type="button">
      Reset Portfolio
    </button>
  );
}

export default function Portfolio() {
  const { state, dispatch } = useTradingContext();
  const { balanceCents, holdings, limitOrders, trades } = state;
  // useAllTickers() re-renders Portfolio every tick — same source as Summary cards.
  const snapshots = useAllTickers();

  const holdingsList  = Object.values(holdings);
  const pendingOrders = limitOrders.filter((o) => o.status === 'pending');

  return (
    <div className={styles.portfolio}>
      {/* Summary */}
      <PortfolioSummary balanceCents={balanceCents} holdings={holdings} snapshots={snapshots} />

      {/* Reset */}
      <ResetButton dispatch={dispatch} />

      {/* Holdings */}
      <div>
        <div className={styles.sectionTitle}>Holdings</div>
        {holdingsList.length === 0 ? (
          <p className={styles.empty}>No open positions.</p>
        ) : (
          holdingsList.map((h) => (
            <HoldingRow
              key={h.symbol}
              holding={h}
              currentPriceCents={snapshots[h.symbol]?.priceCents ?? h.avgCostCents}
            />
          ))
        )}
      </div>

      {/* Pending Limit Orders */}
      <div>
        <div className={styles.sectionTitle}>Limit Orders ({pendingOrders.length})</div>
        {pendingOrders.length === 0 ? (
          <p className={styles.empty}>No pending orders.</p>
        ) : (
          pendingOrders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              onCancel={() => dispatch({ type: 'CANCEL_LIMIT_ORDER', orderId: o.id })}
            />
          ))
        )}
      </div>

      {/* Trade History */}
      <div>
        <div className={styles.sectionTitle}>Trade History ({trades.length})</div>
        {trades.length === 0 ? (
          <p className={styles.empty}>No trades yet.</p>
        ) : (
          trades.map((t) => <TradeHistoryRow key={t.id} trade={t} />)
        )}
      </div>
    </div>
  );
}

