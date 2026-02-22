/**
 * TickerRow.tsx
 *
 * Renders a single watchlist row for one ticker.
 * Subscribes independently via useTicker() so ONLY this row re-renders
 * when its price changes — other rows are unaffected.
 */
import { memo } from 'react';
import { useTicker } from '../../hooks/usePriceEngine';
import { formatUsd, formatPct } from '../../utils/math';
import { TICKERS } from '../../constants/tickers';
import styles from './Watchlist.module.css';

interface TickerRowProps {
  symbol: string;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

const TickerRow = memo(function TickerRow({
  symbol,
  selected,
  onSelect,
  onRemove,
  canRemove,
}: TickerRowProps) {
  const snap = useTicker(symbol);
  const isUp = snap.changePct >= 0;
  const name = TICKERS[symbol]?.name ?? symbol;

  return (
    <div
      className={`${styles.row} ${selected ? styles['row--selected'] : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-selected={selected}
    >
      {/* Left: symbol + name */}
      <div className={styles.row__info}>
        <span className={styles.row__symbol}>{symbol}</span>
        <span className={styles.row__name}>{name}</span>
      </div>

      {/* Center: direction flash dot */}
      <span
        className={`${styles.row__dot} ${
          snap.direction === 'up'
            ? styles['row__dot--up']
            : snap.direction === 'down'
              ? styles['row__dot--down']
              : ''
        }`}
      />

      {/* Right: price + % change */}
      <div className={styles.row__prices}>
        <span className={styles.row__price}>{formatUsd(snap.priceCents)}</span>
        <span
          className={`${styles.row__change} ${
            isUp ? styles['row__change--up'] : styles['row__change--down']
          }`}
        >
          {formatPct(snap.changePct)}
        </span>
      </div>

      {/* Remove button */}
      {canRemove && (
        <button
          className={styles.row__remove}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol}`}
          title={`Remove ${symbol}`}
        >
          ✕
        </button>
      )}
    </div>
  );
});

export default TickerRow;
