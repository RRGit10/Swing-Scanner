import { describe, expect, it } from 'vitest';
import { mapQuote } from '../finnhub/quote.js';
import { mapEarnings } from '../finnhub/earnings.js';
import { mapLogoUrl } from '../finnhub/profile.js';
import profile from '../__fixtures__/finnhub-profile.json';
import quote from '../__fixtures__/finnhub-quote.json';
import earnings from '../__fixtures__/finnhub-earnings.json';

describe('mapQuote', () => {
  it('maps Finnhub short field names', () => {
    expect(mapQuote('SPY', quote)).toEqual({
      symbol: 'SPY',
      price: 582.7,
      open: 580.0,
      high: 583.4,
      low: 579.5,
      prevClose: 579.1,
      change: 3.6,
      changePercent: 0.6217,
      time: 1792785600,
    });
  });

  it('throws on the all-zero response Finnhub returns for unknown symbols', () => {
    const empty = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 };
    expect(() => mapQuote('NOPE', empty)).toThrow(/no quote/i);
  });
});

describe('mapEarnings', () => {
  it('maps events and keeps a missing estimate as null', () => {
    expect(mapEarnings(earnings)).toEqual([
      { symbol: 'AAPL', date: '2026-10-29', hour: 'amc', epsEstimate: 1.62 },
      { symbol: 'AAPL', date: '2026-11-02', hour: '', epsEstimate: null },
    ]);
  });

  it('returns [] when there is no calendar', () => {
    expect(mapEarnings({ earningsCalendar: [] })).toEqual([]);
    expect(mapEarnings({})).toEqual([]);
  });
});

describe('mapLogoUrl (/stock/profile2)', () => {
  it('returns the logo URL for a stock', () => {
    expect(mapLogoUrl(profile)).toBe('https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png');
  });

  it('returns null for an ETF (Finnhub answers {}) or an empty logo', () => {
    expect(mapLogoUrl({})).toBeNull();
    expect(mapLogoUrl({ ...profile, logo: '' })).toBeNull();
    expect(mapLogoUrl(null)).toBeNull();
  });
});
