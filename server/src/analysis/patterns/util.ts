import { etClock } from '../../providers/et.js';
import type { Candle } from '../../providers/types.js';
import type { Direction } from '../types.js';
import type { KeyPoint, PatternLine, PatternMatch, PatternType, PricePoint } from './types.js';

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

/** Prices negated (highs ↔ lows): a bullish detector run on these finds the bearish mirror. */
export function flipCandles(candles: Candle[]): Candle[] {
  return candles.map((c) => ({ ...c, open: -c.open, close: -c.close, high: -c.low, low: -c.high }));
}

/** Map a match found on flipped candles back to real prices, as `type`/`direction`, renaming key points. */
export function unflipMatch(m: PatternMatch, type: PatternType, direction: Direction, rename: Record<string, string> = {}): PatternMatch {
  const flip = <P extends PricePoint>(p: P): P => ({ ...p, price: -p.price });
  return {
    ...m,
    type,
    direction,
    points: m.points.map((p) => ({ ...flip(p), label: rename[p.label] ?? p.label })),
    lines: m.lines.map((l) => ({ ...l, from: flip(l.from), to: flip(l.to) })),
    triggerLevel: -m.triggerLevel,
    target: -m.target,
    invalidation: -m.invalidation,
  };
}

/**
 * Parallel channel over candles from..to: slope from a least-squares fit of the mid prices; `upper`/`lower`
 * offsets put the lines on the highest high and lowest low (price = slope × index + offset).
 */
export function fitChannel(candles: Candle[], from: number, to: number): { slope: number; upper: number; lower: number } {
  const idx = Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const mid = (i: number) => (candles[i]!.high + candles[i]!.low) / 2;
  let slope = 0;
  if (idx.length > 1) {
    const mx = idx.reduce((a, i) => a + i, 0) / idx.length;
    const my = idx.reduce((a, i) => a + mid(i), 0) / idx.length;
    slope = idx.reduce((a, i) => a + (i - mx) * (mid(i) - my), 0) / idx.reduce((a, i) => a + (i - mx) ** 2, 0);
  }
  return {
    slope,
    upper: Math.max(...idx.map((i) => candles[i]!.high - slope * i)),
    lower: Math.min(...idx.map((i) => candles[i]!.low - slope * i)),
  };
}
