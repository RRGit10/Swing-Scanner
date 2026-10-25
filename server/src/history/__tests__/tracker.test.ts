import { describe, expect, it } from 'vitest';
import { trackOutcomes, type TrackerDeps } from '../tracker.js';
import { applyScan, type SignalRow } from '../signals.js';
import { ScannerDb } from '../../storage/db.js';
import { CandleCache } from '../../scanner/cache.js';
import { DEFAULT_APP_SETTINGS } from '../../scanner/settings.js';
import { opt } from '../../contracts/__fixtures__/chains.js';
import type { Candle, CandleProvider, OptionContract } from '../../providers/types.js';

const T0 = Date.parse('2026-10-26T10:00:00-04:00') / 1000; // Monday; trigger candle closed at 10:00
const CONTRACT = opt({ type: 'call', strike: 100, ask: 2, expiration: '2026-10-30' });
const minute = (offsetMin: number, high: number): Candle => ({ time: T0 + offsetMin * 60, open: 100, high, low: 99.5, close: 100, volume: 1 });

class FakeBars implements CandleProvider {
  constructor(public minutes: Candle[] = [], public bars15: Candle[] = []) {}
  async getCandles() {
    return this.bars15;
  }
  async getMinuteBars(_s: string, start: Date, end: Date) {
    return this.minutes.filter((b) => b.time >= start.getTime() / 1000 && b.time <= end.getTime() / 1000);
  }
}

function setup(minutes: Candle[], snapshot: Partial<OptionContract> | null, lastTrackedAt = T0, withContract = true) {
  const db = new ScannerDb(':memory:');
  const { row, events } = applyScan(null, {
    key: 'SPY|bull_flag|bullish|1', ticker: 'SPY', type: 'bull_flag', direction: 'bullish', timeframes: ['15m'],
    tradingTimeframe: '15m', state: 'triggered', status: 'READY', lowerQuality: false, triggerTime: T0, triggerLevel: 100,
    invalidation: 98, targets: [{ kind: 'measured_move', label: 'Measured move', price: 102 }],
    contract: withContract ? { symbol: CONTRACT.symbol, ask: 2, expiration: '2026-10-30' } : null,
    horizonExpiration: '2026-10-30',
  }, T0);
  const id = db.upsertSignal({ ...row, lastTrackedAt });
  db.addEvents(id, events);
  const bars = new FakeBars(minutes);
  const deps: TrackerDeps = {
    db,
    candles: new CandleCache(bars),
    options: {
      getExpirations: async () => [],
      getChain: async () => [],
      getContract: async () => (snapshot ? { ...CONTRACT, ...snapshot } : null),
    },
    settings: DEFAULT_APP_SETTINGS,
    calendar: () => [],
  };
  const get = (): SignalRow => db.getSignal('SPY|bull_flag|bullish|1')!;
  return { db, deps, id, get };
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();

describe('trackOutcomes', () => {
  it('live: T1 touch → win, exit quote = first snapshot at/after the hit, gain from bid', async () => {
    const { deps, db, id, get } = setup([minute(5, 101), minute(30, 102.1)], { bid: 3, ask: 3.1, quoteTime: iso(T0 + 31 * 60) }, T0 + 20 * 60);
    await trackOutcomes(deps, T0 + 47 * 60);
    expect(get()).toMatchObject({ outcome: 'win', outcomeAt: T0 + 30 * 60, exitBid: 3, exitAsk: 3.1, exitNote: null });
    expect(get().gainPct).toBeCloseTo(50, 10); // (3 − 2) / 2
    expect(db.events(id).map((e) => e.kind)).toEqual(['first_seen', 'triggered', 'outcome', 'exit_quote']);
    expect(db.pendingOutcomes()).toEqual([]);
  });

  it('waits for a delayed quote from before the hit, then records it on a later run', async () => {
    const { deps, get } = setup([minute(30, 102.1)], { bid: 1.9, ask: 2, quoteTime: iso(T0 + 20 * 60) }, T0 + 20 * 60);
    await trackOutcomes(deps, T0 + 35 * 60);
    expect(get()).toMatchObject({ outcome: 'win', exitBid: null, exitNote: null });
    deps.options.getContract = async () => ({ ...CONTRACT, bid: 2.8, ask: 2.9, quoteTime: iso(T0 + 32 * 60) });
    await trackOutcomes(deps, T0 + 48 * 60);
    expect(get()).toMatchObject({ exitBid: 2.8, exitAsk: 2.9 });
  });

  it('no event yet → advances lastTrackedAt to the end of the newest minute bar', async () => {
    const { deps, get } = setup([minute(5, 101), minute(6, 101.2)], null);
    await trackOutcomes(deps, T0 + 25 * 60);
    expect(get()).toMatchObject({ outcome: 'pending', lastTrackedAt: T0 + 7 * 60 });
  });

  it('backfill after the Mac slept: outcome recorded in time order, exit quote missed, gain left empty, logged', async () => {
    // asleep from 10:00 to 15:00; T1 was touched at 11:00; only today's late quote is available now
    const { deps, db, id, get } = setup([minute(60, 102.5), minute(70, 97)], { bid: 4, ask: 4.1, quoteTime: iso(T0 + 5 * 3600 - 960) });
    await trackOutcomes(deps, T0 + 5 * 3600);
    expect(get()).toMatchObject({ outcome: 'win', outcomeAt: T0 + 3600, exitBid: null, exitNote: 'exit quote missed', gainPct: null });
    const events = db.events(id);
    expect(events.map((e) => e.kind)).toEqual(['first_seen', 'triggered', 'backfill', 'outcome', 'exit_quote']);
    expect(events[2]).toMatchObject({ from: String(T0), to: String(T0 + 5 * 3600) });
  });

  it('backfill → loss when invalidation closes first', async () => {
    const bars15: Candle[] = [{ time: T0 + 15 * 60, open: 99, high: 99.2, low: 97.5, close: 97.8, volume: 1 }];
    const { deps, get } = setup([minute(60, 102.5)], { bid: 1, ask: 1.1, quoteTime: iso(T0 + 5 * 3600) });
    (deps.candles.provider as FakeBars).bars15 = bars15;
    await trackOutcomes(deps, T0 + 5 * 3600);
    expect(get()).toMatchObject({ outcome: 'loss', outcomeAt: T0 + 30 * 60, exitNote: 'exit quote missed' });
  });

  it('no contract at trigger: stock outcome recorded, no exit quote fetched, gain empty', async () => {
    const { deps, get } = setup([minute(30, 102.1)], null, T0, false);
    let fetched = 0;
    deps.options.getContract = async () => (fetched++, null);
    await trackOutcomes(deps, T0 + 47 * 60);
    expect(get()).toMatchObject({ outcome: 'win', outcomeAt: T0 + 30 * 60, frozenContract: null, exitNote: 'no contract', gainPct: null });
    expect(fetched).toBe(0);
  });

  it('expired: neither by the expiration close; no exit quote needed', async () => {
    const { deps, get } = setup([minute(5, 101)], null);
    await trackOutcomes(deps, Date.parse('2026-10-30T17:00:00-04:00') / 1000);
    expect(get()).toMatchObject({ outcome: 'expired', outcomeAt: Date.parse('2026-10-30T16:00:00-04:00') / 1000, gainPct: null });
  });
});
