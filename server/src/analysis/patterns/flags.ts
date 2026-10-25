import type { Candle } from '../../providers/types.js';
import { atr } from '../atr.js';
import type { PatternMatch, PatternSettings, PricePoint } from './types.js';
import { argMaxHigh, argMinLow, hline, point, targetReached, tradingDays, windowStart } from './util.js';

/**
 * Bull flag: a pole rising ≥ poleMinAtr × ATR within poleMaxBars candles, then a flag of
 * flagMinBars–flagMaxBars candles that stays under the pole top and retraces ≤ flagMaxRetrace of the
 * pole. Trigger = close above the flag high. Target = flag high + pole height.
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
      if (flagLen + 1 > s.flagMaxBars || c.high > top || c.low < floor) {
        valid = false;
        break;
      }
      flagHigh = Math.max(flagHigh, c.high);
      if (extreme < 0 || c.low < candles[extreme]!.low) extreme = k;
    }
    if (!valid || extreme < 0) continue;
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
  const flipped = candles.map((c) => ({ ...c, open: -c.open, close: -c.close, high: -c.low, low: -c.high }));
  const m = detectBullFlag(flipped, s);
  if (!m) return null;
  const flip = <P extends PricePoint>(p: P): P => ({ ...p, price: -p.price });
  return {
    ...m,
    type: 'bear_flag',
    direction: 'bearish',
    points: m.points.map(flip),
    lines: m.lines.map((l) => ({ ...l, from: flip(l.from), to: flip(l.to) })),
    triggerLevel: -m.triggerLevel,
    target: -m.target,
    invalidation: -m.invalidation,
  };
}
