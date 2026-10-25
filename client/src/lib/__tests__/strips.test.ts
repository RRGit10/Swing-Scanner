import { describe, expect, it } from 'vitest';
import { pathStrip, rangeStrip } from '../strips';

describe('pathStrip', () => {
  it('bullish: invalidation on the left, targets on the right, positions to scale', () => {
    const s = pathStrip('bullish', [
      { key: 'inval', value: 98 },
      { key: 'price', value: 100 },
      { key: 'trigger', value: 101 },
      { key: 'T1', value: 108 },
    ]);
    expect(s.map((p) => p.key)).toEqual(['inval', 'price', 'trigger', 'T1']);
    expect(s[0]!.pos).toBeCloseTo(4, 6);
    expect(s.at(-1)!.pos).toBeCloseTo(96, 6);
    expect(s[1]!.pos).toBeCloseTo(4 + (2 / 10) * 92, 6);
  });

  it('bearish: reversed, so the trade still reads left → right', () => {
    const s = pathStrip('bearish', [
      { key: 'inval', value: 764 },
      { key: 'price', value: 760 },
      { key: 'trigger', value: 758.68 },
      { key: 'T1', value: 753.59 },
    ]);
    expect(s.map((p) => p.key)).toEqual(['inval', 'price', 'trigger', 'T1']);
    expect(s[0]!.pos).toBeLessThan(s.at(-1)!.pos);
  });

  it('wider labels (narrow screens) push more labels to another row', () => {
    const pts = [
      { key: 'a', value: 100 },
      { key: 'b', value: 102 },
      { key: 'c', value: 110 },
    ];
    expect(pathStrip('bullish', pts).map((p) => p.labelSide)).toEqual(['below', 'below', 'below']);
    expect(pathStrip('bullish', pts, () => 30).map((p) => p.labelSide)).toEqual(['below', 'above', 'below']);
  });

  it('a third close label drops to a second row below instead of overlapping', () => {
    const s = pathStrip('bullish', [
      { key: 'a', value: 100 },
      { key: 'b', value: 101 },
      { key: 'c', value: 102 },
      { key: 'd', value: 110 },
    ], () => 25);
    expect(s.map((p) => p.labelSide)).toEqual(['below', 'above', 'below2', 'below']);
  });

  it('labels near the edges anchor inward so they never spill off screen', () => {
    const s = pathStrip('bullish', [
      { key: 'a', value: 100 },
      { key: 'b', value: 105 },
      { key: 'c', value: 110 },
    ]);
    expect(s.map((p) => p.anchor)).toEqual(['start', 'middle', 'end']);
  });

  it('labels that would collide alternate above/below', () => {
    const s = pathStrip('bullish', [
      { key: 'a', value: 100 },
      { key: 'b', value: 100.1 },
      { key: 'c', value: 110 },
    ]);
    expect(s.map((p) => p.labelSide)).toEqual(['below', 'above', 'below']);
  });
});

describe('rangeStrip', () => {
  it('places the entry zone (bottom 25%) and the ask on the day range', () => {
    expect(rangeStrip({ low: 2, high: 6, zoneHigh: 3, ask: 4 })).toEqual({ zoneEnd: 25, ask: 50, askClamped: null });
  });

  it('clamps an ask outside the day range and says which side', () => {
    expect(rangeStrip({ low: 2, high: 6, zoneHigh: 3, ask: 7 })).toEqual({ zoneEnd: 25, ask: 100, askClamped: 'above' });
    expect(rangeStrip({ low: 2, high: 6, zoneHigh: 3, ask: 1.5 })).toEqual({ zoneEnd: 25, ask: 0, askClamped: 'below' });
  });

  it('a flat day range puts everything at the start', () => {
    expect(rangeStrip({ low: 2, high: 2, zoneHigh: 2, ask: 2 })).toEqual({ zoneEnd: 0, ask: 0, askClamped: null });
  });
});
