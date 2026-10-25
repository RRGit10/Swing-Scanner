import { describe, expect, it } from 'vitest';
import { evaluateOutcome, exitQuote, expirationCloseUnix, gainPct } from '../outcome.js';
import { DEFAULT_SCANNER_SETTINGS } from '../../scanner/settings.js';
import type { Candle } from '../../providers/types.js';

const s = DEFAULT_SCANNER_SETTINGS;
const T0 = Date.parse('2026-10-26T10:00:00-04:00') / 1000; // trigger candle close, Monday
const EXP = expirationCloseUnix('2026-10-30');
const min = (offsetMin: number, high: number, low: number, close = (high + low) / 2): Candle => ({
  time: T0 + offsetMin * 60, open: close, high, low, close, volume: 1,
});
/** 15m bar starting `startOffsetMin` after T0 (closes 15 min later). */
const bar15 = (startOffsetMin: number, close: number): Candle => ({
  time: T0 + startOffsetMin * 60, open: close, high: close + 0.1, low: close - 0.1, close, volume: 1,
});

const bull = { direction: 'bullish' as const, t1: 105, invalidation: 98, fromTime: T0, expirationClose: EXP, tradingTfMinutes: 15 };
const bear = { direction: 'bearish' as const, t1: 95, invalidation: 102, fromTime: T0, expirationClose: EXP, tradingTfMinutes: 15 };
const later = EXP + 3600;

describe('expirationCloseUnix', () => {
  it('is 16:00 ET on the expiration date', () => {
    expect(expirationCloseUnix('2026-10-30')).toBe(Date.parse('2026-10-30T16:00:00-04:00') / 1000);
    expect(expirationCloseUnix('2026-11-27', '13:00')).toBe(Date.parse('2026-11-27T13:00:00-05:00') / 1000);
  });
});

describe('evaluateOutcome', () => {
  it('win: first 1-min high touching T1', () => {
    const out = evaluateOutcome(bull, [min(5, 103, 102), min(30, 105.02, 104), min(31, 106, 105)], [], T0 + 3600);
    expect(out).toEqual({ kind: 'win', at: T0 + 30 * 60 });
  });

  it('loss: a trading-chart close beyond invalidation before any T1 touch', () => {
    const out = evaluateOutcome(bull, [min(50, 105.5, 104)], [bar15(15, 99), bar15(30, 97.9)], T0 + 7200);
    expect(out).toEqual({ kind: 'loss', at: T0 + 45 * 60 }); // the 10:30 bar closes at 10:45
  });

  it('touch inside the same 15m bar that later closes beyond invalidation → win (the touch came first)', () => {
    const out = evaluateOutcome(bull, [min(17, 105.1, 104)], [bar15(15, 97.5)], T0 + 7200);
    expect(out).toEqual({ kind: 'win', at: T0 + 17 * 60 });
  });

  it('bearish mirror: low ≤ T1 wins, close above invalidation loses', () => {
    expect(evaluateOutcome(bear, [min(20, 97, 94.99)], [], T0 + 3600)).toEqual({ kind: 'win', at: T0 + 20 * 60 });
    expect(evaluateOutcome(bear, [], [bar15(0, 102.2)], T0 + 3600)).toEqual({ kind: 'loss', at: T0 + 15 * 60 });
  });

  it('expired: neither by the expiration close (once data has settled)', () => {
    expect(evaluateOutcome(bull, [min(10, 104, 103)], [bar15(0, 101)], later)).toEqual({ kind: 'expired', at: EXP });
  });

  it('still open before expiration, and right after the close while delayed data catches up', () => {
    expect(evaluateOutcome(bull, [min(10, 104, 103)], [], T0 + 3600)).toBeNull();
    expect(evaluateOutcome(bull, [], [], EXP + 5 * 60)).toBeNull();
  });

  it('ignores bars before fromTime (backfill continues from the last tracked time) and after expiration', () => {
    const from = { ...bull, fromTime: T0 + 60 * 60 };
    expect(evaluateOutcome(from, [min(10, 106, 105)], [], T0 + 7200)).toBeNull();
    const afterExp: Candle = { time: EXP + 60, open: 0, high: 200, low: 0, close: 0, volume: 1 };
    expect(evaluateOutcome(bull, [afterExp], [], later)).toEqual({ kind: 'expired', at: EXP });
  });
});

describe('exitQuote (first snapshot at/after the hit)', () => {
  const hit = T0 + 1800;
  const snap = (quoteOffsetSec: number) => ({ bid: 3.1, ask: 3.2, quoteTime: new Date((hit + quoteOffsetSec) * 1000).toISOString() });

  it('accepts a quote at or shortly after the hit', () => {
    expect(exitQuote(snap(0), hit, hit + 960, s)).toEqual({ kind: 'ok', bid: 3.1, ask: 3.2, quoteTime: snap(0).quoteTime });
    expect(exitQuote(snap(14 * 60), hit, hit + 1800, s).kind).toBe('ok');
  });

  it('waits while the delayed quote is still from before the hit', () => {
    expect(exitQuote(snap(-600), hit, hit + 300, s)).toEqual({ kind: 'wait' });
    expect(exitQuote(null, hit, hit + 300, s)).toEqual({ kind: 'wait' });
  });

  it('missed when the first quote seen is long after the hit, or none arrives in time', () => {
    expect(exitQuote(snap(16 * 60), hit, hit + 3600, s)).toEqual({ kind: 'missed' });
    expect(exitQuote(snap(-600), hit, hit + 3 * 3600, s)).toEqual({ kind: 'missed' });
    expect(exitQuote(null, hit, hit + 3 * 3600, s)).toEqual({ kind: 'missed' });
  });
});

describe('gainPct', () => {
  it('= (exit bid − entry ask) / entry ask', () => {
    expect(gainPct(6, 4)).toBeCloseTo(50, 10);
    expect(gainPct(2, 4)).toBeCloseTo(-50, 10);
  });
});
