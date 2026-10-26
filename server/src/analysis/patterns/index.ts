import type { Candle } from '../../providers/types.js';
import { DEFAULT_CANDLE_SETTINGS, type CandleSettings } from '../candles.js';
import { detectCupAndHandle, detectInvertedCupAndHandle } from './cupAndHandle.js';
import { detectDoubleBottom, detectDoubleTop } from './doubleTop.js';
import { detectBearFlag, detectBullFlag } from './flags.js';
import { detectHeadAndShoulders, detectInverseHeadShoulders } from './inverseHeadShoulders.js';
import { DEFAULT_PATTERN_SETTINGS, type PatternMatch, type PatternSettings } from './types.js';
import { tradingDays } from './util.js';

/** Index span from the first to the last key point. */
function span(m: PatternMatch): [number, number] {
  const idx = m.points.map((p) => p.index);
  return [Math.min(...idx), Math.max(...idx)];
}

/**
 * A pattern whose key points all fall inside a larger pattern on the same candles is hidden: the same candles
 * never show (or count in history) twice. Once the larger one ends, the contained one can appear on its own.
 */
export function hideContained(matches: PatternMatch[]): PatternMatch[] {
  return matches.filter((a) => {
    const [a0, a1] = span(a);
    return !matches.some((b) => {
      if (b === a) return false;
      const [b0, b1] = span(b);
      return b0 <= a0 && a1 <= b1 && b1 - b0 > a1 - a0;
    });
  });
}

/**
 * The most recent valid match of each pattern type, most recent first. A pattern is dropped once its first key
 * point is more than maxSpanDays trading days old (too old to act on), and when it sits inside a larger pattern.
 */
export function detectPatterns(
  candles: Candle[],
  settings: PatternSettings = DEFAULT_PATTERN_SETTINGS,
  candleSettings: CandleSettings = DEFAULT_CANDLE_SETTINGS,
): PatternMatch[] {
  const found = [
    detectCupAndHandle(candles, settings, candleSettings),
    detectInverseHeadShoulders(candles, settings, candleSettings),
    detectBullFlag(candles, settings),
    detectBearFlag(candles, settings),
    detectDoubleTop(candles, settings),
    detectDoubleBottom(candles, settings),
    detectInvertedCupAndHandle(candles, settings, candleSettings),
    detectHeadAndShoulders(candles, settings, candleSettings),
  ].filter((m): m is PatternMatch => m != null && tradingDays(candles, span(m)[0], candles.length - 1) <= settings.maxSpanDays);
  return hideContained(found).sort((a, b) => b.endIndex - a.endIndex);
}

export type * from './types.js';
export { DEFAULT_PATTERN_SETTINGS, NOT_CLASS_METHOD } from './types.js';
