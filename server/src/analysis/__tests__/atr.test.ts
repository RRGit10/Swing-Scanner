import { describe, expect, it } from 'vitest';
import { atr } from '../atr.js';
import { series } from '../__fixtures__/candles.js';

describe('atr (Wilder, 14)', () => {
  it('equals the range for constant-range bars and is null before the seed', () => {
    const out = atr(series(Array.from({ length: 20 }, () => [100, 101, 99, 100] as [number, number, number, number])), 14);
    expect(out.slice(0, 13).every((v) => v === null)).toBe(true);
    expect(out[13]).toBeCloseTo(2, 10);
    expect(out[19]).toBeCloseTo(2, 10);
  });

  it('smooths with (prev × 13 + TR) / 14 after the seed', () => {
    const bars: [number, number, number, number][] = Array.from({ length: 14 }, () => [100, 100.5, 99.5, 100]);
    bars.push([100, 101.5, 98.5, 100]); // TR 3
    const out = atr(series(bars), 14);
    expect(out[13]).toBeCloseTo(1, 10);
    expect(out[14]).toBeCloseTo((1 * 13 + 3) / 14, 10);
  });

  it('uses the previous close for gaps', () => {
    const bars: [number, number, number, number][] = Array.from({ length: 14 }, () => [100, 100.5, 99.5, 100]);
    bars.push([110, 110.5, 109.5, 110]); // high − prev close = 10.5
    expect(atr(series(bars), 14)[14]).toBeCloseTo((13 + 10.5) / 14, 10);
  });
});
