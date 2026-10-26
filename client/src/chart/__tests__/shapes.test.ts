import { describe, expect, it } from 'vitest';
import { buildPatternDrawing, candleTags, fitChannel, shortCandleName, triggerIndex, type Shape } from '../shapes';
import type { Candle, KeyPoint, PatternEntry } from '../../api/types';

const T0 = 1_792_762_200;
const bar = (i: number, low: number, high: number, close = (low + high) / 2): Candle => ({
  time: T0 + i * 900, open: (low + high) / 2, high, low, close, volume: 1,
});
const pt = (label: string, index: number, price: number): KeyPoint => ({ label, index, time: T0 + index * 900, price });
const kinds = (shapes: Shape[]) => shapes.map((s) => s.kind);

type P = Pick<PatternEntry, 'type' | 'direction' | 'state' | 'triggerLevel' | 'targets' | 'triggerTime'>;
const pattern = (over: Partial<P>): P => ({
  type: 'bear_flag', direction: 'bearish', state: 'armed', triggerLevel: 100, targets: [{ kind: 'measured_move', label: 'Measured move', price: 90 }], triggerTime: null, ...over,
});

describe('triggerIndex', () => {
  const candles = Array.from({ length: 10 }, (_, i) => bar(i, 99, 101));
  it('is the last candle that started before the trigger close time', () => {
    expect(triggerIndex(candles, T0 + 6 * 900 + 900)).toBe(6); // bar 6 closes at its start + 15 min
    expect(triggerIndex(candles, T0 + 6 * 900 + 600)).toBe(6); // a shortened last bar (half day / 15:30 1h)
  });
  it('null when there is no trigger, or the time is before the data', () => {
    expect(triggerIndex(candles, null)).toBeNull();
    expect(triggerIndex(candles, T0)).toBeNull();
  });
});

describe('fitChannel', () => {
  it('parallel lines that enclose every high and low and touch the extremes', () => {
    const candles = [bar(0, 10, 12), bar(1, 11, 13.5), bar(2, 12, 14), bar(3, 12.5, 15)];
    const ch = fitChannel(candles, 0, 3);
    for (let i = 0; i <= 3; i++) {
      expect(ch.slope * i + ch.upper).toBeGreaterThanOrEqual(candles[i]!.high - 1e-9);
      expect(ch.slope * i + ch.lower).toBeLessThanOrEqual(candles[i]!.low + 1e-9);
    }
    expect(Math.min(...candles.map((c, i) => ch.slope * i + ch.upper - c.high))).toBeCloseTo(0, 9);
    expect(Math.min(...candles.map((c, i) => c.low - (ch.slope * i + ch.lower)))).toBeCloseTo(0, 9);
    expect(ch.slope).toBeGreaterThan(0);
  });

  it('a single candle gives a flat channel at its high and low', () => {
    expect(fitChannel([bar(0, 9, 11)], 0, 0)).toEqual({ slope: 0, upper: 11, lower: 9 });
  });
});

describe('buildPatternDrawing', () => {
  it('bear flag: thick pole, channel over the flag candles only, dashed arrow trigger → T1 right of the flag', () => {
    // 0–4 pole down, 5–8 flag, 9 trigger
    const candles = [bar(0, 109, 111), bar(1, 106, 109), bar(2, 103, 106), bar(3, 100, 103), bar(4, 98, 100.5),
      bar(5, 99, 101), bar(6, 99.5, 101.5), bar(7, 100, 102), bar(8, 100.2, 102.4), bar(9, 97, 100.5, 97.5)];
    const d = buildPatternDrawing({
      candles,
      points: [pt('pole_start', 0, 111), pt('pole_end', 4, 98), pt('flag_extreme', 8, 102.4)],
      pattern: pattern({ state: 'triggered', triggerTime: T0 + 9 * 900 + 900, triggerLevel: 99 }),
    })!;
    expect(kinds(d.shapes)).toEqual(['channel', 'polyline', 'arrow']);
    const [channel, pole, arrow] = d.shapes as [Extract<Shape, { kind: 'channel' }>, Extract<Shape, { kind: 'polyline' }>, Extract<Shape, { kind: 'arrow' }>];
    expect([channel.from, channel.to]).toEqual([5, 8]);
    expect(pole).toMatchObject({ width: 4, points: [{ index: 0, price: 111 }, { index: 4, price: 98 }] });
    expect(arrow).toMatchObject({ index: 9.8, from: 99, to: 90 });
    expect(d.tags.map((t) => [t.text, t.index, t.prefer])).toEqual([['Pole', 0, 'above'], ['Flag', 6, 'above']]);
    expect(d.summary).toBe('Bear flag drawn: pole, flag channel, arrow to T1. Tags: Pole, Flag.');
  });

  it('armed bull flag: channel runs to the last candle; arrow just right of it; tags below', () => {
    const candles = [bar(0, 90, 91), bar(1, 92, 95), bar(2, 95, 99), bar(3, 97, 99.5), bar(4, 96.5, 98.5)];
    const d = buildPatternDrawing({
      candles,
      points: [pt('pole_start', 0, 90), pt('pole_end', 2, 99), pt('flag_extreme', 4, 96.5)],
      pattern: pattern({ type: 'bull_flag', direction: 'bullish', triggerLevel: 99.5, targets: [{ kind: 'measured_move', label: 'Measured move', price: 108.5 }] }),
    })!;
    const channel = d.shapes.find((s) => s.kind === 'channel') as Extract<Shape, { kind: 'channel' }>;
    expect([channel.from, channel.to]).toEqual([3, 4]);
    expect(d.shapes.find((s) => s.kind === 'arrow')).toMatchObject({ index: 4.8, from: 99.5, to: 108.5 });
    expect(d.tags.every((t) => t.prefer === 'below')).toBe(true);
  });

  it('double top: "M" = rise into peak 1 → dip → peak 2 → drop to the trigger close; neckline at the dip', () => {
    const candles = Array.from({ length: 30 }, (_, i) => bar(i, 99, 101));
    candles[1] = bar(1, 97, 99); // lowest low before peak 1 (within the M's half-width)
    candles[24] = bar(24, 102, 105, 103);
    const d = buildPatternDrawing({
      candles,
      points: [pt('peak_1', 5, 110), pt('dip', 12, 104), pt('peak_2', 20, 110.2)],
      pattern: pattern({ type: 'double_top', state: 'triggered', triggerTime: T0 + 24 * 900 + 900, triggerLevel: 104 }),
    })!;
    expect(d.shapes).toEqual([
      { kind: 'polyline', width: 2.5, points: [{ index: 1, price: 97 }, { index: 5, price: 110 }, { index: 12, price: 104 }, { index: 20, price: 110.2 }, { index: 24, price: 103 }] },
      { kind: 'polyline', width: 1.5, dash: true, label: 'neckline', points: [{ index: 5, price: 104 }, { index: 24, price: 104 }] },
    ]);
    expect(d.tags.map((t) => t.text)).toEqual(['Top 1', 'Top 2']);
  });

  it('armed double top: the M ends at the lowest low after peak 2', () => {
    const candles = Array.from({ length: 26 }, (_, i) => bar(i, 105, 107));
    candles[23] = bar(23, 104.5, 106);
    const d = buildPatternDrawing({
      candles,
      points: [pt('peak_1', 5, 110), pt('dip', 12, 104), pt('peak_2', 20, 110.2)],
      pattern: pattern({ type: 'double_top' }),
    })!;
    const m = d.shapes[0] as Extract<Shape, { kind: 'polyline' }>;
    expect(m.points.at(-1)).toEqual({ index: 23, price: 104.5 });
  });

  it('inverse H&S: line LS → peak → head → peak → RS, sloped neckline through both peaks to the last candle', () => {
    const candles = Array.from({ length: 45 }, (_, i) => bar(i, 99, 101));
    const d = buildPatternDrawing({
      candles,
      points: [pt('left_shoulder', 10, 104.75), pt('peak_1', 16, 108.25), pt('head', 26, 102.75), pt('peak_2', 32, 107.75), pt('right_shoulder', 38, 104.75)],
      pattern: pattern({ type: 'inverse_head_and_shoulders', direction: 'bullish', triggerLevel: 104.75 }),
    })!;
    const [shoulders, neck] = d.shapes as Extract<Shape, { kind: 'polyline' }>[];
    expect(shoulders!.points.map((p) => p.index)).toEqual([10, 16, 26, 32, 38]);
    expect(neck!.points[0]).toEqual({ index: 16, price: 108.25 });
    expect(neck!.points[1]!.index).toBe(44);
    expect(neck!.points[1]!.price).toBeCloseTo(108.25 - (0.5 / 16) * 28, 9);
    expect(d.tags.map((t) => [t.text, t.prefer])).toEqual([['LS', 'below'], ['Head', 'below'], ['RS', 'below']]);
  });

  it('cup and handle: U curve rim → bottom → rim, shaded handle box, neckline; tags Cup / Handle', () => {
    const candles = [...Array.from({ length: 31 }, (_, i) => bar(i, 95, 100)), bar(31, 98.8, 99.8), bar(32, 98.2, 99.4), bar(33, 97.75, 99), bar(34, 98, 99.2)];
    const d = buildPatternDrawing({
      candles,
      points: [pt('left_rim', 10, 100.25), pt('cup_bottom', 20, 94.75), pt('right_rim', 30, 100.25), pt('handle_low', 33, 97.75)],
      pattern: pattern({ type: 'cup_and_handle', direction: 'bullish', triggerLevel: 100.25 }),
    })!;
    expect(kinds(d.shapes)).toEqual(['curve', 'box', 'polyline']);
    expect(d.shapes[0]).toEqual({ kind: 'curve', from: { index: 10, price: 100.25 }, via: { index: 20, price: 94.75 }, to: { index: 30, price: 100.25 } });
    expect(d.shapes[1]).toEqual({ kind: 'box', from: 31, to: 34, top: 99.8, bottom: 97.75 });
    expect(d.shapes[2]).toMatchObject({ label: 'neckline', points: [{ index: 10, price: 100.25 }, { index: 34, price: 100.25 }] });
    expect(d.tags.map((t) => t.text)).toEqual(['Cup', 'Handle']);
  });

  it('returns null when key points are missing from this chart (e.g. other time frame)', () => {
    expect(buildPatternDrawing({ candles: [bar(0, 1, 2)], points: [], pattern: pattern({}) })).toBeNull();
  });
});

describe('candle tags', () => {
  it('short names, below bullish / above bearish and neutral candles', () => {
    expect(shortCandleName('three_green_soldiers')).toBe('Soldiers');
    expect(shortCandleName('red_boom_boom')).toBe('Red boom');
    const candles = [bar(0, 1, 2), bar(1, 1, 2), bar(2, 1, 2)];
    expect(
      candleTags(
        [
          { time: T0, names: [], bias: 'none' },
          { time: T0 + 900, names: ['doji'], bias: 'neutral' },
          { time: T0 + 1800, names: ['boom_boom', 'three_green_soldiers'], bias: 'bullish' },
        ],
        candles,
      ),
    ).toEqual([
      { text: 'Doji', index: 1, price: 2, prefer: 'above', kind: 'candle' },
      { text: 'Boom + Soldiers', index: 2, price: 1, prefer: 'below', kind: 'candle' },
    ]);
  });
});
