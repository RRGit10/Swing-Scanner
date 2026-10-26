import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import { classifyCandle, type CandleSettings } from '../candles.js';
import { findPivots } from './pivots.js';
import type { PatternMatch, PatternSettings } from './types.js';
import { argMaxHigh, argMinLow, flipCandles, hline, point, targetReached, tradingDays, unflipMatch, windowStart } from './util.js';

type CupCore = Omit<PatternMatch, 'type' | 'direction'>;

/**
 * Cup and handle shape on (possibly flipped) candles. Neckline = the line through the left-rim and right-rim highs
 * (rims within rimTolAtr × ATR, so it may tilt). Cup: depth below the neckline ≥ cupMinDepthAtr × ATR, width ≥
 * cupMinWidth, rounded (average low above the bottom ≤ cupMaxAvgHeight × depth). Handle: candles after the right
 * rim, low above the cup bottom and in the upper part of the cup, ≤ handleMaxFraction of the cup width.
 * Trigger = first `isBoom` candle after the handle low that closes above the neckline or launches from the handle
 * (low inside the handle range, close still at/below the neckline). Target = neckline when the trigger closed
 * below it (or while armed), neckline + depth when it closed above. Never a target already reached.
 */
function cupCore(candles: Candle[], s: PatternSettings, isBoom: (k: number) => boolean): CupCore | null {
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
      const width = right.index - left.index;
      if (width < s.cupMinWidth) continue;
      if (Math.abs(right.price - left.price) > s.rimTolAtr * range) continue;
      const slope = (right.price - left.price) / width;
      const neckAt = (k: number) => left.price + slope * (k - left.index);
      const bottomIndex = argMinLow(candles, left.index + 1, right.index - 1);
      const bottom = candles[bottomIndex]!.low;
      // Each rim is the highest high on its side of the cup bottom.
      if (candles[argMaxHigh(candles, left.index + 1, bottomIndex)]!.high > left.price) continue;
      if (candles[argMaxHigh(candles, bottomIndex, right.index - 1)]!.high > right.price) continue;
      const depth = neckAt(bottomIndex) - bottom;
      if (depth < s.cupMinDepthAtr * range) continue;
      // Rounded U, not a V: the cup spends most of its time near the bottom.
      let heightSum = 0;
      for (let k = left.index + 1; k < right.index; k++) heightSum += (candles[k]!.low - bottom) / depth;
      if (heightSum / (width - 1) > s.cupMaxAvgHeight) continue;

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
        if (handleLowIndex >= 0 && isBoom(k)) {
          const handleLow = candles[handleLowIndex]!.low;
          const fromHandle = c.close <= neckAt(k) && c.low >= handleLow && c.low <= handleHigh;
          if (c.close > neckAt(k) || fromHandle) {
            triggerIndex = k;
            break;
          }
        }
        // A non-trigger candle closing above the neckline is a missed breakout; one in the lower cup kills it.
        if (c.close > neckAt(k) || c.low <= handleFloor) {
          valid = false;
          break;
        }
        handleHigh = Math.max(handleHigh, c.high);
        if (handleLowIndex < 0 || c.low < candles[handleLowIndex]!.low) handleLowIndex = k;
      }
      if (!valid || handleLowIndex < 0) continue;
      if (tradingDays(candles, left.index, handleLowIndex) > s.maxSpanDays) continue;
      if (triggerIndex != null && triggerIndex < candles.length - s.recentTriggerBars) continue;

      const at = triggerIndex ?? last;
      const breakout = triggerIndex != null && candles[triggerIndex]!.close > neckAt(triggerIndex);
      const target = breakout ? neckAt(at) + depth : neckAt(at);
      if (targetReached(candles, triggerIndex ?? handleLowIndex + 1, target, 'bullish')) continue;
      const handleLow = candles[handleLowIndex]!.low;

      return {
        state: triggerIndex == null ? 'armed' : 'triggered',
        points: [
          point(candles, 'left_rim', left.index, left.price),
          point(candles, 'cup_bottom', bottomIndex, bottom),
          point(candles, 'right_rim', right.index, right.price),
          point(candles, 'handle_low', handleLowIndex, handleLow),
        ],
        lines: [
          { label: 'neckline', from: { time: left.time, price: left.price }, to: { time: candles[last]!.time, price: neckAt(last) } },
          hline(candles, 'target', right.index, target),
        ],
        triggerLevel: neckAt(at),
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

/** Cup and handle (bullish): the trigger is a boom boom candle. */
export function detectCupAndHandle(candles: Candle[], s: PatternSettings, cs: CandleSettings): PatternMatch | null {
  const m = cupCore(candles, s, (k) => classifyCandle(candles, k, cs).names.includes('boom_boom'));
  return m ? { ...m, type: 'cup_and_handle', direction: 'bullish' } : null;
}

/**
 * Inverted cup and handle (bearish; not from the class method): the exact mirror — a rounded dome on a neckline
 * through its two base lows, a handle drifting up or sideways in the lower part of the dome, and a RED boom boom
 * (judged on the real candles) after the handle high that closes below the neckline or launches from the handle
 * (high inside the handle range, close still at/above the neckline). Target = neckline if the trigger closed
 * above it, neckline − dome height if it closed below.
 */
export function detectInvertedCupAndHandle(candles: Candle[], s: PatternSettings, cs: CandleSettings): PatternMatch | null {
  const m = cupCore(flipCandles(candles), s, (k) => classifyCandle(candles, k, cs).names.includes('red_boom_boom'));
  return m
    ? unflipMatch({ ...m, type: 'cup_and_handle', direction: 'bullish' }, 'inverted_cup_and_handle', 'bearish', { cup_bottom: 'dome_top', handle_low: 'handle_high' })
    : null;
}
