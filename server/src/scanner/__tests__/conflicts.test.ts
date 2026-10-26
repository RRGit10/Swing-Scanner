import { describe, expect, it } from 'vitest';
import { applyConflicts } from '../conflicts.js';
import type { PatternEntry } from '../group.js';

function p(key: string, type: string, direction: 'bullish' | 'bearish', timeframes: PatternEntry['timeframes'], status: PatternEntry['status']): PatternEntry {
  return {
    key, type: type as never, direction, timeframes, tradingTimeframe: timeframes[0]!, state: 'triggered', status, lowerQuality: false,
    triggerTime: null, triggerLevel: 1, invalidation: 2, targets: [], candleLabels: [], drawings: {}, horizonExpiration: null,
    dailyEmasInPath: [], ema55Reversal: null, conflict: null, contract: { none: 'no contract fits', skippedExpirations: [] },
  };
}

describe('applyConflicts', () => {
  it('opposite directions on the same time frame (META 15m bull flag + 15m double top): both flagged, capped at WATCH', () => {
    const out = applyConflicts([p('flag', 'bull_flag', 'bullish', ['15m'], 'AT ENTRY'), p('dt', 'double_top', 'bearish', ['15m', '30m'], 'READY')]);
    expect(out.map((x) => [x.key, x.status, x.conflict])).toEqual([
      ['flag', 'WATCH', { with: ['double_top'], timeframes: ['15m'] }],
      ['dt', 'WATCH', { with: ['bull_flag'], timeframes: ['15m'] }],
    ]);
  });

  it('WAIT and WATCH are already at or below the cap and stay as they are', () => {
    const out = applyConflicts([p('a', 'bull_flag', 'bullish', ['1h'], 'WAIT'), p('b', 'bear_flag', 'bearish', ['1h'], 'WATCH')]);
    expect(out.map((x) => x.status)).toEqual(['WAIT', 'WATCH']);
    expect(out.every((x) => x.conflict)).toBe(true);
  });

  it('opposite directions on different time frames: no conflict', () => {
    const out = applyConflicts([p('a', 'bull_flag', 'bullish', ['15m'], 'READY'), p('b', 'double_top', 'bearish', ['30m', '1h'], 'READY')]);
    expect(out.map((x) => [x.status, x.conflict])).toEqual([['READY', null], ['READY', null]]);
  });

  it('same direction on the same time frame: no conflict', () => {
    const out = applyConflicts([p('a', 'bull_flag', 'bullish', ['15m'], 'AT ENTRY'), p('b', 'double_bottom', 'bullish', ['15m'], 'READY')]);
    expect(out.map((x) => [x.status, x.conflict])).toEqual([['AT ENTRY', null], ['READY', null]]);
  });
});
