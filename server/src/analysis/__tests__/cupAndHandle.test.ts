import { describe, expect, it } from 'vitest';
import { detectCupAndHandle } from '../patterns/cupAndHandle.js';
import { DEFAULT_PATTERN_SETTINGS } from '../patterns/types.js';
import { DEFAULT_CANDLE_SETTINGS } from '../candles.js';
import * as fx from '../__fixtures__/patterns.js';

const detect = (c: Parameters<typeof detectCupAndHandle>[0]) =>
  detectCupAndHandle(c, DEFAULT_PATTERN_SETTINGS, DEFAULT_CANDLE_SETTINGS);

describe('detectCupAndHandle', () => {
  it('boom boom launching from the handle (closes below neckline) → target = neckline', () => {
    const m = detect(fx.cupHandleFromHandle)!;
    expect(m).toMatchObject({ type: 'cup_and_handle', direction: 'bullish', state: 'triggered', triggerIndex: 35 });
    expect(m.points.map((p) => [p.label, p.index, p.price])).toEqual([
      ['left_rim', 10, 100.25],
      ['cup_bottom', 20, 94.75],
      ['right_rim', 30, 100.25],
      ['handle_low', 34, 97.75],
    ]);
    expect(m.triggerLevel).toBe(100.25);
    expect(m.target).toBe(100.25);
    expect(m.invalidation).toBe(97.75);
    expect(m.lines.map((l) => l.label)).toEqual(['neckline', 'target']);
  });

  it('boom boom closing above the neckline → target = neckline + cup depth', () => {
    const m = detect(fx.cupHandleBreakout)!;
    expect(m).toMatchObject({ state: 'triggered', triggerIndex: 35 });
    expect(m.target).toBeCloseTo(105.75, 10); // 100.25 + (100.25 − 94.75)
  });

  it('armed: handle formed, no boom boom yet → target = neckline', () => {
    expect(detect(fx.cupHandleArmed)).toMatchObject({ state: 'armed', triggerIndex: null, target: 100.25 });
  });

  it('near miss: handle drops into the lower half of the cup', () => {
    expect(detect(fx.cupHandleDeepHandle)).toBeNull();
  });

  it('near miss: right rim 2 below the left rim (> 1.5 × ATR)', () => {
    expect(detect(fx.cupHandleLowRightRim)).toBeNull();
  });

  it('near miss: cup only 9 candles wide', () => {
    expect(detect(fx.cupHandleNarrow)).toBeNull();
  });
});
