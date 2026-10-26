import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import type { PatternMatch, PatternSettings } from './types.js';
import { argMaxHigh, argMinLow, fitChannel, flipCandles, hline, point, targetReached, tradingDays, unflipMatch, windowStart } from './util.js';

/**
 * Bull flag: a pole rising ≥ poleMinAtr × ATR within poleMaxBars candles, then a flag of flagMinBars up to
 * min(flagMaxBars, flagPoleMultiple × pole candles) candles that stays under the pole top, retraces ≤
 * flagMaxRetrace of the pole, and forms a tight parallel channel sloping down or flat (slope ≤ flagMaxSlopeAtr ×
 * ATR per candle, height ≤ flagMaxHeightFraction × pole). Trigger = close above the flag high.
 * Target = flag high + pole height.
 */
export function detectBullFlag(candles: Candle[], s: PatternSettings): PatternMatch | null {
  const ranges = atr(candles, s.atrPeriod);
  const start = Math.max(1, windowStart(candles, s.lookback));
  const last = candles.length - 1;

  for (let t = last - s.flagMinBars; t >= start; t--) {
    const top = candles[t]!.high;
    const poleFrom = Math.max(0, t - s.poleMaxBars);
    // The pole top is the first candle to make this high.
    if (candles[argMaxHigh(candles, poleFrom, t - 1)]!.high >= top) continue;
    const base = argMinLow(candles, poleFrom, t - 1);
    const rise = top - candles[base]!.low;
    const range = ranges[t];
    if (range == null || rise < s.poleMinAtr * range) continue;

    const floor = top - s.flagMaxRetrace * rise;
    const maxFlag = Math.min(s.flagMaxBars, Math.floor(s.flagPoleMultiple * (t - base)));
    let flagHigh = -Infinity;
    let extreme = -1;
    let triggerIndex: number | null = null;
    let valid = true;
    for (let k = t + 1; k <= last; k++) {
      const c = candles[k]!;
      const flagLen = k - t - 1;
      if (flagLen >= s.flagMinBars && c.close > flagHigh) {
        triggerIndex = k;
        break;
      }
      if (flagLen + 1 > maxFlag || c.high > top || c.low < floor) {
        valid = false;
        break;
      }
      flagHigh = Math.max(flagHigh, c.high);
      if (extreme < 0 || c.low < candles[extreme]!.low) extreme = k;
    }
    if (!valid || extreme < 0) continue;
    // Shape: a tight parallel channel sloping against the pole (down or flat for a bull flag).
    const channel = fitChannel(candles, t + 1, (triggerIndex ?? last + 1) - 1);
    if (channel.slope > s.flagMaxSlopeAtr * range) continue;
    if (channel.upper - channel.lower > s.flagMaxHeightFraction * rise) continue;
    if (tradingDays(candles, base, extreme) > s.maxSpanDays) continue;
    if (triggerIndex != null && triggerIndex < candles.length - s.recentTriggerBars) continue;
    const target = flagHigh + rise;
    if (targetReached(candles, t + 1, target, 'bullish')) continue;

    return {
      type: 'bull_flag',
      direction: 'bullish',
      state: triggerIndex == null ? 'armed' : 'triggered',
      points: [
        point(candles, 'pole_start', base, candles[base]!.low),
        point(candles, 'pole_end', t, top),
        point(candles, 'flag_extreme', extreme, candles[extreme]!.low),
      ],
      lines: [
        { label: 'pole', from: { time: candles[base]!.time, price: candles[base]!.low }, to: { time: candles[t]!.time, price: top } },
        hline(candles, 'trigger', t + 1, flagHigh),
        hline(candles, 'target', t, target),
      ],
      triggerLevel: flagHigh,
      triggerIndex,
      triggerTime: triggerIndex == null ? null : candles[triggerIndex]!.time,
      target,
      invalidation: floor,
      startIndex: base,
      endIndex: triggerIndex ?? extreme,
    };
  }
  return null;
}

/** Bear flag = bull flag on price-negated candles, mapped back. */
export function detectBearFlag(candles: Candle[], s: PatternSettings): PatternMatch | null {
  const m = detectBullFlag(flipCandles(candles), s);
  return m ? unflipMatch(m, 'bear_flag', 'bearish') : null;
}
