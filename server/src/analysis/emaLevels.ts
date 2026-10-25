import type { Candle, Timeframe } from '../providers/types.js';
import { EMA_PERIODS, latestEmas, type EmaPeriod, type EmaValues } from './ema.js';
import type { Direction } from './types.js';

export interface EmaLevel {
  period: EmaPeriod;
  value: number;
}

/** Per CLAUDE.md the 13, 48 and 200 are support/resistance; the 55 is the reversal line. */
const SR_PERIODS = [13, 48, 200] as const;
const TABLE_TIMEFRAMES: Timeframe[] = ['15m', '30m', '1h', '1d'];
export const DEFAULT_EMA55_TOLERANCE = 0.002;

/** Nearest 13/48/200 EMA at or below price (support) and above price (resistance). */
export function nearestLevels(
  price: number,
  latest: EmaValues,
): { support: EmaLevel | null; resistance: EmaLevel | null } {
  let support: EmaLevel | null = null;
  let resistance: EmaLevel | null = null;
  for (const period of SR_PERIODS) {
    const value = latest[period];
    if (value == null) continue;
    if (value <= price) {
      if (!support || value > support.value) support = { period, value };
    } else if (!resistance || value < resistance.value) {
      resistance = { period, value };
    }
  }
  return { support, resistance };
}

/**
 * 55 EMA reversals in the pattern's direction. Bullish: candle i reaches the line (high within
 * `tolerance` of it or above) and its low comes within `tolerance` of it or pierces below; then
 * candle i+1 closes above the 55 EMA. A candle entirely below the line followed by a cross is not
 * a reversal. Bearish mirrors. Returns the indices of the confirming (i+1) candles.
 */
export function ema55Reversals(
  candles: Candle[],
  ema55: (number | null)[],
  direction: Direction,
  tolerance = DEFAULT_EMA55_TOLERANCE,
): number[] {
  const hits: number[] = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const touchEma = ema55[i];
    const nextEma = ema55[i + 1];
    if (touchEma == null || nextEma == null) continue;
    const touch = candles[i]!;
    const next = candles[i + 1]!;
    const reachesLine = touch.high >= touchEma * (1 - tolerance) && touch.low <= touchEma * (1 + tolerance);
    const reversed = reachesLine && (direction === 'bullish' ? next.close > nextEma : next.close < nextEma);
    if (reversed) hits.push(i + 1);
  }
  return hits;
}

/** Daily EMAs (any of the 4) strictly between entry and target, nearest to entry first. */
export function dailyEmasInPath(daily: EmaValues, entry: number, target: number, direction: Direction): EmaLevel[] {
  const [lo, hi] = direction === 'bullish' ? [entry, target] : [target, entry];
  return EMA_PERIODS.flatMap((period) => {
    const value = daily[period];
    return value != null && value > lo && value < hi ? [{ period, value }] : [];
  }).sort((a, b) => Math.abs(a.value - entry) - Math.abs(b.value - entry));
}

export interface EmaTableRow {
  timeframe: Timeframe;
  bars: number;
  price: number;
  ema: EmaValues;
  support: EmaLevel | null;
  resistance: EmaLevel | null;
}

/** Multi-time-frame EMA table. Price defaults to each frame's last close; pass a live quote to override. */
export function emaTable(candlesByTf: Partial<Record<Timeframe, Candle[]>>, livePrice?: number): EmaTableRow[] {
  return TABLE_TIMEFRAMES.flatMap((timeframe) => {
    const candles = candlesByTf[timeframe];
    if (!candles?.length) return [];
    const latest = latestEmas(candles);
    const price = livePrice ?? candles.at(-1)!.close;
    return [{ timeframe, bars: candles.length, price, ema: latest, ...nearestLevels(price, latest) }];
  });
}
