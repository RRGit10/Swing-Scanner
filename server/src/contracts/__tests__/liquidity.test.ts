import { describe, expect, it } from 'vitest';
import { liquidity, previousSessionDate } from '../liquidity.js';
import { opt } from '../__fixtures__/chains.js';

const PREV = '2026-10-23'; // Friday, the session before Monday 10/26
const MON = { dayBarDate: '2026-10-26' }; // during Monday's session the day bar is Monday's

describe('liquidity', () => {
  it('fresh OI (dated the previous session or later): OI only, unchanged', () => {
    const c = opt({ type: 'call', strike: 215, openInterest: 35356, openInterestDate: '2026-10-23', prevDayVolume: 90000, prevDayBarDate: PREV , ...MON });
    expect(liquidity(c, PREV)).toEqual({ value: 35356, source: 'oi', stale: false, openInterest: 35356, openInterestDate: '2026-10-23', volume: null, volumeDate: null });
  });

  it('stale OI: the larger of OI and the previous session volume (the NVDA 215C case)', () => {
    const c = opt({ type: 'call', strike: 215, openInterest: 5429, openInterestDate: '2026-10-22', prevDayVolume: 46519, prevDayBarDate: PREV , ...MON });
    expect(liquidity(c, PREV)).toMatchObject({ value: 46519, source: 'volume', stale: true, openInterest: 5429, volume: 46519, volumeDate: PREV });
  });

  it('stale OI larger than the volume: OI is used, still flagged stale', () => {
    const c = opt({ type: 'call', strike: 217.5, openInterest: 23035, openInterestDate: '2026-10-22', prevDayVolume: 900, prevDayBarDate: PREV , ...MON });
    expect(liquidity(c, PREV)).toMatchObject({ value: 23035, source: 'oi', stale: true, volume: 900 });
  });

  it("uses the day bar's volume when the day bar itself is the previous session (before today's first trade)", () => {
    const c = opt({ type: 'call', strike: 215, openInterest: 50, openInterestDate: '2026-10-22', volume: 4000, dayBarDate: PREV, prevDayVolume: 10, prevDayBarDate: '2026-10-22' });
    expect(liquidity(c, PREV)).toMatchObject({ value: 4000, source: 'volume', volumeDate: PREV });
  });

  it('volume from any other session is not used', () => {
    const c = opt({ type: 'call', strike: 215, openInterest: 50, openInterestDate: '2026-10-22', volume: 9000, dayBarDate: '2026-10-26', prevDayVolume: 8000, prevDayBarDate: '2026-10-21' });
    expect(liquidity(c, PREV)).toMatchObject({ value: 50, source: 'oi', stale: true, volume: null });
  });

  it('missing OI counts as stale', () => {
    const c = opt({ type: 'call', strike: 215, openInterest: 0, openInterestDate: null, prevDayVolume: 300, prevDayBarDate: PREV , ...MON });
    expect(liquidity(c, PREV)).toMatchObject({ value: 300, source: 'volume', stale: true });
  });

  it('unknown previous session: OI as is', () => {
    expect(liquidity(opt({ type: 'call', strike: 1, openInterest: 70, openInterestDate: '2026-10-01' }), null)).toMatchObject({ value: 70, stale: false });
  });
});

describe('previousSessionDate', () => {
  const days = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => ({ date, open: '09:30', close: '16:00' }));
  it('the trading day before the session (Monday → Friday), or null when unknown', () => {
    expect(previousSessionDate(days, '2026-10-26')).toBe('2026-10-23');
    expect(previousSessionDate(days, '2026-10-22')).toBe('2026-10-21');
    expect(previousSessionDate(days, '2026-10-21')).toBeNull();
  });
});
