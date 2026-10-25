import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import { classifyCandle, type CandleSettings } from '../candles.js';
import { findPivots } from './pivots.js';
import type { PatternMatch, PatternSettings } from './types.js';
import { argMaxHigh, argMinLow, hline, point, targetReached, tradingDays, windowStart } from './util.js';

/**
 * Cup and handle (bullish). Neckline = left-rim high. Right rim within rimTolAtr × ATR of it; cup depth
 * ≥ cupMinDepthAtr × ATR and width ≥ cupMinWidth. Handle low stays above the cup bottom and in the
 * upper part of the cup, handle ≤ handleMaxFraction of the cup width.
 * Trigger = first boom boom after the handle low that closes above the neckline or launches from the
 * handle. Target = neckline (trigger closed below it, or still armed) or neckline + depth (closed above).
 */
export function detectCupAndHandle(candles: Candle[], s: PatternSettings, cs: CandleSettings): PatternMatch | null {
  const ranges = atr(candles, s.atrPeriod);
  const start = windowStart(candles, s.lookback);
  const highs = findPivots(candles, s.pivotN).highs.filter((p) => p.index >= start);
  const last = candles.length - 1;

  for (let r = highs.length - 1; r >= 1; r--) {
    const right = highs[r]!;
    const range = ranges[right.index];
    if (range == null) continue;

    for (let l = r - 1; l >= 0; l--) {
      const left = highs[l]!;
      const neckline = left.price;
      const width = right.index - left.index;
      if (width < s.cupMinWidth) continue;
      if (Math.abs(right.price - neckline) > s.rimTolAtr * range) continue;
      const bottomIndex = argMinLow(candles, left.index + 1, right.index - 1);
      const bottom = candles[bottomIndex]!.low;
      // Each rim is the highest high on its side of the cup bottom.
      if (candles[argMaxHigh(candles, left.index + 1, bottomIndex)]!.high > neckline) continue;
      if (candles[argMaxHigh(candles, bottomIndex, right.index - 1)]!.high > right.price) continue;
      const depth = neckline - bottom;
      if (depth < s.cupMinDepthAtr * range) continue;

      const handleFloor = bottom + s.handleMinDepthFraction * depth;
      const maxHandle = Math.floor(width * s.handleMaxFraction);
      let handleLowIndex = -1;
      let handleHigh = -Infinity;
      let triggerIndex: number | null = null;
      let valid = true;
      for (let k = right.index + 1; k <= last; k++) {
        if (k - right.index > maxHandle) {
          valid = false;
          break;
        }
        const c = candles[k]!;
        if (handleLowIndex >= 0 && classifyCandle(candles, k, cs).names.includes('boom_boom')) {
          const handleLow = candles[handleLowIndex]!.low;
          const fromHandle = c.close <= neckline && c.low >= handleLow && c.low <= handleHigh;
          if (c.close > neckline || fromHandle) {
            triggerIndex = k;
            break;
          }
        }
        // A non-trigger candle closing above the neckline is a missed breakout; one in the lower cup kills it.
        if (c.close > neckline || c.low <= handleFloor) {
          valid = false;
          break;
        }
        handleHigh = Math.max(handleHigh, c.high);
        if (handleLowIndex < 0 || c.low < candles[handleLowIndex]!.low) handleLowIndex = k;
      }
      if (!valid || handleLowIndex < 0) continue;
      if (tradingDays(candles, left.index, handleLowIndex) > s.maxSpanDays) continue;
      if (triggerIndex != null && triggerIndex < candles.length - s.recentTriggerBars) continue;

      const breakout = triggerIndex != null && candles[triggerIndex]!.close > neckline;
      const target = breakout ? neckline + depth : neckline;
      if (targetReached(candles, triggerIndex ?? handleLowIndex + 1, target, 'bullish')) continue;
      const handleLow = candles[handleLowIndex]!.low;

      return {
        type: 'cup_and_handle',
        direction: 'bullish',
        state: triggerIndex == null ? 'armed' : 'triggered',
        points: [
          point(candles, 'left_rim', left.index, neckline),
          point(candles, 'cup_bottom', bottomIndex, bottom),
          point(candles, 'right_rim', right.index, right.price),
          point(candles, 'handle_low', handleLowIndex, handleLow),
        ],
        lines: [hline(candles, 'neckline', left.index, neckline), hline(candles, 'target', right.index, target)],
        triggerLevel: neckline,
        triggerIndex,
        triggerTime: triggerIndex == null ? null : candles[triggerIndex]!.time,
        target,
        invalidation: handleLow,
        startIndex: left.index,
        endIndex: triggerIndex ?? handleLowIndex,
      };
    }
  }
  return null;
}
