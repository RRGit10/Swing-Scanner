import { describe, expect, it } from 'vitest';
import { diffSettings, validateSettings } from '../validate.js';
import { DEFAULT_APP_SETTINGS } from '../../scanner/settings.js';

const clone = () => structuredClone(DEFAULT_APP_SETTINGS);

describe('validateSettings', () => {
  it('accepts the defaults unchanged', () => {
    expect(validateSettings(clone())).toEqual({ ok: true, settings: DEFAULT_APP_SETTINGS });
  });

  it('fills fields missing from a partial body from the current settings', () => {
    const r = validateSettings({ contracts: { budget: 750 } }, DEFAULT_APP_SETTINGS);
    expect(r.ok && r.settings.contracts.budget).toBe(750);
    expect(r.ok && r.settings.contracts.minDte).toBe(DEFAULT_APP_SETTINGS.contracts.minDte);
    expect(r.ok && r.settings.watchlist).toEqual(DEFAULT_APP_SETTINGS.watchlist);
  });

  it('normalizes the watchlist: trims, uppercases, removes duplicates', () => {
    const r = validateSettings({ watchlist: [' spy', 'QQQ', 'spy', 'brk.b'] }, DEFAULT_APP_SETTINGS);
    expect(r.ok && r.settings.watchlist).toEqual(['SPY', 'QQQ', 'BRK.B']);
  });

  it.each([
    [{ watchlist: [] }, 'watchlist: add at least 1 ticker'],
    [{ watchlist: ['SPY', 'NOT A TICKER'] }, 'watchlist: "NOT A TICKER" is not a ticker symbol'],
    [{ watchlist: Array.from({ length: 26 }, (_, i) => `A${String.fromCharCode(65 + i)}`) }, 'watchlist: at most 25 tickers'],
    [{ contracts: { budget: 10 } }, 'contracts.budget: must be between 50 and 100000'],
    [{ contracts: { minDte: 2.5 } }, 'contracts.minDte: must be a whole number'],
    [{ contracts: { minDte: 20, maxDte: 10 } }, 'contracts.maxDte: must be at least the minimum days to expiration (20)'],
    [{ contracts: { minOpenInterest: 2000 } }, 'contracts.gradeCMinOpenInterest: must be at least the OI floor (2000)'],
    [{ contracts: { gradeA: 0.3 } }, 'contracts: delta grades must go A > B > C'],
    [{ ema: { reversalTolerance: 0.5 } }, 'ema.reversalTolerance: must be between 0.0001 and 0.05'],
    [{ patterns: { pivotN: 0 } }, 'patterns.pivotN: must be between 1 and 10'],
    [{ patterns: { flagMinBars: 9, flagMaxBars: 8 } }, 'patterns.flagMaxBars: must be at least the minimum flag length (9)'],
    [{ contracts: { budget: 'lots' } }, 'contracts.budget: must be a number'],
  ])('rejects %j', (body, message) => {
    const r = validateSettings(body, DEFAULT_APP_SETTINGS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toContain(message);
  });

  it('ignores unknown fields and never lets scanner timing or rate limits be changed', () => {
    const r = validateSettings({ hack: 1, scanner: { alpacaPerMinute: 10_000 } }, DEFAULT_APP_SETTINGS);
    expect(r.ok && r.settings).toEqual(DEFAULT_APP_SETTINGS);
  });
});

describe('diffSettings', () => {
  it('lists changed paths with old and new values', () => {
    const next = clone();
    next.contracts.budget = 750;
    next.watchlist = ['SPY', 'IWM'];
    expect(diffSettings(DEFAULT_APP_SETTINGS, next)).toEqual([
      { path: 'watchlist', from: DEFAULT_APP_SETTINGS.watchlist, to: ['SPY', 'IWM'] },
      { path: 'contracts.budget', from: 500, to: 750 },
    ]);
  });

  it('is empty when nothing changed', () => {
    expect(diffSettings(DEFAULT_APP_SETTINGS, clone())).toEqual([]);
  });
});
