import { etClock } from '../../providers/et.js';
import type { Candle } from '../../providers/types.js';
import type { Direction } from '../types.js';
import type { KeyPoint, PatternLine } from './types.js';

/** Index of the lowest low in candles[from..to] (inclusive); first one on ties. */
export function argMinLow(candles: Candle[], from: number, to: number): number {
  let best = from;
  for (let i = from + 1; i <= to; i++) if (candles[i]!.low < candles[best]!.low) best = i;
  return best;
}

/** Index of the highest high in candles[from..to] (inclusive); first one on ties. */
export function argMaxHigh(candles: Candle[], from: number, to: number): number {
  let best = from;
  for (let i = from + 1; i <= to; i++) if (candles[i]!.high > candles[best]!.high) best = i;
  return best;
}

/** Has price touched the target anywhere in candles[from..end]? */
export function targetReached(candles: Candle[], from: number, target: number, direction: Direction): boolean {
  for (let i = Math.max(0, from); i < candles.length; i++) {
    const c = candles[i]!;
    if (direction === 'bullish' ? c.high >= target : c.low <= target) return true;
  }
  return false;
}

export function point(candles: Candle[], label: string, index: number, price: number): KeyPoint {
  return { label, index, time: candles[index]!.time, price };
}

/** Horizontal line from candle `fromIndex` to the last candle. */
export function hline(candles: Candle[], label: string, fromIndex: number, price: number): PatternLine {
  return { label, from: { time: candles[fromIndex]!.time, price }, to: { time: candles.at(-1)!.time, price } };
}

/** Number of distinct ET trading dates covered by candles[from..to]. */
export function tradingDays(candles: Candle[], from: number, to: number): number {
  const dates = new Set<string>();
  for (let i = from; i <= to; i++) dates.add(etClock(candles[i]!.time).date);
  return dates.size;
}

/** First index searched for patterns. */
export function windowStart(candles: Candle[], lookback: number): number {
  return Math.max(0, candles.length - lookback);
}
