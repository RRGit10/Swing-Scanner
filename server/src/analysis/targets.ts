import type { EmaTableRow } from './emaLevels.js';
import type { PatternMatch } from './patterns/types.js';

export interface Target {
  kind: 'ema' | 'measured_move' | 'pattern';
  label: string;
  price: number;
}

const SR_PERIODS = [13, 48, 200] as const;

/**
 * Stock targets for a pattern, nearest first. Flags: the nearest 13/48/200 EMA from the
 * multi-time-frame table strictly between the trigger level (or current price, if further along)
 * and the measured move, then the measured move.
 * Other patterns: their single pattern target.
 */
export function patternTargets(match: PatternMatch, emaTable: EmaTableRow[], price: number): Target[] {
  if (match.type !== 'bull_flag' && match.type !== 'bear_flag') {
    return [{ kind: 'pattern', label: 'Pattern target', price: match.target }];
  }

  // Search beyond both the trigger and current price: never a level before entry or already passed.
  const [lo, hi] =
    match.direction === 'bullish'
      ? [Math.max(price, match.triggerLevel), match.target]
      : [match.target, Math.min(price, match.triggerLevel)];
  let nearest: Target | null = null;
  for (const row of emaTable) {
    for (const period of SR_PERIODS) {
      const value = row.ema[period];
      if (value == null || value <= lo || value >= hi) continue;
      if (!nearest || Math.abs(value - price) < Math.abs(nearest.price - price)) {
        nearest = { kind: 'ema', label: `${row.timeframe} ${period} EMA`, price: value };
      }
    }
  }
  const measured: Target = { kind: 'measured_move', label: 'Measured move', price: match.target };
  return nearest ? [nearest, measured] : [measured];
}
