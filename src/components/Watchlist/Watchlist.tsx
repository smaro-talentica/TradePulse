/**
 * Watchlist.tsx
 *
 * Left-panel sidebar.  Manages which tickers are on the watchlist
 * (persisted in localStorage), renders an isolated TickerRow per ticker,
 * and exposes Add / Remove controls.
 *
 * Re-render isolation:
 *   Watchlist itself only re-renders when the watchlist array changes
 *   (add / remove). Individual price updates are handled inside TickerRow.
 */
import { useState, useCallback } from 'react';
import TickerRow from './TickerRow';
import { TICKER_SYMBOLS } from '../../constants/tickers';
import styles from './Watchlist.module.css';

const STORAGE_KEY = 'tradepulse_watchlist';
const DEFAULT_WATCHLIST = ['BTC', 'ETH', 'SOL'];

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_WATCHLIST;
}

function saveWatchlist(list: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ── Props ──────────────────────────────────────────────────────────────────

interface WatchlistProps {
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Watchlist({ selectedTicker, onSelectTicker }: WatchlistProps) {
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [addValue, setAddValue] = useState<string>('');

  /** Tickers not yet on the watchlist, available to add */
  const available = TICKER_SYMBOLS.filter((s) => !watchlist.includes(s));

  const handleAdd = useCallback(() => {
    const sym = addValue || available[0];
    if (!sym || watchlist.includes(sym)) return;
    const next = [...watchlist, sym];
    setWatchlist(next);
    saveWatchlist(next);
    setAddValue('');
  }, [addValue, available, watchlist]);

  const handleRemove = useCallback(
    (sym: string) => {
      const next = watchlist.filter((s) => s !== sym);
      if (next.length === 0) return; // always keep at least one
      setWatchlist(next);
      saveWatchlist(next);
      // If the removed ticker was selected, switch to the first remaining
      if (sym === selectedTicker) onSelectTicker(next[0]);
    },
    [watchlist, selectedTicker, onSelectTicker],
  );

  return (
    <div className={styles.watchlist}>
      {/* Add ticker bar */}
      <div className={styles.addBar}>
        <select
          className={styles.addBar__select}
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          disabled={available.length === 0}
        >
          {available.length === 0 ? (
            <option value="">All added</option>
          ) : (
            <>
              <option value="">Add ticker…</option>
              {available.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          className={styles.addBar__btn}
          onClick={handleAdd}
          disabled={available.length === 0}
        >
          + Add
        </button>
      </div>

      {/* Ticker rows */}
      {watchlist.map((sym) => (
        <TickerRow
          key={sym}
          symbol={sym}
          selected={sym === selectedTicker}
          onSelect={() => onSelectTicker(sym)}
          onRemove={() => handleRemove(sym)}
          canRemove={watchlist.length > 1}
        />
      ))}
    </div>
  );
}


