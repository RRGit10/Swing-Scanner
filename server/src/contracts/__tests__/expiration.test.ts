import { describe, expect, it } from 'vitest';
import { earningsBeforeExpiration, fridayExpirations } from '../expiration.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../types.js';

const s = DEFAULT_CONTRACT_SETTINGS;
// Daily expirations, like SPY: every weekday from 10/26 to 11/30
const DAILY = Array.from({ length: 36 }, (_, i) => new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10)).filter(
  (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()),
);

describe('fridayExpirations', () => {
  it('lists Fridays 3–30 calendar days out, nearest first (today Fri 10/23)', () => {
    expect(fridayExpirations(DAILY, '2026-10-23', s)).toEqual(['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20']);
  });

  it("includes that week's Friday exactly 3 days out (today Tue 10/27)", () => {
    expect(fridayExpirations(DAILY, '2026-10-27', s)[0]).toBe('2026-10-30');
  });

  it('skips a Friday fewer than 3 days out (today Wed 10/28)', () => {
    expect(fridayExpirations(DAILY, '2026-10-28', s)[0]).toBe('2026-11-06');
  });

  it("uses that week's Thursday when the Friday isn't listed (market holiday)", () => {
    expect(fridayExpirations(['2026-10-30', '2026-11-05', '2026-11-13'], '2026-10-23', s)).toEqual([
      '2026-10-30',
      '2026-11-05',
      '2026-11-13',
    ]);
  });

  it('ignores non-Friday expirations and returns [] when no Friday is in range', () => {
    expect(fridayExpirations(['2026-10-27', '2026-10-28'], '2026-10-23', s)).toEqual([]);
    expect(fridayExpirations(['2026-12-18'], '2026-10-23', s)).toEqual([]);
  });
});

describe('earningsBeforeExpiration', () => {
  const ev = (date: string) => ({ symbol: 'AAPL', date, hour: 'amc', epsEstimate: 1 });

  it('flags earnings from today through expiration day', () => {
    expect(earningsBeforeExpiration([ev('2026-10-29')], '2026-10-23', '2026-10-30')).toBe('2026-10-29');
    expect(earningsBeforeExpiration([ev('2026-10-30')], '2026-10-23', '2026-10-30')).toBe('2026-10-30');
    expect(earningsBeforeExpiration([ev('2026-10-23')], '2026-10-23', '2026-10-30')).toBe('2026-10-23');
  });

  it('ignores earnings after expiration or before today', () => {
    expect(earningsBeforeExpiration([ev('2026-10-31'), ev('2026-10-22')], '2026-10-23', '2026-10-30')).toBeNull();
  });
});
