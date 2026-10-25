import type { Candle } from '../../providers/types.js';
import { DEFAULT_CANDLE_SETTINGS, type CandleSettings } from '../candles.js';
import { detectCupAndHandle } from './cupAndHandle.js';
import { detectDoubleTop } from './doubleTop.js';
import { detectBearFlag, detectBullFlag } from './flags.js';
import { detectInverseHeadShoulders } from './inverseHeadShoulders.js';
import { DEFAULT_PATTERN_SETTINGS, type PatternMatch, type PatternSettings } from './types.js';

/** The most recent valid match of each pattern type, most recent first. */
export function detectPatterns(
  candles: Candle[],
  settings: PatternSettings = DEFAULT_PATTERN_SETTINGS,
  candleSettings: CandleSettings = DEFAULT_CANDLE_SETTINGS,
): PatternMatch[] {
  return [
    detectCupAndHandle(candles, settings, candleSettings),
    detectInverseHeadShoulders(candles, settings, candleSettings),
    detectBullFlag(candles, settings),
    detectBearFlag(candles, settings),
    detectDoubleTop(candles, settings),
  ]
    .filter((m): m is PatternMatch => m != null)
    .sort((a, b) => b.endIndex - a.endIndex);
}

export type * from './types.js';
export { DEFAULT_PATTERN_SETTINGS } from './types.js';
