import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import { classifyCandle, type CandleSettings } from '../candles.js';
import { findPivots } from './pivots.js';
import type { PatternMatch, PatternSettings } from './types.js';
import { argMaxHigh, argMinLow, flipCandles, hline, point, targetReached, tradingDays, unflipMatch, windowStart } from './util.js';

/**
 * Inverse head and shoulders (bullish): three consecutive swing lows, the middle one lowest, shoulders
 * within shoulderTolAtr × ATR, head ≥ headMinAtr × ATR below the lower shoulder. Neckline runs through
 * the highest highs between the dips. Trigger = first bullish-labeled candle after the right shoulder
 * that closes above the right-shoulder low and below the neckline. Target = top of the pattern = the
 * higher of the two peaks.
 */
export function detectInverseHeadShoulders(candles: Candle[], s: PatternSettings, cs: CandleSettings): PatternMatch | null {
  const m = ihsCore(candles, s, (k) => classifyCandle(candles, k, cs).bias === 'bullish');
  return m ? { ...m, type: 'inverse_head_and_shoulders', direction: 'bullish' } : null;
}

/**
 * Head and shoulders top (bearish; not from the class method): the mirror — three consecutive swing highs, the
 * middle one highest, shoulders within shoulderTolAtr × ATR, head ≥ headMinAtr × ATR above the higher shoulder,
 * neckline through the two dips. Trigger = first BEARISH-labeled candle (judged on the real candles) after the
 * right shoulder that closes below the right-shoulder high and above the neckline. Target = the lower of the two
 * dips. Invalid on a close above the right-shoulder high.
 */
export function detectHeadAndShoulders(candles: Candle[], s: PatternSettings, cs: CandleSettings): PatternMatch | null {
  const m = ihsCore(flipCandles(candles), s, (k) => classifyCandle(candles, k, cs).bias === 'bearish');
  return m
    ? unflipMatch({ ...m, type: 'inverse_head_and_shoulders', direction: 'bullish' }, 'head_and_shoulders', 'bearish', { peak_1: 'dip_1', peak_2: 'dip_2' })
    : null;
}

function ihsCore(candles: Candle[], s: PatternSettings, isTrigger: (k: number) => boolean): Omit<PatternMatch, 'type' | 'direction'> | null {
  const ranges = atr(candles, s.atrPeriod);
  const start = windowStart(candles, s.lookback);
  const lows = findPivots(candles, s.pivotN).lows.filter((p) => p.index >= start);
  const last = candles.length - 1;

  for (let j = lows.length - 1; j >= 2; j--) {
    const [ls, head, rs] = [lows[j - 2]!, lows[j - 1]!, lows[j]!];
    const range = ranges[rs.index];
    if (range == null) continue;
    if (tradingDays(candles, ls.index, rs.index) > s.maxSpanDays) continue;
    if (candles[argMinLow(candles, ls.index, rs.index)]!.low < head.price) continue;
    if (!(head.price < ls.price && head.price < rs.price)) continue;
    if (Math.abs(ls.price - rs.price) > s.shoulderTolAtr * range) continue;
    if (Math.min(ls.price, rs.price) - head.price < s.headMinAtr * range) continue;

    const p1 = argMaxHigh(candles, ls.index + 1, head.index - 1);
    const p2 = argMaxHigh(candles, head.index + 1, rs.index - 1);
    const p1Price = candles[p1]!.high;
    const p2Price = candles[p2]!.high;
    const slope = (p2Price - p1Price) / (p2 - p1);
    const necklineAt = (i: number) => p1Price + slope * (i - p1);
    const target = Math.max(p1Price, p2Price);

    let triggerIndex: number | null = null;
    let valid = true;
    for (let k = rs.index + 1; k <= last; k++) {
      const c = candles[k]!;
      if (c.close < rs.price || c.close >= necklineAt(k)) {
        valid = false; // broke the right shoulder, or ran above the neckline without an entry
        break;
      }
      if (isTrigger(k)) {
        triggerIndex = k;
        break;
      }
    }
    if (!valid) continue;
    if (triggerIndex != null && triggerIndex < candles.length - s.recentTriggerBars) continue;
    if (targetReached(candles, rs.index + 1, target, 'bullish')) continue;

    return {
      state: triggerIndex == null ? 'armed' : 'triggered',
      points: [
        point(candles, 'left_shoulder', ls.index, ls.price),
        point(candles, 'peak_1', p1, p1Price),
        point(candles, 'head', head.index, head.price),
        point(candles, 'peak_2', p2, p2Price),
        point(candles, 'right_shoulder', rs.index, rs.price),
      ],
      lines: [
        {
          label: 'neckline',
          from: { time: candles[p1]!.time, price: p1Price },
          to: { time: candles[last]!.time, price: necklineAt(last) },
        },
        hline(candles, 'target', p1, target),
      ],
      triggerLevel: rs.price,
      triggerIndex,
      triggerTime: triggerIndex == null ? null : candles[triggerIndex]!.time,
      target,
      invalidation: rs.price,
      startIndex: ls.index,
      endIndex: triggerIndex ?? rs.index,
    };
  }
  return null;
}
