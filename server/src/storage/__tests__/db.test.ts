import { describe, expect, it } from 'vitest';
import { ScannerDb } from '../db.js';
import { applyScan, type SignalSnapshot } from '../../history/signals.js';

const NOW = 1_800_000_000;
const snap = (over: Partial<SignalSnapshot> = {}): SignalSnapshot => ({
  key: 'SPY|double_top|bearish|1', ticker: 'SPY', type: 'double_top', direction: 'bearish', timeframes: ['15m'],
  tradingTimeframe: '15m', state: 'armed', status: 'WATCH', lowerQuality: false, triggerTime: null, triggerLevel: 758.68,
  invalidation: 764.07, targets: [{ kind: 'pattern', label: 'Pattern target', price: 753.59 }],
  contract: { symbol: 'SPY261030P00756000', ask: 4.97, expiration: '2026-10-30' }, horizonExpiration: '2026-10-30', settingsVersion: 1, ...over,
});

describe('ScannerDb (in-memory)', () => {
  it('saves scans and returns the latest payload', () => {
    const db = new ScannerDb(':memory:');
    expect(db.latestScan()).toBeNull();
    db.saveScan({ startedAt: NOW, finishedAt: NOW + 5, market: 'open', sessionDate: '2026-10-26', payload: { tickers: [1] }, errors: [] });
    db.saveScan({ startedAt: NOW + 120, finishedAt: NOW + 125, market: 'open', sessionDate: '2026-10-26', payload: { tickers: [2] }, errors: ['x'] });
    expect(db.latestScan()).toMatchObject({ startedAt: NOW + 120, market: 'open', payload: { tickers: [2] }, errors: ['x'] });
  });

  it('inserts, updates and reads signals by key, with all fields round-tripped', () => {
    const db = new ScannerDb(':memory:');
    const { row, events } = applyScan(null, snap(), NOW);
    const id = db.upsertSignal(row);
    db.addEvents(id, events);
    const trig = applyScan(db.getSignal(row.key)!, snap({ state: 'triggered', status: 'READY', triggerTime: NOW + 60 }), NOW + 120);
    expect(db.upsertSignal(trig.row)).toBe(id);
    db.addEvents(id, trig.events);

    const saved = db.getSignal(row.key)!;
    expect(saved).toMatchObject({ id, status: 'READY', frozenT1: 753.59, outcome: 'pending', timeframes: ['15m'], lowerQuality: false });
    expect(saved.targets).toEqual(snap().targets);
    expect(db.events(id).map((e) => e.kind)).toEqual(['first_seen', 'status', 'triggered']);
    expect(db.pendingOutcomes().map((r) => r.key)).toEqual([row.key]);
    expect(db.activeSignals().map((r) => r.key)).toEqual([row.key]);
  });

  it('per-pattern summaries filter by type', () => {
    const db = new ScannerDb(':memory:');
    const mk = (key: string, type: string, outcome: string) => db.upsertSignal({ ...applyScan(null, snap({ key, type: type as never }), NOW).row, outcome: outcome as never });
    mk('a', 'bull_flag', 'win');
    mk('b', 'bull_flag', 'loss');
    mk('c', 'double_bottom', 'win');
    expect(db.historyByPattern()).toMatchObject({
      bull_flag: { pattern: { resolved: 2, wins: 1, hitRate: 0.5 } },
      double_bottom: { pattern: { resolved: 1, wins: 1, hitRate: 1 } },
    });
    expect(Object.keys(db.historyByPattern(99))).toEqual([]);
  });

  it('history summary: pattern hit rate (all triggered, stock outcome) and tradeable hit rate (with a contract)', () => {
    const db = new ScannerDb(':memory:');
    const mk = (key: string, outcome: string, contract: string | null, gainPct: number | null) => {
      const r = applyScan(null, snap({ key }), NOW).row;
      db.upsertSignal({ ...r, outcome: outcome as never, frozenContract: contract, gainPct });
    };
    mk('a', 'win', 'C1', 50);
    mk('b', 'win', 'C2', null); // exit quote missed
    mk('c', 'loss', 'C3', -40);
    mk('d', 'expired', 'C4', null);
    mk('e', 'win', null, null); // stock outcome only
    mk('f', 'loss', null, null);
    mk('g', 'never_triggered', null, null);
    mk('h', 'pending', 'C5', null);
    mk('i', 'no_contract', null, null);
    mk('j', 'already_resolved', 'C6', null); // excluded from both hit rates
    expect(db.historySummary()).toEqual({
      total: 10, triggered: 7, pending: 1, neverTriggered: 1, noContract: 1, alreadyResolved: 1,
      pattern: { resolved: 6, wins: 3, losses: 2, expired: 1, hitRate: 0.5 },
      tradeable: { resolved: 4, wins: 2, losses: 1, expired: 1, hitRate: 0.5, avgGainPct: 5, gainSamples: 2 },
    });
  });
});
