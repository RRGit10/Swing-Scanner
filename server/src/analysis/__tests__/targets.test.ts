import { describe, expect, it } from 'vitest';
import { patternTargets } from '../targets.js';
import type { EmaTableRow } from '../emaLevels.js';
import type { PatternMatch } from '../patterns/types.js';
import type { Timeframe } from '../../providers/types.js';

function row(timeframe: Timeframe, ema: { 13: number | null; 48: number | null; 55: number | null; 200: number | null }): EmaTableRow {
  return { timeframe, bars: 500, price: 100, ema, support: null, resistance: null };
}

function match(type: PatternMatch['type'], direction: PatternMatch['direction'], target: number): PatternMatch {
  return {
    type, direction, state: 'armed', points: [], lines: [], triggerLevel: 100, triggerIndex: null,
    triggerTime: null, target, invalidation: 0, startIndex: 0, endIndex: 0,
  };
}

describe('patternTargets', () => {
  const table = [
    row('15m', { 13: 99, 48: 106, 55: 103, 200: 120 }),
    row('1h', { 13: 101, 48: 104, 55: 102.5, 200: 95 }),
    row('1d', { 13: 108, 48: 90, 55: 112, 200: null }),
  ];

  it('bull flag: first target = nearest 13/48/200 EMA between price and the measured move', () => {
    expect(patternTargets(match('bull_flag', 'bullish', 110), table, 100.5)).toEqual([
      { kind: 'ema', label: '1h 13 EMA', price: 101 },
      { kind: 'measured_move', label: 'Measured move', price: 110 },
    ]);
  });

  it('ignores the 55 EMA and EMAs at or beyond the measured move', () => {
    // 103 is only the 55; 107 sits exactly on the target; 108 is beyond it
    const t =patternTargets(match('bull_flag', 'bullish', 107), [row('1d', { 13: 108, 48: 107, 55: 103, 200: null })], 100);
    expect(t).toEqual([{ kind: 'measured_move', label: 'Measured move', price: 107 }]);
  });

  it('bear flag: nearest EMA below price and above the measured move', () => {
    expect(patternTargets(match('bear_flag', 'bearish', 85), table, 100)).toEqual([
      { kind: 'ema', label: '15m 13 EMA', price: 99 },
      { kind: 'measured_move', label: 'Measured move', price: 85 },
    ]);
  });

  it('no EMA in between → the measured move is the only target', () => {
    expect(patternTargets(match('bull_flag', 'bullish', 100.8), table, 100.5)).toEqual([
      { kind: 'measured_move', label: 'Measured move', price: 100.8 },
    ]);
  });

  it('armed bull flag: an EMA between current price and the trigger is not a target', () => {
    // price 100.5, trigger 102: the 1h 13 EMA (101) sits before the trigger; next is 1h 48 (104)
    const m = { ...match('bull_flag', 'bullish', 110), triggerLevel: 102 };
    expect(patternTargets(m, table, 100.5)[0]).toEqual({ kind: 'ema', label: '1h 48 EMA', price: 104 });
  });

  it('triggered bear flag: an EMA between the trigger and current price is already passed', () => {
    // trigger 100, price 96: 99 (15m 13) is already passed; next below price is 95 (1h 200)
    const m = { ...match('bear_flag', 'bearish', 85), state: 'triggered' as const };
    expect(patternTargets(m, table, 96)[0]).toEqual({ kind: 'ema', label: '1h 200 EMA', price: 95 });
  });

  it('other patterns keep their single pattern target', () => {
    expect(patternTargets(match('double_top', 'bearish', 90), table, 100)).toEqual([
      { kind: 'pattern', label: 'Pattern target', price: 90 },
    ]);
  });
});
