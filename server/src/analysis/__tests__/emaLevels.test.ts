import { describe, expect, it } from 'vitest';
import { dailyEmasInPath, ema55Reversals, emaTable, nearestLevels } from '../emaLevels.js';
import { series, trend } from '../__fixtures__/candles.js';

describe('nearestLevels', () => {
  const latest = { 13: 99.5, 48: 101, 55: 100.2, 200: 95 };

  it('picks the nearest of 13/48/200 below (support) and above (resistance), ignoring the 55', () => {
    expect(nearestLevels(100, latest)).toEqual({
      support: { period: 13, value: 99.5 },
      resistance: { period: 48, value: 101 },
    });
  });

  it('returns null resistance when price is above every EMA', () => {
    expect(nearestLevels(110, latest).resistance).toBeNull();
    expect(nearestLevels(110, latest).support).toEqual({ period: 48, value: 101 });
  });

  it('skips EMAs that have no value yet', () => {
    expect(nearestLevels(100, { 13: null, 48: null, 55: null, 200: 95 })).toEqual({
      support: { period: 200, value: 95 },
      resistance: null,
    });
  });
});

describe('ema55Reversals', () => {
  const ema55 = [100, 100, 100];
  const before: [number, number, number, number] = [101, 101.5, 100.5, 101];

  describe('bullish', () => {
    it('fires on the next candle when a wick reaches the 0.2% band and the next close is above the 55', () => {
      const candles = series([before, [100.8, 101, 100.15, 100.5], [100.5, 101, 100.4, 100.9]]);
      expect(ema55Reversals(candles, ema55, 'bullish')).toEqual([2]);
    });

    it('counts a deep pierce below the 55 that closes back above next candle', () => {
      const candles = series([before, [100.8, 101, 99.0, 99.6], [99.6, 100.6, 99.5, 100.4]]);
      expect(ema55Reversals(candles, ema55, 'bullish')).toEqual([2]);
    });

    it('near miss: low stays 0.3% above the 55', () => {
      const candles = series([before, [100.8, 101, 100.3, 100.5], [100.5, 101, 100.4, 100.9]]);
      expect(ema55Reversals(candles, ema55, 'bullish')).toEqual([]);
    });

    it('near miss: next candle closes below the 55', () => {
      const candles = series([before, [100.8, 101, 100.1, 100.2], [100.2, 100.3, 99.7, 99.9]]);
      expect(ema55Reversals(candles, ema55, 'bullish')).toEqual([]);
    });

    it('a candle fully below the 55 followed by a cross up is not a reversal', () => {
      // high 99.7 never reaches the band (≥ 99.8)
      const candles = series([[99, 99.5, 98.5, 99], [99.2, 99.7, 99.0, 99.5], [99.5, 100.6, 99.4, 100.4]]);
      expect(ema55Reversals(candles, ema55, 'bullish')).toEqual([]);
    });
  });

  describe('bearish', () => {
    const above: [number, number, number, number] = [99, 99.5, 98.5, 99];

    it('fires when a wick reaches the band from below and the next close is below the 55', () => {
      const candles = series([above, [99.2, 99.85, 99.0, 99.5], [99.5, 99.6, 98.9, 99.1]]);
      expect(ema55Reversals(candles, ema55, 'bearish')).toEqual([2]);
    });

    it('near miss: high stays 0.3% below the 55', () => {
      const candles = series([above, [99.2, 99.7, 99.0, 99.5], [99.5, 99.6, 98.9, 99.1]]);
      expect(ema55Reversals(candles, ema55, 'bearish')).toEqual([]);
    });

    it('near miss: next candle closes above the 55', () => {
      const candles = series([above, [99.2, 99.9, 99.0, 99.8], [99.8, 100.4, 99.7, 100.2]]);
      expect(ema55Reversals(candles, ema55, 'bearish')).toEqual([]);
    });

    it('a candle fully above the 55 followed by a cross down is not a reversal', () => {
      // low 100.3 never reaches the band (≤ 100.2)
      const candles = series([before, [100.8, 101, 100.3, 100.5], [100.5, 100.6, 99.4, 99.6]]);
      expect(ema55Reversals(candles, ema55, 'bearish')).toEqual([]);
    });
  });

  it('respects a custom tolerance and skips bars without an EMA value', () => {
    const candles = series([before, [100.8, 101, 100.3, 100.5], [100.5, 101, 100.4, 100.9]]);
    expect(ema55Reversals(candles, ema55, 'bullish', 0.004)).toEqual([2]);
    expect(ema55Reversals(candles, [null, null, 100], 'bullish', 0.004)).toEqual([]);
  });
});

describe('dailyEmasInPath', () => {
  it('bullish: lists daily EMAs strictly between entry and target, nearest first', () => {
    expect(dailyEmasInPath({ 13: 105, 48: 110, 55: 98, 200: 120 }, 100, 112, 'bullish')).toEqual([
      { period: 13, value: 105 },
      { period: 48, value: 110 },
    ]);
  });

  it('bearish: lists daily EMAs between target below and entry, nearest first', () => {
    expect(dailyEmasInPath({ 13: 95, 48: 89, 55: 101, 200: 92 }, 100, 90, 'bearish')).toEqual([
      { period: 13, value: 95 },
      { period: 200, value: 92 },
    ]);
  });

  it('ignores EMAs beyond the target and missing values', () => {
    expect(dailyEmasInPath({ 13: null, 48: 115, 55: 99, 200: null }, 100, 112, 'bullish')).toEqual([]);
  });
});

describe('emaTable', () => {
  it('builds one row per supplied time frame in 15m, 30m, 1h, 1d order', () => {
    const up = series(trend(250, 100, 0.5));
    const rows = emaTable({ '1d': up, '15m': up });
    expect(rows.map((r) => r.timeframe)).toEqual(['15m', '1d']);
    const row = rows[0]!;
    expect(row.bars).toBe(250);
    const { 13: e13, 48: e48, 55: e55, 200: e200 } = row.ema;
    expect(e13! > e48! && e48! > e55! && e55! > e200!).toBe(true);
    // Price is above every EMA in a steady uptrend: nearest support is the 13, no resistance.
    expect(row.support?.period).toBe(13);
    expect(row.resistance).toBeNull();
  });

  it('uses a supplied live price instead of the last close', () => {
    const up = series(trend(250, 100, 0.5));
    const row = emaTable({ '1h': up }, 150)[0]!;
    expect(row.price).toBe(150);
    expect(row.support).toBeNull();
    expect(row.resistance?.period).toBe(200);
  });
});
