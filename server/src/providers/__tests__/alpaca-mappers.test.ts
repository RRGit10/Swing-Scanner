import { describe, expect, it } from 'vitest';
import { mapBars } from '../alpaca/candles.js';
import { joinOpenInterest, mapContracts, mapExpirations, mapSnapshots, parseOcc } from '../alpaca/options.js';
import bars15 from '../__fixtures__/alpaca-bars-15min.json';
import barsDaily from '../__fixtures__/alpaca-bars-daily.json';
import snapshots from '../__fixtures__/alpaca-snapshots.json';
import contracts from '../__fixtures__/alpaca-contracts.json';

describe('mapBars', () => {
  it('maps intraday bars to unix seconds of the bar start', () => {
    expect(mapBars(bars15, 'SPY', '15Min')).toEqual([
      { time: 1792762200, open: 580.0, high: 581.2, low: 579.5, close: 580.9, volume: 1200000 },
      { time: 1792763100, open: 580.9, high: 581.6, low: 580.2, close: 581.3, volume: 900000 },
    ]);
  });

  it('maps daily bars (stamped midnight ET) to 00:00 UTC of the ET trading date', () => {
    const out = mapBars(barsDaily, 'SPY', '1Day');
    expect(out.map((c) => c.time)).toEqual([Date.UTC(2026, 9, 22) / 1000, Date.UTC(2026, 9, 23) / 1000]);
    expect(out[1]).toMatchObject({ open: 580.0, high: 583.4, low: 579.5, close: 582.7, volume: 58000000 });
  });

  it('returns [] when the symbol has no bars', () => {
    expect(mapBars({ bars: {}, next_page_token: null }, 'SPY', '15Min')).toEqual([]);
    expect(mapBars({ bars: null }, 'SPY', '15Min')).toEqual([]);
    expect(mapBars(bars15, 'QQQ', '15Min')).toEqual([]);
  });
});

describe('parseOcc', () => {
  it('parses calls, puts and fractional strikes', () => {
    expect(parseOcc('SPY261106C00580000')).toEqual({ underlying: 'SPY', expiration: '2026-11-06', type: 'call', strike: 580 });
    expect(parseOcc('SPY261106P00570500')).toEqual({ underlying: 'SPY', expiration: '2026-11-06', type: 'put', strike: 570.5 });
    expect(parseOcc('GOOGL261120C00175000')).toMatchObject({ underlying: 'GOOGL', strike: 175 });
  });

  it('returns null for non-OCC symbols', () => {
    expect(parseOcc('SPY')).toBeNull();
    expect(parseOcc('SPY261106X00580000')).toBeNull();
  });
});

describe('mapSnapshots', () => {
  const out = mapSnapshots(snapshots);
  const call = out.find((c) => c.type === 'call')!;
  const put = out.find((c) => c.type === 'put')!;

  it('maps quote, trade, daily bar and greeks', () => {
    expect(call).toEqual({
      symbol: 'SPY261106C00580000',
      underlying: 'SPY',
      type: 'call',
      strike: 580,
      expiration: '2026-11-06',
      bid: 9.8,
      ask: 9.9,
      last: 9.85,
      dayLow: 8.6,
      dayHigh: 10.4,
      dayBarDate: '2026-10-23',
      volume: 4210,
      prevDayVolume: 3900,
      prevDayBarDate: '2026-10-22',
      openInterest: 0,
      openInterestDate: null,
      delta: 0.5712,
      gamma: 0.0281,
      theta: -0.312,
      iv: 0.173,
      quoteTime: '2026-10-23T19:59:58.123Z',
    });
  });

  it('keeps missing trade, daily bar and greeks as null instead of 0', () => {
    expect(put).toMatchObject({
      strike: 570.5,
      bid: 3.1,
      ask: 3.2,
      last: null,
      dayLow: null,
      dayHigh: null,
      dayBarDate: null,
      volume: 0,
      prevDayVolume: null,
      prevDayBarDate: null,
      delta: null,
      gamma: null,
      theta: null,
      iv: null,
    });
  });

  it('returns [] for an empty snapshot map', () => {
    expect(mapSnapshots({ snapshots: {} })).toEqual([]);
    expect(mapSnapshots({})).toEqual([]);
  });
});

describe('mapContracts / mapExpirations', () => {
  const list = mapContracts(contracts);

  it('parses open interest strings to numbers and keeps missing as null', () => {
    expect(list[0]).toEqual({
      symbol: 'SPY261106C00580000',
      expiration: '2026-11-06',
      openInterest: 15320,
      openInterestDate: '2026-10-22',
    });
    expect(list[1]!.openInterest).toBeNull();
  });

  it('lists unique expirations in ascending order', () => {
    expect(mapExpirations(list)).toEqual(['2026-10-30', '2026-11-06']);
  });

  it('returns [] for no contracts', () => {
    expect(mapContracts({ option_contracts: [] })).toEqual([]);
    expect(mapContracts({})).toEqual([]);
  });
});

describe('joinOpenInterest', () => {
  it('fills open interest by OCC symbol and defaults unknown contracts to 0', () => {
    const joined = joinOpenInterest(mapSnapshots(snapshots), mapContracts(contracts));
    const call = joined.find((c) => c.symbol === 'SPY261106C00580000')!;
    const put = joined.find((c) => c.symbol === 'SPY261106P00570500')!;
    expect(call.openInterest).toBe(15320);
    expect(call.openInterestDate).toBe('2026-10-22');
    expect(put.openInterest).toBe(0);
    expect(put.openInterestDate).toBeNull();
  });
});
