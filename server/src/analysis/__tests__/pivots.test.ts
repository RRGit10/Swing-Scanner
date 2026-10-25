import { describe, expect, it } from 'vitest';
import { findPivots } from '../patterns/pivots.js';
import { series } from '../__fixtures__/candles.js';
import { candlesOf, pathBars } from '../__fixtures__/patterns.js';

describe('findPivots', () => {
  const zigzag = candlesOf(pathBars([[0, 100], [5, 105], [10, 100], [15, 106], [20, 100]]));

  it('finds swing highs and lows with N = 3 bars on each side, excluding unconfirmed edges', () => {
    const { highs, lows } = findPivots(zigzag, 3);
    expect(highs.map((p) => [p.index, p.price])).toEqual([[5, 105.25], [15, 106.25]]);
    expect(lows.map((p) => [p.index, p.price])).toEqual([[10, 99.75]]);
    expect(highs[0]!.time).toBe(zigzag[5]!.time);
  });

  it('counts only the first bar of a flat top', () => {
    const flat = series([
      [99, 99.5, 98.5, 99], [99, 100, 98.8, 99.8], [99.8, 100.5, 99.5, 100.2],
      [100.2, 101, 100, 100.6], [100.6, 101, 100.1, 100.4],
      [100.4, 100.5, 99.6, 99.8], [99.8, 100, 99, 99.2], [99.2, 99.5, 98.5, 98.8],
    ]);
    expect(findPivots(flat, 3).highs.map((p) => p.index)).toEqual([3]);
  });

  it('N changes what counts as a pivot', () => {
    // bar 6 is a 1-bar wiggle: bar 9 already trades above it
    const wiggle = candlesOf(pathBars([[0, 98], [4, 100], [6, 101], [7, 100.5], [16, 105], [20, 101]]));
    expect(findPivots(wiggle, 1).highs.map((p) => p.index)).toEqual([6, 16]);
    expect(findPivots(wiggle, 3).highs.map((p) => p.index)).toEqual([16]);
  });
});
