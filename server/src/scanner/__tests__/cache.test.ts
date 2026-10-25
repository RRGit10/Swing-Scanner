import { describe, expect, it } from 'vitest';
import { CandleCache, DailyMemo } from '../cache.js';
import type { Candle, CandleProvider, CandleRange, Timeframe } from '../../providers/types.js';

const bar = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 });

class FakeCandles implements CandleProvider {
  calls: { timeframe: Timeframe; start?: number }[] = [];
  constructor(public bars: Candle[], public daily: Candle[] = []) {}
  async getCandles(_symbol: string, timeframe: Timeframe, range: CandleRange = {}) {
    this.calls.push({ timeframe, start: range.start ? range.start.getTime() / 1000 : undefined });
    if (timeframe === '1d') return this.daily;
    const from = range.start ? range.start.getTime() / 1000 : -Infinity;
    return this.bars.filter((b) => b.time >= from);
  }
  async getMinuteBars() {
    return [];
  }
}

describe('CandleCache.get15m', () => {
  it('fetches full history once, then only from the last cached bar, replacing it', async () => {
    const fake = new FakeCandles([bar(900, 1), bar(1800, 2), bar(2700, 3)]);
    const cache = new CandleCache(fake);
    expect((await cache.get15m('SPY')).map((b) => b.close)).toEqual([1, 2, 3]);
    expect(fake.calls[0]!.start).toBeUndefined();

    // the last bar was partial and gets corrected; a new bar appears
    fake.bars = [bar(900, 1), bar(1800, 2), bar(2700, 3.5), bar(3600, 4)];
    expect((await cache.get15m('SPY')).map((b) => b.close)).toEqual([1, 2, 3.5, 4]);
    expect(fake.calls[1]!.start).toBe(2700);
  });

  it('keeps symbols separate', async () => {
    const fake = new FakeCandles([bar(900, 1)]);
    const cache = new CandleCache(fake);
    await cache.get15m('SPY');
    await cache.get15m('QQQ');
    expect(fake.calls.map((c) => c.start)).toEqual([undefined, undefined]);
  });
});

describe('CandleCache.getDaily / DailyMemo', () => {
  it('fetches daily bars once per ET date', async () => {
    const fake = new FakeCandles([], [bar(86_400, 10)]);
    const cache = new CandleCache(fake);
    await cache.getDaily('SPY', '2026-10-26');
    await cache.getDaily('SPY', '2026-10-26');
    await cache.getDaily('SPY', '2026-10-27');
    expect(fake.calls.filter((c) => c.timeframe === '1d')).toHaveLength(2);
  });

  it('DailyMemo caches per key and date, and does not cache failures', async () => {
    const memo = new DailyMemo<number>();
    let n = 0;
    const load = async () => ++n;
    expect(await memo.get('a', '2026-10-26', load)).toBe(1);
    expect(await memo.get('a', '2026-10-26', load)).toBe(1);
    expect(await memo.get('b', '2026-10-26', load)).toBe(2);
    expect(await memo.get('a', '2026-10-27', load)).toBe(3);
    await expect(memo.get('c', '2026-10-26', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await memo.get('c', '2026-10-26', load)).toBe(4);
  });
});
