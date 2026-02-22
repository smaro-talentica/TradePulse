/**
 * PriceChart.tsx — Native SVG price chart (no external charting libraries).
 *
 * How it works:
 *  1. useTicker(ticker) subscribes to price updates → 1 re-render per second.
 *  2. buildChartCoords() (in utils/chartHelpers.ts) maps the price-history
 *     array to SVG geometry:
 *       x = padLeft + (i / (N-1)) * chartW
 *       y = padTop  + (1 - normalizedPrice) * chartH
 *  3. The result is rendered as:
 *     • <polyline>    — the price line
 *     • <polygon>     — gradient fill area below the line
 *     • <line>        — horizontal grid lines
 *     • <text>        — y-axis price labels
 *     • <circle>      — current-price dot on the right edge
 *     • <line>        — dashed current-price guide line
 *
 *  Re-render scope: only PriceChart re-renders on tick (Watchlist rows
 *  re-render independently; Dashboard/Portfolio are untouched).
 */
import { memo } from 'react';
import { useTicker } from '../../hooks/usePriceEngine';
import { buildChartCoords } from '../../utils/chartHelpers';
import { formatUsd, formatPct } from '../../utils/math';
import styles from './PriceChart.module.css';

// ── Layout constants ───────────────────────────────────────────────────────
const VIEW_W = 800;
const VIEW_H = 300;
const PAD = { top: 24, right: 72, bottom: 28, left: 8 };

// ── Props ──────────────────────────────────────────────────────────────────
interface PriceChartProps {
  ticker: string;
}

// ── Component ──────────────────────────────────────────────────────────────
const PriceChart = memo(function PriceChart({ ticker }: PriceChartProps) {
  const snap = useTicker(ticker);
  const isUp = snap.changePct >= 0;

  const color = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
  const fillId = `chart-fill-${ticker}`;

  const coords = buildChartCoords(
    snap.history.length >= 2 ? snap.history : [...snap.history, snap.history[0]],
    VIEW_W,
    VIEW_H,
    PAD,
    5,
  );

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.header__symbol}>{ticker}</span>
        <span
          className={`${styles.header__price} ${
            isUp ? styles['header__price--up'] : styles['header__price--down']
          }`}
        >
          {formatUsd(snap.priceCents)}
        </span>
        <span
          className={`${styles.header__change} ${
            isUp ? styles['header__change--up'] : styles['header__change--down']
          }`}
        >
          {formatPct(snap.changePct)} (session)
        </span>
      </div>

      {/* ── SVG Chart ── */}
      <div className={styles.svgWrapper}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-label={`${ticker} price chart`}
        >
          {/* ── Gradient fill definition ── */}
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* ── Horizontal grid lines + Y-axis labels ── */}
          {coords.yLabels.map(({ y, label }) => (
            <g key={y}>
              <line
                x1={PAD.left}
                y1={y}
                x2={VIEW_W - PAD.right}
                y2={y}
                className={styles.gridLine}
              />
              <text
                x={VIEW_W - PAD.right + 6}
                y={y}
                className={styles.yLabel}
              >
                {label}
              </text>
            </g>
          ))}

          {/* ── Gradient fill area ── */}
          <polygon
            points={coords.fillPolygonPoints}
            fill={`url(#${fillId})`}
          />

          {/* ── Price line ── */}
          <polyline
            points={coords.polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* ── Current price dashed guide ── */}
          <line
            x1={PAD.left}
            y1={coords.currentY}
            x2={VIEW_W - PAD.right}
            y2={coords.currentY}
            stroke={color}
            strokeWidth="0.8"
            strokeDasharray="4 3"
            opacity="0.5"
          />

          {/* ── Current price dot ── */}
          <circle
            cx={coords.currentX}
            cy={coords.currentY}
            r={4}
            fill={color}
            className={styles.currentDot}
          />
        </svg>
      </div>
    </div>
  );
});

export default PriceChart;

