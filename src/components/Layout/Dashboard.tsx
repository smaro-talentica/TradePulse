import { useState } from 'react';
import Watchlist from '../Watchlist/Watchlist';
import PriceChart from '../Chart/PriceChart';
import TradePanel from '../Trade/TradePanel';
import Portfolio from '../Portfolio/Portfolio';
import { usePriceEngineLifecycle } from '../../hooks/usePriceEngineLifecycle';
import { useLimitOrderEngine } from '../../hooks/useLimitOrderEngine';
import { TradingProvider } from '../../context/TradingContext';
import styles from './Dashboard.module.css';

/** Invisible component: activates the limit order engine inside TradingProvider. */
function LimitOrderMonitor() {
  useLimitOrderEngine();
  return null;
}

function DashboardInner() {
  usePriceEngineLifecycle();
  const [selectedTicker, setSelectedTicker] = useState<string>('BTC');

  return (
    <>
      {/* Header */}
      <header className={styles['dashboard-header']}>
        <span className={styles['dashboard-header__logo']}>TradePulse</span>
        <span className={styles['dashboard-header__subtitle']}>
          Paper Trading Terminal
        </span>
      </header>

      {/* 3-Column Grid */}
      <main className={styles.dashboard}>
        {/* Left — Watchlist (25%) */}
        <section className={styles.panel}>
          <div className={styles.panel__header}>Watchlist</div>
          <div className={styles.panel__body}>
            <Watchlist
              selectedTicker={selectedTicker}
              onSelectTicker={setSelectedTicker}
            />
          </div>
        </section>

        {/* Center — Terminal (50%): Chart top, Trade form bottom */}
        <section className={styles.terminal}>
          <div className={styles.terminal__chart}>
            <PriceChart ticker={selectedTicker} />
          </div>
          <div className={styles.terminal__trade}>
            <TradePanel ticker={selectedTicker} />
          </div>
        </section>

        {/* Right — Portfolio (25%) */}
        <section className={styles.panel}>
          <div className={styles.panel__header}>Portfolio</div>
          <div className={styles.panel__body}>
            <Portfolio />
          </div>
        </section>
      </main>
    </>
  );
}

export default function Dashboard() {
  return (
    <TradingProvider>
      <LimitOrderMonitor />
      <DashboardInner />
    </TradingProvider>
  );
}
