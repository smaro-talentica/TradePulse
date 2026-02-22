/**
 * chartHelpers.ts — Pure coordinate-mapping helpers for the SVG price chart.
 *
 * All logic for converting a price-history array into SVG geometry lives here,
 * outside any React component, so it is easy to unit-test and reuse.
 *
 * Coordinate system
 * ─────────────────
 *  SVG viewBox: 0 0 <width> <height>
 *
 *  Usable chart area after padding:
 *    chartW = width  - padLeft - padRight
 *    chartH = height - padTop  - padBottom
 *
 *  For the i-th price in an array of length N:
 *    x = padLeft + (i / (N - 1)) * chartW          (0 → left edge, N-1 → right edge)
 *    y = padTop  + (1 - normalized) * chartH        (1 = top = high price, 0 = low price)
 *    where normalized = (price - yMin) / yRange
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface YLabel {
  /** SVG y-coordinate of this grid line */
  y: number;
  /** Formatted price label (e.g. "$67,124") */
  label: string;
}

export interface ChartCoords {
  /** SVG `points` attribute for the price polyline */
  polylinePoints: string;
  /** SVG `points` for the closed gradient-fill polygon (polyline + baseline) */
  fillPolygonPoints: string;
  /** Y-axis grid labels */
  yLabels: YLabel[];
  /** true if last price ≥ first price (determines green vs red theme) */
  isUp: boolean;
  /** SVG x of the latest (rightmost) data point */
  currentX: number;
  /** SVG y of the latest (rightmost) data point */
  currentY: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compact price label — shows whole dollars only (no cents) for axis clutter reduction.
 * e.g. 6_712_400 cents → "$67,124"
 */
function axisLabel(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Convert a price-history array (integer cents) into all SVG geometry needed
 * to render the chart.
 *
 * @param history - ordered array of prices in integer cents (oldest → newest)
 * @param width   - full SVG viewBox width
 * @param height  - full SVG viewBox height
 * @param pad     - padding around the usable chart area
 * @param gridLines - number of horizontal grid lines / y-axis labels (default 5)
 */
export function buildChartCoords(
  history: readonly number[],
  width: number,
  height: number,
  pad: ChartPadding,
  gridLines = 5,
): ChartCoords {
  const N = history.length;

  // ── Usable area ────────────────────────────────────────────────────────
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // ── Y-axis range with 5 % padding so the line never touches the edges ──
  const rawMin = Math.min(...history);
  const rawMax = Math.max(...history);
  const rawRange = rawMax - rawMin || 1; // avoid division by zero on flat history
  const yPad = rawRange * 0.05;
  const yMin = rawMin - yPad;
  const yMax = rawMax + yPad;
  const yRange = yMax - yMin;

  // ── Map each price to an (x, y) pair ──────────────────────────────────
  const points: Array<[number, number]> = history.map((price, i) => {
    const x = pad.left + (N === 1 ? chartW / 2 : (i / (N - 1)) * chartW);
    const y = pad.top + (1 - (price - yMin) / yRange) * chartH;
    return [x, y];
  });

  const polylinePoints = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Close the polygon at the bottom-right and bottom-left corners for the fill area
  const baselineY = pad.top + chartH;
  const fillPolygonPoints =
    polylinePoints +
    ` ${points[N - 1][0].toFixed(1)},${baselineY.toFixed(1)}` +
    ` ${points[0][0].toFixed(1)},${baselineY.toFixed(1)}`;

  // ── Y-axis grid labels ─────────────────────────────────────────────────
  const yLabels: YLabel[] = Array.from({ length: gridLines }, (_, i) => {
    // Distribute evenly from top (high price) to bottom (low price)
    const frac = i / (gridLines - 1);
    const priceCents = yMax - frac * yRange;
    const y = pad.top + frac * chartH;
    return { y: parseFloat(y.toFixed(1)), label: axisLabel(priceCents) };
  });

  // ── Trend direction ────────────────────────────────────────────────────
  const isUp = history[N - 1] >= history[0];

  const [currentX, currentY] = points[N - 1];

  return {
    polylinePoints,
    fillPolygonPoints,
    yLabels,
    isUp,
    currentX: parseFloat(currentX.toFixed(1)),
    currentY: parseFloat(currentY.toFixed(1)),
  };
}
