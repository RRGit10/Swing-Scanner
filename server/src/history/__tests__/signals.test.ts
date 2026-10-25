import { describe, expect, it } from 'vitest';
import { applyScan, endMissing, noteEntryAsk, type SignalSnapshot } from '../signals.js';

const NOW = 1_800_000_000;

function snap(over: Partial<SignalSnapshot> = {}): SignalSnapshot {
  return {
    key: 'SPY|double_top|bearish|1792700000',
    ticker: 'SPY',
    type: 'double_top',
    direction: 'bearish',
    timeframes: ['15m', '30m'],
    tradingTimeframe: '15m',
    state: 'armed',
    status: 'WATCH',
    lowerQuality: false,
    triggerTime: null,
    triggerLevel: 758.68,
    invalidation: 764.07,
    targets: [{ kind: 'pattern', label: 'Pattern target', price: 753.59 }],
    contract: { symbol: 'SPY261030P00756000', ask: 4.97, expiration: '2026-10-30' },
    horizonExpiration: '2026-10-30',
    ...over,
  };
}

describe('applyScan', () => {
  it('new signal: logs first_seen with its status', () => {
    const { row, events } = applyScan(null, snap(), NOW);
    expect(row).toMatchObject({ key: snap().key, firstSeenAt: NOW, lastSeenAt: NOW, status: 'WATCH', outcome: 'open', frozenAt: null });
    expect(events).toEqual([{ kind: 'first_seen', at: NOW, from: null, to: 'WATCH', detail: { contract: 'SPY261030P00756000' } }]);
  });

  it('status change → status event; contract change → contract event', () => {
    const first = applyScan(null, snap(), NOW).row;
    const { row, events } = applyScan(first, snap({ status: 'WAIT', contract: { symbol: 'SPY261030P00755000', ask: 4.8, expiration: '2026-10-30' } }), NOW + 120);
    expect(row.status).toBe('WAIT');
    expect(events.map((e) => [e.kind, e.from, e.to])).toEqual([
      ['status', 'WATCH', 'WAIT'],
      ['contract', 'SPY261030P00756000', 'SPY261030P00755000'],
    ]);
  });

  it('trigger freezes contract, entry ask and T1; later changes do not touch the frozen values', () => {
    const first = applyScan(null, snap(), NOW).row;
    const trig = applyScan(first, snap({ state: 'triggered', status: 'READY', triggerTime: NOW + 100 }), NOW + 120);
    expect(trig.row).toMatchObject({
      frozenAt: NOW + 120,
      frozenT1: 753.59,
      frozenContract: 'SPY261030P00756000',
      entryAsk: 4.97,
      expiration: '2026-10-30',
      outcome: 'pending',
      lastTrackedAt: NOW + 100,
      triggerTime: NOW + 100,
    });
    expect(trig.events.map((e) => e.kind)).toEqual(['status', 'triggered']);

    const later = applyScan(
      trig.row,
      snap({ state: 'triggered', status: 'AT ENTRY', triggerTime: NOW + 100, targets: [{ kind: 'pattern', label: 'x', price: 700 }], contract: { symbol: 'OTHER', ask: 9, expiration: '2026-11-06' } }),
      NOW + 240,
    ).row;
    expect(later).toMatchObject({ frozenT1: 753.59, frozenContract: 'SPY261030P00756000', entryAsk: 4.97, expiration: '2026-10-30' });
  });

  it('trigger with no contract → stock outcome still tracked to the nearest-Friday horizon; no exit quote needed', () => {
    const { row } = applyScan(null, snap({ state: 'triggered', status: 'READY', triggerTime: NOW, contract: null }), NOW);
    expect(row).toMatchObject({
      frozenAt: NOW, frozenT1: 753.59, frozenContract: null, entryAsk: null, expiration: '2026-10-30',
      outcome: 'pending', lastTrackedAt: NOW, exitNote: 'no contract',
    });
  });

  it('trigger with no contract and no Friday in range → no_contract (nothing to track against)', () => {
    const { row } = applyScan(null, snap({ state: 'triggered', status: 'READY', triggerTime: NOW, contract: null, horizonExpiration: null }), NOW);
    expect(row).toMatchObject({ outcome: 'no_contract', expiration: null });
  });
});

describe('endMissing', () => {
  it('a never-triggered signal that disappears → ended + never_triggered', () => {
    const row = applyScan(null, snap(), NOW).row;
    const { row: ended, events } = endMissing(row, NOW + 600);
    expect(ended).toMatchObject({ endedAt: NOW + 600, endedReason: 'no longer detected', outcome: 'never_triggered' });
    expect(events.map((e) => e.kind)).toEqual(['ended']);
  });

  it('a triggered signal that disappears keeps tracking (outcome stays pending)', () => {
    const row = applyScan(null, snap({ state: 'triggered', status: 'READY', triggerTime: NOW }), NOW).row;
    expect(endMissing(row, NOW + 600).row).toMatchObject({ endedAt: NOW + 600, outcome: 'pending' });
  });

  it('an already-ended row is left alone', () => {
    const ended = endMissing(applyScan(null, snap(), NOW).row, NOW + 600).row;
    expect(endMissing(ended, NOW + 900)).toEqual({ row: ended, events: [] });
  });

  it('a never-triggered signal that reappears is reopened', () => {
    const ended = endMissing(applyScan(null, snap(), NOW).row, NOW + 600).row;
    const { row, events } = applyScan(ended, snap(), NOW + 900);
    expect(row).toMatchObject({ endedAt: null, endedReason: null, outcome: 'open' });
    expect(events.map((e) => e.kind)).toContain('reappeared');
  });
});

describe('noteEntryAsk', () => {
  it('tracks the lowest AT ENTRY ask after the trigger only', () => {
    const armed = applyScan(null, snap(), NOW).row;
    expect(noteEntryAsk(armed, 4.5, 'AT ENTRY').lowestEntryAsk).toBeNull();
    const trig = applyScan(null, snap({ state: 'triggered', status: 'READY', triggerTime: NOW }), NOW).row;
    const a = noteEntryAsk(trig, 4.6, 'AT ENTRY');
    const b = noteEntryAsk(a, 4.4, 'AT ENTRY');
    const c = noteEntryAsk(b, 4.2, 'ABOVE ENTRY ZONE');
    expect([a.lowestEntryAsk, b.lowestEntryAsk, c.lowestEntryAsk]).toEqual([4.6, 4.4, 4.4]);
  });
});
