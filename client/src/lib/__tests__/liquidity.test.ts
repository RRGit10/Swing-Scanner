import { describe, expect, it } from 'vitest';
import { liquidityText } from '../liquidity';

const base = { openInterest: 5429, openInterestDate: '2026-10-22', volume: null, volumeDate: null };

describe('liquidityText', () => {
  it('fresh OI: count and date, not stale', () => {
    expect(liquidityText({ ...base, value: 35356, source: 'oi', stale: false, openInterest: 35356, openInterestDate: '2026-10-23' })).toEqual({
      text: 'OI 35,356 (Fri Oct 23)',
      stale: null,
    });
  });

  it('stale OI, previous-session volume used', () => {
    expect(liquidityText({ ...base, value: 46519, source: 'volume', stale: true, volume: 46519, volumeDate: '2026-10-23' })).toEqual({
      text: 'Liquidity: Fri volume 46,519, OI 5,429',
      stale: 'OI stale (Thu Oct 22)',
    });
  });

  it('stale OI larger than the volume', () => {
    expect(liquidityText({ ...base, value: 23035, source: 'oi', stale: true, openInterest: 23035, volume: 900, volumeDate: '2026-10-23' })).toEqual({
      text: 'Liquidity: OI 23,035 (Fri volume 900)',
      stale: 'OI stale (Thu Oct 22)',
    });
  });

  it('no OI figure at all', () => {
    expect(liquidityText({ ...base, value: 300, source: 'volume', stale: true, openInterest: 0, openInterestDate: null, volume: 300, volumeDate: '2026-10-23' })).toEqual({
      text: 'Liquidity: Fri volume 300, OI 0',
      stale: 'no OI figure',
    });
  });
});
