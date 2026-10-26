import type { ScannerDb } from '../storage/db.js';
import type { SignalEvent, SignalRow } from './signals.js';

const RESOLVED = new Set(['win', 'loss', 'expired']);

/**
 * One-time re-evaluation of triggered rows stored before tracking started at first seen. Tracking now starts at
 * the later of trigger and first seen; an outcome before that becomes "already resolved when first seen"
 * (excluded from both hit rates); a pending row restarts at first seen with the earlier window to check.
 * Each re-evaluated row gets a "reevaluated" event. Rows that already have a tracking start are untouched.
 */
export function reevaluateHistory(db: ScannerDb, now: number): { changed: number; confirmed: number } {
  let changed = 0;
  let confirmed = 0;
  for (const row of db.rowsToReevaluate()) {
    const trackedFrom = Math.max(row.triggerTime ?? row.frozenAt!, row.firstSeenAt);
    const triggeredBeforeSeen = row.triggerTime != null && row.triggerTime < row.firstSeenAt;
    let next: SignalRow = { ...row, trackedFrom, preChecked: true };
    let reason: string;

    if (RESOLVED.has(row.outcome) && row.outcomeAt != null && row.outcomeAt < trackedFrom) {
      next = { ...next, outcome: 'already_resolved', exitNote: 'already resolved when first seen', gainPct: null };
      reason = 'outcome happened before the signal was first seen';
    } else if (row.outcome === 'pending') {
      const covered = (row.lastTrackedAt ?? 0) >= trackedFrom; // the old tracking already checked that window
      next = { ...next, preChecked: covered || !triggeredBeforeSeen, lastTrackedAt: Math.max(row.lastTrackedAt ?? 0, trackedFrom) };
      reason = 'tracking restarts at first seen';
    } else {
      reason = 'outcome happened after first seen; it stands';
    }

    if (next.outcome !== row.outcome) changed++;
    else confirmed++;
    db.upsertSignal(next);
    const event: SignalEvent = { kind: 'reevaluated', at: now, from: row.outcome, to: next.outcome, detail: { trackedFrom, firstSeenAt: row.firstSeenAt, triggerTime: row.triggerTime, reason } };
    db.addEvents(row.id!, [event]);
  }
  return { changed, confirmed };
}
