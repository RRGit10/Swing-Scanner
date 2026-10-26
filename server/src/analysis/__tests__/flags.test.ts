import { describe, expect, it } from 'vitest';
import { detectBearFlag, detectBullFlag } from '../patterns/flags.js';
import { DEFAULT_PATTERN_SETTINGS } from '../patterns/types.js';
import * as fx from '../__fixtures__/patterns.js';

const bull = (c: Parameters<typeof detectBullFlag>[0]) => detectBullFlag(c, DEFAULT_PATTERN_SETTINGS);
const bear = (c: Parameters<typeof detectBearFlag>[0]) => detectBearFlag(c, DEFAULT_PATTERN_SETTINGS);

describe('detectBullFlag', () => {
  it('triggered: close above the flag high; target = flag high + pole height', () => {
    const m = bull(fx.bullFlagTriggered)!;
    expect(m).toMatchObject({ type: 'bull_flag', direction: 'bullish', state: 'triggered', triggerIndex: 30 });
    expect(m.points.map((p) => [p.label, p.index, p.price])).toEqual([
      ['pole_start', 16, 99.75],
      ['pole_end', 25, 108.25],
      ['flag_extreme', 29, 105.75],
    ]);
    expect(m.triggerLevel).toBe(108.25);
    expect(m.target).toBeCloseTo(116.75, 10); // 108.25 + (108.25 − 99.75)
    expect(m.invalidation).toBeCloseTo(104, 10); // 50% retrace of the pole
    expect(m.lines.map((l) => l.label)).toEqual(['pole', 'trigger', 'target']);
  });

  it('armed: flag still forming inside 2–8 candles', () => {
    expect(bull(fx.bullFlagArmed)).toMatchObject({ state: 'armed', triggerIndex: null, triggerLevel: 108.25 });
  });

  it('near miss: pullback retraces ~59% of the pole', () => {
    expect(bull(fx.bullFlagTooDeep)).toBeNull();
  });

  it('near miss: flag longer than 2× the pole (19 candles after a 9-candle pole)', () => {
    expect(bull(fx.bullFlagTooLong)).toBeNull();
  });

  it('near miss: pole only ~2 ATR', () => {
    expect(bull(fx.bullFlagSmallPole)).toBeNull();
  });
});

describe('detectBearFlag (mirror)', () => {
  it('triggered: close below the flag low; target = flag low − pole height', () => {
    const m = bear(fx.mirror(fx.bullFlagTriggered))!;
    expect(m).toMatchObject({ type: 'bear_flag', direction: 'bearish', state: 'triggered', triggerIndex: 30 });
    expect(m.points.map((p) => [p.label, p.index, p.price])).toEqual([
      ['pole_start', 16, 100.25],
      ['pole_end', 25, 91.75],
      ['flag_extreme', 29, 94.25],
    ]);
    expect(m.triggerLevel).toBe(91.75);
    expect(m.target).toBeCloseTo(83.25, 10);
    expect(m.invalidation).toBeCloseTo(96, 10);
  });

  it('near miss: bounce retraces ~59% of the drop', () => {
    expect(bear(fx.mirror(fx.bullFlagTooDeep))).toBeNull();
  });

  it('near miss: drop only ~2 ATR', () => {
    expect(bear(fx.mirror(fx.bullFlagSmallPole))).toBeNull();
  });

  it('does not see a bull flag as a bear flag', () => {
    expect(bear(fx.bullFlagTriggered)).toBeNull();
  });
});
