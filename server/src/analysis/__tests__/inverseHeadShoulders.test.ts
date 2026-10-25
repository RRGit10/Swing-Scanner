import { describe, expect, it } from 'vitest';
import { detectInverseHeadShoulders } from '../patterns/inverseHeadShoulders.js';
import { DEFAULT_PATTERN_SETTINGS } from '../patterns/types.js';
import { DEFAULT_CANDLE_SETTINGS } from '../candles.js';
import * as fx from '../__fixtures__/patterns.js';

const detect = (c: Parameters<typeof detectInverseHeadShoulders>[0]) =>
  detectInverseHeadShoulders(c, DEFAULT_PATTERN_SETTINGS, DEFAULT_CANDLE_SETTINGS);

describe('detectInverseHeadShoulders', () => {
  it('bullish candle off the right shoulder, below the neckline → target = top of the pattern', () => {
    const m = detect(fx.ihsTriggered)!;
    expect(m).toMatchObject({ type: 'inverse_head_and_shoulders', direction: 'bullish', state: 'triggered', triggerIndex: 42 });
    expect(m.points.map((p) => [p.label, p.index, p.price])).toEqual([
      ['left_shoulder', 10, 104.75],
      ['peak_1', 16, 108.25],
      ['head', 26, 102.75],
      ['peak_2', 32, 107.75],
      ['right_shoulder', 38, 104.75],
    ]);
    expect(m.target).toBe(108.25);
    expect(m.invalidation).toBe(104.75);
    const neckline = m.lines.find((l) => l.label === 'neckline')!;
    expect(neckline.from).toEqual({ time: fx.ihsTriggered[16]!.time, price: 108.25 });
    // neckline extends to the last candle along the P1→P2 slope
    expect(neckline.to.price).toBeCloseTo(108.25 - (0.5 / 16) * 26, 10);
  });

  it('armed: right shoulder confirmed, no bullish candle yet', () => {
    expect(detect(fx.ihsArmed)).toMatchObject({ state: 'armed', triggerIndex: null, target: 108.25 });
  });

  it('near miss: the middle dip is not the lowest', () => {
    expect(detect(fx.ihsHeadNotLowest)).toBeNull();
  });

  it('near miss: shoulders ~1.75 ATR apart', () => {
    expect(detect(fx.ihsUnevenShoulders)).toBeNull();
  });

  it('near miss: the bullish candle closes above the neckline (entry missed)', () => {
    expect(detect(fx.ihsCloseAboveNeckline)).toBeNull();
  });

  it('drops the pattern once price reaches the target', () => {
    expect(detect(fx.ihsTargetHit)).toBeNull();
  });
});
