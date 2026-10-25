import { describe, expect, it } from 'vitest';
import { lastSessionDate, mapCalendar, mapClock } from '../clock.js';

describe('mapClock', () => {
  it('maps Alpaca /v2/clock', () => {
    expect(
      mapClock({
        timestamp: '2026-10-25T12:00:01.5-04:00',
        is_open: false,
        next_open: '2026-10-26T09:30:00-04:00',
        next_close: '2026-10-26T16:00:00-04:00',
      }),
    ).toEqual({
      isOpen: false,
      timestamp: Date.parse('2026-10-25T12:00:01.5-04:00') / 1000,
      nextOpen: Date.parse('2026-10-26T09:30:00-04:00') / 1000,
      nextClose: Date.parse('2026-10-26T16:00:00-04:00') / 1000,
    });
  });
});

describe('mapCalendar', () => {
  it('maps trading days, keeping early closes', () => {
    expect(
      mapCalendar([
        { date: '2026-11-25', open: '09:30', close: '16:00', session_open: '0400', session_close: '2000', settlement_date: '2026-11-27' },
        { date: '2026-11-27', open: '09:30', close: '13:00', session_open: '0400', session_close: '1700', settlement_date: '2026-11-30' },
      ]),
    ).toEqual([
      { date: '2026-11-25', open: '09:30', close: '16:00' },
      { date: '2026-11-27', open: '09:30', close: '13:00' },
    ]);
  });

  it('returns [] for a non-array body', () => {
    expect(mapCalendar(null)).toEqual([]);
  });
});

describe('lastSessionDate', () => {
  const days = [
    { date: '2026-10-22', open: '09:30', close: '16:00' },
    { date: '2026-10-23', open: '09:30', close: '16:00' },
    { date: '2026-10-26', open: '09:30', close: '16:00' },
  ];

  it('weekend → the Friday', () => {
    expect(lastSessionDate(days, Date.parse('2026-10-25T12:00:00-04:00') / 1000)).toBe('2026-10-23');
  });

  it('during a session → today; before the open → the previous session', () => {
    expect(lastSessionDate(days, Date.parse('2026-10-26T10:00:00-04:00') / 1000)).toBe('2026-10-26');
    expect(lastSessionDate(days, Date.parse('2026-10-26T08:00:00-04:00') / 1000)).toBe('2026-10-23');
  });
});
