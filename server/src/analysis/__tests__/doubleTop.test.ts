import { describe, expect, it } from 'vitest';
import { detectDoubleTop } from '../patterns/doubleTop.js';
import { DEFAULT_PATTERN_SETTINGS } from '../patterns/types.js';
import * as fx from '../__fixtures__/patterns.js';

const detect = (c: Parameters<typeof detectDoubleTop>[0]) => detectDoubleTop(c, DEFAULT_PATTERN_SETTINGS);

describe('detectDoubleTop', () => {
  it('armed: two equal peaks with a deep dip, no close below the dip yet', () => {
    const m = detect(fx.doubleTopArmed)!;
    expect(m).toMatchObject({ type: 'double_top', direction: 'bearish', state: 'armed', triggerIndex: null });
    expect(m.points.map((p) => [p.label, p.index, p.price])).toEqual([
      ['peak_1', 20, 110.25],
      ['dip', 30, 104.75],
      ['peak_2', 40, 110.25],
    ]);
    expect(m.triggerLevel).toBe(104.75);
    expect(m.target).toBeCloseTo(99.25, 10); // 104.75 − (110.25 − 104.75)
    expect(m.invalidation).toBe(110.25);
  });

  it('triggered: first close below the dip', () => {
    const m = detect(fx.doubleTopTriggered)!;
    expect(m).toMatchObject({ state: 'triggered', triggerIndex: 51 });
    expect(m.triggerTime).toBe(fx.doubleTopTriggered[51]!.time);
    expect(m.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['trigger', 'target']));
  });

  it('near miss: peaks about 2 ATR apart', () => {
    expect(detect(fx.doubleTopUnequalPeaks)).toBeNull();
  });

  it('near miss: dip only ~1 ATR below the peaks', () => {
    expect(detect(fx.doubleTopShallowDip)).toBeNull();
  });

  it('drops the pattern once price reaches the target', () => {
    expect(detect(fx.doubleTopTargetHit)).toBeNull();
  });

  it('drops a trigger older than the last 3 candles', () => {
    const later = fx.candlesOf(fx.pathBars([[0, 100], [20, 110], [30, 105], [40, 110], [50, 105], [51, 104.5], [55, 103.5]]));
    expect(detect(later)).toBeNull();
  });
});
