/**
 * TradePanel.tsx — Market + Limit order entry form.
 *
 * State is kept locally (form values, feedback messages).
 * All mutations go through dispatch() → tradingReducer.
 */
import { useState, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { useTicker } from '../../hooks/usePriceEngine';
import { priceEngine } from '../../engine/priceEngine';
import { useTradingContext } from '../../context/useTradingContext';
import { formatUsd, multiplyCents } from '../../utils/math';
import styles from './TradePanel.module.css';

interface TradePanelProps {
  ticker: string;
}

type Feedback = { kind: 'success' | 'error'; message: string } | null;
type OrderType = 'market' | 'limit';
type Side = 'buy' | 'sell';

export default function TradePanel({ ticker }: TradePanelProps) {
  const snap = useTicker(ticker);
  const { state, dispatch } = useTradingContext();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [side, setSide] = useState<Side>('buy');
  const [quantityStr, setQuantityStr] = useState('');
  const [triggerStr, setTriggerStr] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const quantity = parseFloat(quantityStr) || 0;
  const triggerDollars = parseFloat(triggerStr) || 0;
  const triggerPriceCents = Math.round(triggerDollars * 100);

  const executionPriceCents =
    orderType === 'market' ? snap.priceCents : triggerPriceCents;

  const estimatedTotalCents = quantity > 0
    ? multiplyCents(executionPriceCents, quantity)
    : 0;

  const holding = state.holdings[ticker];
  const ownedQty = holding?.quantity ?? 0;
  const canSell  = ownedQty > 0;

  // Reset form when the selected ticker changes
  useEffect(() => {
    setQuantityStr('');
    setFeedback(null);
    setSide('buy');
    // Read the live price for the NEW ticker directly from the engine —
    // snap.priceCents is stale here (still the previous ticker's value).
    if (orderType === 'limit') {
      setTriggerStr((priceEngine.getSnapshot(ticker).priceCents / 100).toFixed(2));
    } else {
      setTriggerStr('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // If holdings drop to zero while on sell side, flip back to buy.
  useEffect(() => {
    if (side === 'sell' && !canSell) {
      setSide('buy');
      setQuantityStr('');
    }
  }, [canSell, side]);

  function showFeedback(kind: 'success' | 'error', message: string) {
    setFeedback({ kind, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      if (quantity <= 0) {
        showFeedback('error', 'Enter a valid quantity.');
        return;
      }

      if (orderType === 'limit' && triggerPriceCents <= 0) {
        showFeedback('error', 'Enter a valid trigger price.');
        return;
      }

      if (orderType === 'market') {
        if (side === 'buy') {
          if (estimatedTotalCents > state.balanceCents) {
            showFeedback('error', `Insufficient balance. Need ${formatUsd(estimatedTotalCents)}.`);
            return;
          }
          dispatch({ type: 'BUY_MARKET', symbol: ticker, quantity, priceCents: snap.priceCents });
          showFeedback('success', `Bought ${quantity} ${ticker} @ ${formatUsd(snap.priceCents)}`);
        } else {
          if (quantity > ownedQty) {
            showFeedback('error', `Insufficient holdings. You own ${ownedQty.toFixed(4)} ${ticker}.`);
            return;
          }
          dispatch({ type: 'SELL_MARKET', symbol: ticker, quantity, priceCents: snap.priceCents });
          showFeedback('success', `Sold ${quantity} ${ticker} @ ${formatUsd(snap.priceCents)}`);
        }
      } else {
        // Limit order
        if (side === 'buy') {
          const limitCost = multiplyCents(triggerPriceCents, quantity);
          if (limitCost > state.balanceCents) {
            showFeedback('error', `Insufficient balance. Need ${formatUsd(limitCost)}.`);
            return;
          }
        } else {
          if (quantity > ownedQty) {
            showFeedback('error', `Insufficient holdings. You own ${ownedQty.toFixed(4)} ${ticker}.`);
            return;
          }
        }
        dispatch({
          type: 'ADD_LIMIT_ORDER',
          order: {
            symbol: ticker,
            side,
            quantity,
            triggerPriceCents,
          },
        });
        showFeedback(
          'success',
          `Limit ${side} set: ${quantity} ${ticker} @ ${formatUsd(triggerPriceCents)}`,
        );
      }

      setQuantityStr('');
      // For limit orders, reset trigger to current price (not empty) so the
      // form stays valid and ready for the next order immediately.
      if (orderType === 'limit') {
        setTriggerStr((snap.priceCents / 100).toFixed(2));
      } else {
        setTriggerStr('');
      }
    },
    [
      quantity, orderType, triggerPriceCents, side,
      estimatedTotalCents, ownedQty, snap.priceCents,
      ticker, state.balanceCents, dispatch,
    ],
  );

  const isFormValid =
    quantity > 0 && (orderType === 'market' || triggerPriceCents > 0);

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate>
      {/* Ticker header */}
      <div className={styles.header}>
        <span className={styles.header__symbol}>{ticker}</span>
        <span className={styles.header__price}>{formatUsd(snap.priceCents)}</span>
      </div>

      {/* Order type tabs */}
      <div className={styles.tabs}>
        {(['market', 'limit'] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${orderType === t ? styles['tab--active'] : ''}`}
            onClick={() => {
              setOrderType(t);
              if (t === 'limit') {
                // Use getSnapshot for the current price — snap may lag by one render.
                setTriggerStr((priceEngine.getSnapshot(ticker).priceCents / 100).toFixed(2));
              }
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Buy / Sell toggle */}
      <div className={styles.sideToggle}>
        <button
          type="button"
          className={`${styles.sideBtn} ${styles['sideBtn--buy']} ${side === 'buy' ? styles['sideBtn--active'] : ''}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className={`${styles.sideBtn} ${styles['sideBtn--sell']} ${side === 'sell' ? styles['sideBtn--active'] : ''}`}
          onClick={() => {
            setSide('sell');
            setQuantityStr('');
          }}
          disabled={!canSell}
          title={!canSell ? `No ${ticker} holdings to sell` : undefined}
        >
          Sell
        </button>
      </div>

      {/* Quantity */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Quantity ({ticker})</span>
          {side === 'buy' && snap.priceCents > 0 ? (
            <span
              className={styles.maxHint}
              onClick={() =>
                setQuantityStr(
                  (Math.floor((state.balanceCents / snap.priceCents) * 10000) / 10000).toFixed(4),
                )
              }
              title="Click to fill max"
            >
              Max: {(Math.floor((state.balanceCents / snap.priceCents) * 10000) / 10000).toFixed(4)}
            </span>
          ) : side === 'sell' && ownedQty > 0 ? (
            <span
              className={styles.maxHint}
              onClick={() => setQuantityStr(ownedQty.toFixed(4))}
              title="Click to fill max"
            >
              Max: {ownedQty.toFixed(4)}
            </span>
          ) : null}
        </label>
        <input
          className={styles.input}
          type="number"
          min="0"
          step="0.0001"
          placeholder="0.0000"
          value={quantityStr}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            // Block input with more than 4 decimal places
            const dotIndex = val.indexOf('.');
            if (dotIndex !== -1 && val.length - dotIndex - 1 > 4) return;
            setQuantityStr(val);
          }}
        />
      </div>

      {/* Trigger price (limit only) */}
      {orderType === 'limit' && (
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Trigger Price (USD)</label>
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={triggerStr}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTriggerStr(e.target.value)}
          />
        </div>
      )}

      {/* Estimated total */}
      {quantity > 0 && (
        <div className={styles.estimate}>
          <span>Estimated {orderType === 'market' ? 'Total' : 'Value'}:</span>
          <span className={styles.estimate__value}>{formatUsd(estimatedTotalCents)}</span>
        </div>
      )}

      {/* Balance / holdings info */}
      <div className={styles.info}>
        <div>Cash: <span>{formatUsd(state.balanceCents)}</span></div>
        {ownedQty > 0 && (
          <div>Holding: <span>{ownedQty.toFixed(4)} {ticker}</span></div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        className={`${styles.submitBtn} ${side === 'buy' ? styles['submitBtn--buy'] : styles['submitBtn--sell']}`}
        disabled={!isFormValid}
      >
        {orderType === 'market' ? `${side === 'buy' ? 'Buy' : 'Sell'} ${ticker}` : `Place Limit ${side === 'buy' ? 'Buy' : 'Sell'}`}
      </button>

      {/* Feedback */}
      {feedback && (
        <div className={`${styles.feedback} ${styles[`feedback--${feedback.kind}`]}`}>
          {feedback.message}
        </div>
      )}
    </form>
  );
}

