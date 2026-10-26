import { describe, expect, it } from 'vitest';
import { reevaluateHistory } from '../reevaluate.js';
import { applyScan, type SignalRow } from '../signals.js';
import { ScannerDb } from '../../storage/db.js';

const FRI_CLOSE = Date.parse('2026-10-23T16:00:00-04:00') / 1000;
const MON = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00-04:00`) / 1000;

/** A row as the old code stored it: triggered Fri, first seen Mon 10:43, tracked from the trigger. */
function oldRow(db: ScannerDb, key: string, over: Partial<SignalRow>): number {
  const { row } = applyScan(null, {
    key, ticker: key, type: 'bear_flag', direction: 'bearish', timeframes: ['1h'], tradingTimeframe: '1h', state: 'triggered', status: 'WATCH',
    lowerQuality: false, triggerTime: FRI_CLOSE, triggerLevel: 100, invalidation: 104, targets: [{ kind: 'pattern', label: 'T', price: 97 }],
    contract: null, horizonExpiration: '2026-10-30', settingsVersion: 1,
  }, MON('10:43'));
  return db.upsertSignal({ ...row, trackedFrom: null, preChecked: false, lastTrackedAt: FRI_CLOSE, ...over });
}

describe('reevaluateHistory', () => {
  it('META case: a win before first seen becomes "already resolved when first seen", logged', () => {
    const db = new ScannerDb(':memory:');
    const id = oldRow(db, 'META', { outcome: 'win', outcomeAt: MON('09:30'), exitNote: 'no contract' });
    expect(reevaluateHistory(db, MON('13:00'))).toEqual({ changed: 1, confirmed: 0 });
    expect(db.getSignal('META')).toMatchObject({ outcome: 'already_resolved', outcomeAt: MON('09:30'), trackedFrom: MON('10:43'), preChecked: true, exitNote: 'already resolved when first seen', gainPct: null });
    expect(db.events(id).at(-1)).toMatchObject({ kind: 'reevaluated', from: 'win', to: 'already_resolved' });
  });

  it('QQQ case: an outcome after first seen stands (logged as confirmed)', () => {
    const db = new ScannerDb(':memory:');
    const id = oldRow(db, 'QQQ', { outcome: 'loss', outcomeAt: MON('11:30'), exitNote: 'exit quote missed' });
    expect(reevaluateHistory(db, MON('13:00'))).toEqual({ changed: 0, confirmed: 1 });
    expect(db.getSignal('QQQ')).toMatchObject({ outcome: 'loss', trackedFrom: MON('10:43'), preChecked: true });
    expect(db.events(id).at(-1)).toMatchObject({ kind: 'reevaluated', from: 'loss', to: 'loss' });
  });

  it('a pending row tracked from before first seen restarts at first seen with the earlier window to check', () => {
    const db = new ScannerDb(':memory:');
    oldRow(db, 'SPY', { outcome: 'pending', lastTrackedAt: MON('10:00') });
    reevaluateHistory(db, MON('13:00'));
    expect(db.getSignal('SPY')).toMatchObject({ outcome: 'pending', trackedFrom: MON('10:43'), lastTrackedAt: MON('10:43'), preChecked: false });
  });

  it('runs once: rows that already have a tracking start are left alone', () => {
    const db = new ScannerDb(':memory:');
    oldRow(db, 'META', { outcome: 'win', outcomeAt: MON('09:30') });
    reevaluateHistory(db, MON('13:00'));
    expect(reevaluateHistory(db, MON('14:00'))).toEqual({ changed: 0, confirmed: 0 });
  });
});
