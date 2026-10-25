import type { Candle } from '../../providers/types.js';

export interface Pivot {
  index: number;
  time: number;
  price: number;
}

/**
 * Confirmed swing pivots. A swing high is higher than the N highs to its left and at least as high as
 * the N highs to its right (so a flat top yields only its first bar). Lows mirror. The last N candles
 * can't be pivots yet.
 */
export function findPivots(candles: Candle[], n = 3): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = n; i < candles.length - n; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= n; j++) {
      const left = candles[i - j]!;
      const right = candles[i + j]!;
      if (left.high >= c.high || right.high > c.high) isHigh = false;
      if (left.low <= c.low || right.low < c.low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, time: c.time, price: c.high });
    if (isLow) lows.push({ index: i, time: c.time, price: c.low });
  }
  return { highs, lows };
}
