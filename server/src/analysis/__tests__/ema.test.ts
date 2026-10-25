import { describe, expect, it } from 'vitest';
import { EMA_PERIODS, ema, emaSet } from '../ema.js';
import { series, trend } from '../__fixtures__/candles.js';

describe('ema', () => {
  it('seeds with the SMA of the first n values, then applies k = 2/(n+1)', () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('matches a hand-computed period-2 series', () => {
    const out = ema([10, 11, 12, 11, 10, 9], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeCloseTo(10.5, 10);
    expect(out[2]).toBeCloseTo(11.5, 10);
    expect(out[3]).toBeCloseTo(11.166667, 5);
    expect(out[4]).toBeCloseTo(10.388889, 5);
    expect(out[5]).toBeCloseTo(9.462963, 5);
  });

  it('keeps a constant series constant', () => {
    expect(ema(Array(10).fill(5), 4).slice(3)).toEqual(Array(7).fill(5));
  });

  it('is all null when there are fewer values than the period', () => {
    expect(ema(Array(199).fill(1), 200)).toEqual(Array(199).fill(null));
  });

  it('produces its first 200-period value at index 199', () => {
    const out = ema(Array.from({ length: 250 }, (_, i) => i), 200);
    expect(out[198]).toBeNull();
    expect(out[199]).toBeCloseTo(99.5, 10); // mean of 0..199
    expect(out).toHaveLength(250);
  });
});

describe('emaSet', () => {
  it('computes 13, 48, 55 and 200 on closes, aligned with the candles', () => {
    expect(EMA_PERIODS).toEqual([13, 48, 55, 200]);
    const candles = series(trend(60, 100, 0.5));
    const set = emaSet(candles);
    for (const p of EMA_PERIODS) expect(set[p]).toHaveLength(60);
    expect(set[13][12]).not.toBeNull();
    expect(set[55][54]).not.toBeNull();
    expect(set[200].every((v) => v === null)).toBe(true);
  });
});
