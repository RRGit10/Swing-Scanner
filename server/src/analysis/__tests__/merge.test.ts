import { describe, expect, it } from 'vitest';
import { mergeTimeframes } from '../merge.js';
import type { PatternMatch } from '../patterns/types.js';

function match(type: PatternMatch['type'], direction: PatternMatch['direction'], target: number): PatternMatch {
  return {
    type, direction, state: 'armed', points: [], lines: [], triggerLevel: 0, triggerIndex: null,
    triggerTime: null, target, invalidation: 0, startIndex: 0, endIndex: 0,
  };
}

describe('mergeTimeframes', () => {
  it('merges the same pattern + direction across time frames; the smallest is the trading chart', () => {
    const merged = mergeTimeframes([
      { timeframe: '1h', match: match('double_top', 'bearish', 90) },
      { timeframe: '15m', match: match('double_top', 'bearish', 95) },
      { timeframe: '30m', match: match('double_top', 'bearish', 93) },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.timeframes).toEqual(['15m', '30m', '1h']);
    expect(merged[0]!.tradingTimeframe).toBe('15m');
    expect(merged[0]!.match.target).toBe(95);
    expect(merged[0]!.others.map((o) => o.timeframe)).toEqual(['30m', '1h']);
  });

  it('keeps different patterns and directions separate', () => {
    const merged = mergeTimeframes([
      { timeframe: '1h', match: match('bear_flag', 'bearish', 90) },
      { timeframe: '30m', match: match('double_top', 'bearish', 93) },
      { timeframe: '15m', match: match('bull_flag', 'bullish', 110) },
    ]);
    expect(merged.map((m) => [m.type, m.tradingTimeframe])).toEqual([
      ['bear_flag', '1h'],
      ['double_top', '30m'],
      ['bull_flag', '15m'],
    ]);
  });

  it('returns [] for no matches', () => {
    expect(mergeTimeframes([])).toEqual([]);
  });
});
