import { describe, expect, it } from 'vitest';
import { inLiquidWindow, isMarketOpen, liquidWindows, lowerQuality, nextScanTime } from '../timing.js';
import { DEFAULT_SCANNER_SETTINGS } from '../../scanner/settings.js';

const FULL = { date: '2026-10-26', open: '09:30', close: '16:00' }; // Monday, EDT (UTC−4)
const HALF = { date: '2026-11-27', open: '09:30', close: '13:00' }; // day after Thanksgiving, EST (UTC−5)
const s = DEFAULT_SCANNER_SETTINGS;

function et(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const offset = date >= '2026-11-01' ? -5 : -4;
  return Date.UTC(y, m - 1, d, h - offset, mi) / 1000;
}

describe('liquidWindows', () => {
  it('full day: 9:30–11:30 and 15:00–16:00', () => {
    expect(liquidWindows(FULL)).toEqual([{ start: 570, end: 690 }, { start: 900, end: 960 }]);
  });

  it('half day: 9:30–11:30 and the final hour before the early close', () => {
    expect(liquidWindows(HALF)).toEqual([{ start: 570, end: 690 }, { start: 720, end: 780 }]);
  });
});

describe('isMarketOpen', () => {
  it.each([
    ['09:29', false], ['09:30', true], ['15:59', true], ['16:00', false],
  ])('full day %s → %s', (t, open) => {
    expect(isMarketOpen(et(FULL.date, t), FULL)).toBe(open);
  });

  it('half day closes at 13:00; holidays (no trading day) are closed', () => {
    expect(isMarketOpen(et(HALF.date, '12:59'), HALF)).toBe(true);
    expect(isMarketOpen(et(HALF.date, '13:00'), HALF)).toBe(false);
    expect(isMarketOpen(et('2026-11-26', '11:00'), undefined)).toBe(false);
  });

  it('is closed when the trading day is a different date', () => {
    expect(isMarketOpen(et('2026-10-27', '10:00'), FULL)).toBe(false);
  });
});

describe('inLiquidWindow', () => {
  it('scan mode: start inclusive, end exclusive', () => {
    expect(inLiquidWindow(et(FULL.date, '09:30'), FULL, 'scan')).toBe(true);
    expect(inLiquidWindow(et(FULL.date, '11:30'), FULL, 'scan')).toBe(false);
    expect(inLiquidWindow(et(FULL.date, '15:00'), FULL, 'scan')).toBe(true);
  });

  it('close mode: a candle closing exactly at 11:30 or 15:00 counts as inside', () => {
    expect(inLiquidWindow(et(FULL.date, '11:30'), FULL, 'close')).toBe(true);
    expect(inLiquidWindow(et(FULL.date, '15:00'), FULL, 'close')).toBe(true);
    expect(inLiquidWindow(et(FULL.date, '11:45'), FULL, 'close')).toBe(false);
  });
});

describe('nextScanTime', () => {
  it.each([
    ['10:00', '10:02'], // liquid: every 2 min
    ['12:00', '12:10'], // other hours: every 10 min
    ['14:55', '15:00'], // 10-min wait never skips past a window start
    ['09:00', '09:30'], // before the open → the open
  ])('full day %s → %s', (now, next) => {
    expect(nextScanTime(et(FULL.date, now), FULL, s)).toBe(et(FULL.date, next));
  });

  it('no scan at or after the close', () => {
    expect(nextScanTime(et(FULL.date, '15:58'), FULL, s)).toBeNull();
    expect(nextScanTime(et(FULL.date, '17:00'), FULL, s)).toBeNull();
  });

  it('half day: 11:55 → 12:00 (closing window), 12:58 → none', () => {
    expect(nextScanTime(et(HALF.date, '11:55'), HALF, s)).toBe(et(HALF.date, '12:00'));
    expect(nextScanTime(et(HALF.date, '12:58'), HALF, s)).toBeNull();
  });

  it('holiday → none', () => {
    expect(nextScanTime(et('2026-11-26', '10:00'), undefined, s)).toBeNull();
  });
});

describe('lowerQuality (trigger candle close time)', () => {
  it.each([
    ['09:45', false], ['11:30', false], ['11:45', true], ['14:45', true], ['15:00', false], ['16:00', false],
  ])('full day close %s → lower quality %s', (t, lq) => {
    expect(lowerQuality(et(FULL.date, t), FULL)).toBe(lq);
  });

  it('half day: 12:30 is in the closing window', () => {
    expect(lowerQuality(et(HALF.date, '12:30'), HALF)).toBe(false);
    expect(lowerQuality(et(HALF.date, '11:45'), HALF)).toBe(true);
  });
});
