import type { IntradayTimeframe } from '../providers/types.js';
import type { PatternMatch, PatternType } from './patterns/types.js';
import type { Direction } from './types.js';

const TIMEFRAME_ORDER: IntradayTimeframe[] = ['15m', '30m', '1h'];

export interface TimeframeMatch {
  timeframe: IntradayTimeframe;
  match: PatternMatch;
}

export interface MergedPattern {
  type: PatternType;
  direction: Direction;
  /** every time frame the pattern appears on, smallest first */
  timeframes: IntradayTimeframe[];
  /** smallest time frame: the chart used for trigger and status */
  tradingTimeframe: IntradayTimeframe;
  match: PatternMatch;
  others: TimeframeMatch[];
}

/** One entry per pattern type + direction (for a single ticker), in first-seen order. */
export function mergeTimeframes(found: TimeframeMatch[]): MergedPattern[] {
  const groups = new Map<string, TimeframeMatch[]>();
  for (const f of found) {
    const key = `${f.match.type}|${f.match.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => TIMEFRAME_ORDER.indexOf(a.timeframe) - TIMEFRAME_ORDER.indexOf(b.timeframe));
    const [primary, ...others] = sorted as [TimeframeMatch, ...TimeframeMatch[]];
    return {
      type: primary.match.type,
      direction: primary.match.direction,
      timeframes: sorted.map((s) => s.timeframe),
      tradingTimeframe: primary.timeframe,
      match: primary.match,
      others,
    };
  });
}
