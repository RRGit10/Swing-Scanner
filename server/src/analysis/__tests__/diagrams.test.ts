import { describe, expect, it } from 'vitest';
import { detectPatterns } from '../patterns/index.js';
import type { PatternType } from '../patterns/types.js';
import * as dg from '../__fixtures__/diagrams.js';
import { doubleTopShallowDip, ihsHeadNotLowest } from '../__fixtures__/patterns.js';
import type { Candle } from '../../providers/types.js';

const types = (c: Candle[]) => detectPatterns(c).map((m) => m.type);

// Must detect: one fixture per pattern diagram, copying the drawn shape.
describe('pattern diagrams: must detect', () => {
  it.each([
    ['Bull-flag.png', 'bull_flag', dg.diagramBullFlag],
    ['Bear-flag.png', 'bear_flag', dg.diagramBearFlag],
    ['Bullish-inverse-hs.png', 'inverse_head_and_shoulders', dg.diagramInverseHeadShoulders],
    ['Bearish-inverse-hs.png', 'head_and_shoulders', dg.diagramHeadShoulders],
    ['Bull-cup&handle.png', 'cup_and_handle', dg.diagramCupAndHandle],
    ['Bear-cup&handle.png', 'inverted_cup_and_handle', dg.diagramInvertedCupAndHandle],
    ['Double-Top.png (top)', 'double_top', dg.diagramDoubleTop],
    ['Double-Top.png (bottom, mirrored)', 'double_bottom', dg.diagramDoubleBottom],
  ] as [string, PatternType, Candle[]][])('%s → %s', (_, type, candles) => {
    expect(types(candles)).toContain(type);
  });
});

// Near-misses: each breaks one key shape rule.
describe('pattern diagrams: near-misses', () => {
  it.each([
    ['bull flag whose flag slopes UP (NVDA case)', 'bull_flag', dg.bullFlagSlopingUp],
    ['bull flag in a loose, wide channel', 'bull_flag', dg.bullFlagLoose],
    ['bear flag whose flag slopes DOWN', 'bear_flag', dg.bearFlagSlopingDown],
    ['inverse H&S whose middle dip is not the lowest', 'inverse_head_and_shoulders', ihsHeadNotLowest],
    ['H&S top with shoulders 2 apart', 'head_and_shoulders', dg.headShouldersUneven],
    ['cup as a sharp V', 'cup_and_handle', dg.cupSharpV],
    ['inverted cup whose handle climbs past the middle', 'inverted_cup_and_handle', dg.invertedCupHandleTooHigh],
    ['double top with a shallow dip', 'double_top', doubleTopShallowDip],
    ['double bottom with the second low 2 × ATR off', 'double_bottom', dg.doubleBottomUneven],
  ] as [string, PatternType, Candle[]][])('%s → no %s', (_, type, candles) => {
    expect(types(candles)).not.toContain(type);
  });
});

describe('new detectors: trigger, target, invalidation', () => {
  const one = (c: Candle[], type: PatternType) => detectPatterns(c).find((m) => m.type === type)!;

  it('double bottom: bullish, close above the peak between the lows, target = neckline + (neckline − lows)', () => {
    const m = one(dg.diagramDoubleBottom, 'double_bottom');
    expect(m).toMatchObject({ direction: 'bullish', state: 'triggered' });
    expect(m.points.map((p) => p.label)).toEqual(['bottom_1', 'peak', 'bottom_2']);
    const [b1, peak, b2] = m.points.map((p) => p.price) as [number, number, number];
    expect(m.triggerLevel).toBe(peak);
    expect(m.target).toBeCloseTo(peak + (peak - (b1 + b2) / 2), 9);
    expect(m.invalidation).toBe(Math.min(b1, b2));
  });

  it('head and shoulders: bearish, red boom off the right shoulder, target = the lower of the two dips', () => {
    const m = one(dg.diagramHeadShoulders, 'head_and_shoulders');
    expect(m).toMatchObject({ direction: 'bearish', state: 'triggered', triggerIndex: dg.diagramHeadShoulders.length - 1 });
    expect(m.points.map((p) => p.label)).toEqual(['left_shoulder', 'dip_1', 'head', 'dip_2', 'right_shoulder']);
    const dips = m.points.filter((p) => p.label.startsWith('dip')).map((p) => p.price);
    expect(m.target).toBe(Math.min(...dips));
    expect(m.invalidation).toBe(m.points.at(-1)!.price); // close above the right-shoulder high
  });

  it('inverted cup: red boom after the handle high closing below the neckline → target = neckline − dome height', () => {
    const m = one(dg.diagramInvertedCupAndHandle, 'inverted_cup_and_handle');
    expect(m).toMatchObject({ direction: 'bearish', state: 'triggered' });
    expect(m.points.map((p) => p.label)).toEqual(['left_rim', 'dome_top', 'right_rim', 'handle_high']);
    const close = dg.diagramInvertedCupAndHandle.at(-1)!.close;
    expect(close).toBeLessThan(m.triggerLevel); // broke the neckline
    expect(m.target).toBeLessThan(m.triggerLevel - 2);
    expect(m.lines.map((l) => l.label)).toEqual(['neckline', 'target']);
  });

  it('inverted cup: red boom launching from the handle (closes still above the neckline) → target = neckline', () => {
    // same dome; the red boom closes just above the neckline, from inside the handle range
    const c = dg.diagramInvertedCupAndHandle.slice(0, -1);
    const last = c.at(-1)!.close;
    const launch: Candle = { ...c.at(-1)!, time: c.at(-1)!.time + 900, open: last, high: last + 0.03, close: last - 0.9, low: last - 0.92 };
    const m = one([...c, launch], 'inverted_cup_and_handle');
    expect(m.state).toBe('triggered');
    expect(m.target).toBeCloseTo(m.triggerLevel, 9);
  });

  it('cup and handle: tilted neckline through both rims; target from the neckline at the trigger', () => {
    const m = one(dg.diagramCupAndHandle, 'cup_and_handle');
    const neck = m.lines.find((l) => l.label === 'neckline')!;
    expect(neck.to.price).toBeLessThan(neck.from.price); // tilts down, like the drawing
    expect(m.state).toBe('triggered');
    expect(m.target).toBeGreaterThan(m.triggerLevel + 4); // closed above the neckline → neckline + depth
  });
});

describe('overlaps: a pattern inside a larger one is hidden', () => {
  it('the double top formed by an inverse H&S neckline peaks is not listed', () => {
    expect(types(dg.diagramInverseHeadShoulders)).toEqual(['inverse_head_and_shoulders']);
  });

  it("the bull flag formed by a cup's right side and handle is not listed", () => {
    expect(types(dg.diagramCupAndHandle)).not.toContain('bull_flag');
  });

  it('a pattern with no larger pattern around it is still listed', () => {
    expect(types(dg.diagramDoubleTop)).toContain('double_top');
  });
});
