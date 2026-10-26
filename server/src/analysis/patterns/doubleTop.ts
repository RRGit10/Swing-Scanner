import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import { findPivots } from './pivots.js';
import type { PatternMatch, PatternSettings } from './types.js';
import { argMaxHigh, argMinLow, flipCandles, hline, point, targetReached, tradingDays, unflipMatch, windowStart } from './util.js';

/**
 * Double top (bearish): two swing highs within peakTolAtr × ATR, with a dip at least dipDepthAtr × ATR
 * below the lower peak. Trigger = close below the dip. Target = dip − (average peak − dip).
 */
export function detectDoubleTop(candles: Candle[], s: PatternSettings): PatternMatch | null {
  const ranges = atr(candles, s.atrPeriod);
  const start = windowStart(candles, s.lookback);
  const highs = findPivots(candles, s.pivotN).highs.filter((p) => p.index >= start);
  const last = candles.length - 1;

  for (let b = highs.length - 1; b >= 1; b--) {
    const p2 = highs[b]!;
    const range = ranges[p2.index];
    if (range == null) continue;

    for (let a = b - 1; a >= 0; a--) {
      const p1 = highs[a]!;
      if (tradingDays(candles, p1.index, p2.index) > s.maxSpanDays) break; // older p1s only span more
      const lowerPeak = Math.min(p1.price, p2.price);
      const higherPeak = Math.max(p1.price, p2.price);
      if (higherPeak - lowerPeak > s.peakTolAtr * range) continue;
      const dipIndex = argMinLow(candles, p1.index + 1, p2.index - 1);
      const dip = candles[dipIndex]!.low;
      // Each peak is the highest high on its side of the dip.
      if (candles[argMaxHigh(candles, p1.index + 1, dipIndex)]!.high > p1.price) continue;
      if (candles[argMaxHigh(candles, dipIndex, p2.index - 1)]!.high > p2.price) continue;
      if (lowerPeak - dip < s.dipDepthAtr * range) continue;

      const target = dip - ((p1.price + p2.price) / 2 - dip);
      let triggerIndex: number | null = null;
      let invalid = false;
      for (let k = p2.index + 1; k <= last; k++) {
        const close = candles[k]!.close;
        if (close > higherPeak) {
          invalid = true;
          break;
        }
        if (close < dip) {
          triggerIndex = k;
          break;
        }
      }
      if (invalid) continue;
      if (triggerIndex != null && triggerIndex < candles.length - s.recentTriggerBars) continue;
      if (targetReached(candles, p2.index + 1, target, 'bearish')) continue;

      return {
        type: 'double_top',
        direction: 'bearish',
        state: triggerIndex == null ? 'armed' : 'triggered',
        points: [
          point(candles, 'peak_1', p1.index, p1.price),
          point(candles, 'dip', dipIndex, dip),
          point(candles, 'peak_2', p2.index, p2.price),
        ],
        lines: [
          { label: 'peaks', from: { time: p1.time, price: p1.price }, to: { time: p2.time, price: p2.price } },
          hline(candles, 'trigger', p1.index, dip),
          hline(candles, 'target', p2.index, target),
        ],
        triggerLevel: dip,
        triggerIndex,
        triggerTime: triggerIndex == null ? null : candles[triggerIndex]!.time,
        target,
        invalidation: higherPeak,
        startIndex: p1.index,
        endIndex: triggerIndex ?? p2.index,
      };
    }
  }
  return null;
}

/**
 * Double bottom (bullish; not from the class method) = double top on flipped prices: two lows within peakTolAtr,
 * a peak between them ≥ dipDepthAtr above the higher low. Trigger = close above that peak (the neckline).
 * Target = neckline + (neckline − average low). Invalid on a close below the lower low.
 */
export function detectDoubleBottom(candles: Candle[], s: PatternSettings): PatternMatch | null {
  const m = detectDoubleTop(flipCandles(candles), s);
  return m ? unflipMatch(m, 'double_bottom', 'bullish', { peak_1: 'bottom_1', dip: 'peak', peak_2: 'bottom_2' }) : null;
}
