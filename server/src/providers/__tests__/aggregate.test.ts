import { describe, expect, it } from 'vitest';
import { aggregate15m, filterRegularHours } from '../aggregate.js';
import type { Candle } from '../types.js';

// Unix seconds for an ET wall-clock time. utcOffset is -4 (EDT) or -5 (EST).
function et(date: string, hhmm: string, utcOffset: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, h - utcOffset, mi) / 1000;
}

// 15m bars at consecutive slots; bar i has open=i, close=i+0.5, high=i+1, low=i-1, volume=100.
function bars(date: string, startHhmm: string, count: number, utcOffset: number, base = 0): Candle[] {
  const start = et(date, startHhmm, utcOffset);
  return Array.from({ length: count }, (_, i) => {
    const v = base + i;
    return { time: start + i * 900, open: v, high: v + 1, low: v - 1, close: v + 0.5, volume: 100 };
  });
}

describe('filterRegularHours', () => {
  it('keeps 9:30–15:45 bar starts and drops pre/post-market bars', () => {
    const all = bars('2026-10-23', '09:00', 30, -4); // 09:00 .. 16:15
    const rth = filterRegularHours(all);
    expect(rth[0]!.time).toBe(et('2026-10-23', '09:30', -4));
    expect(rth.at(-1)!.time).toBe(et('2026-10-23', '15:45', -4));
    expect(rth).toHaveLength(26);
  });
});

describe('aggregate15m', () => {
  const day = bars('2026-10-23', '09:30', 26, -4); // full regular session

  it('builds 13 half-hour bars anchored at 9:30', () => {
    const out = aggregate15m(day, '30m');
    expect(out).toHaveLength(13);
    expect(out[0]).toEqual({ time: et('2026-10-23', '09:30', -4), open: 0, high: 2, low: -1, close: 1.5, volume: 200 });
    expect(out[1]!.time).toBe(et('2026-10-23', '10:00', -4));
  });

  it('builds hourly bars anchored at 9:30 with a partial 15:30 bar', () => {
    const out = aggregate15m(day, '1h');
    expect(out).toHaveLength(7);
    expect(out[0]).toEqual({ time: et('2026-10-23', '09:30', -4), open: 0, high: 4, low: -1, close: 3.5, volume: 400 });
    expect(out[1]!.time).toBe(et('2026-10-23', '10:30', -4));
    const last = out.at(-1)!;
    expect(last.time).toBe(et('2026-10-23', '15:30', -4));
    expect(last.volume).toBe(200); // 15:30 + 15:45 only
  });

  it('drops extended-hours bars before bucketing', () => {
    const withPre = [...bars('2026-10-23', '09:00', 2, -4, 100), ...day];
    const out = aggregate15m(withPre, '1h');
    expect(out[0]!.time).toBe(et('2026-10-23', '09:30', -4));
    expect(out[0]!.open).toBe(0);
  });

  it('anchors at 9:30 ET after the DST change (EST)', () => {
    const nov = bars('2026-11-02', '09:30', 4, -5);
    const out = aggregate15m(nov, '1h');
    expect(out).toHaveLength(1);
    expect(out[0]!.time).toBe(et('2026-11-02', '09:30', -5));
  });

  it('never merges bars from different days and returns ascending order', () => {
    const twoDays = [...bars('2026-10-23', '15:30', 2, -4, 0), ...bars('2026-10-26', '09:30', 2, -4, 50)].reverse();
    const out = aggregate15m(twoDays, '1h');
    expect(out.map((c) => c.time)).toEqual([et('2026-10-23', '15:30', -4), et('2026-10-26', '09:30', -4)]);
    expect(out[1]!.open).toBe(50);
  });

  it('handles a gap inside an hour (missing 15m bar)', () => {
    const gappy = day.filter((_, i) => i !== 1); // drop 09:45
    const out = aggregate15m(gappy, '1h');
    expect(out[0]!.volume).toBe(300);
    expect(out[0]!.open).toBe(0);
    expect(out[0]!.close).toBe(3.5);
  });
});
