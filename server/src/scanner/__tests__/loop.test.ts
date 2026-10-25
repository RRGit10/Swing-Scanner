import { describe, expect, it } from 'vitest';
import { ScannerLoop } from '../loop.js';
import { CandleCache, DailyMemo } from '../cache.js';
import { DEFAULT_APP_SETTINGS } from '../settings.js';
import type { ScanDeps } from '../scan.js';
import { ScannerDb } from '../../storage/db.js';
import { bullFlagTriggered, candlesOf, ZIGZAG } from '../../analysis/__fixtures__/patterns.js';
import { opt } from '../../contracts/__fixtures__/chains.js';
import type { MarketCalendarProvider, TradingDay } from '../../market/clock.js';
import type { Candle, CandleProvider } from '../../providers/types.js';

const DAYS: TradingDay[] = [
  { date: '2026-10-22', open: '09:30', close: '16:00' },
  { date: '2026-10-23', open: '09:30', close: '16:00' },
  { date: '2026-10-26', open: '09:30', close: '16:00' },
];
const market: MarketCalendarProvider = {
  getClock: async () => ({ isOpen: false, timestamp: 0, nextOpen: 0, nextClose: 0 }),
  getCalendar: async () => DAYS,
};
const SUNDAY = Date.parse('2026-10-25T12:00:00-04:00') / 1000;
const MONDAY_10 = Date.parse('2026-10-26T10:00:00-04:00') / 1000;

class SwitchableCandles implements CandleProvider {
  constructor(public bars: Candle[]) {}
  async getCandles(_s: string, tf: string) {
    return tf === '1d' ? [] : this.bars;
  }
  async getMinuteBars() {
    return [];
  }
}

function makeLoop(db: ScannerDb, candles: SwitchableCandles, now: () => number, quoteFails = false) {
  const call = opt({ type: 'call', strike: 105, ask: 3, delta: 0.6, gamma: 0.05, theta: -0.05 });
  const scan: ScanDeps = {
    candles: new CandleCache(candles),
    quotes: {
      getQuote: async (symbol) =>
        quoteFails ? Promise.reject(new Error('Finnhub 429')) : { symbol, price: 108.7, open: 0, high: 0, low: 0, prevClose: 0, change: 0, changePercent: 0, time: 0 },
    },
    options: { getExpirations: async () => ['2026-10-30'], getChain: async () => [call], getContract: async () => call },
    earnings: { getEarnings: async () => [] },
    memo: { expirations: new DailyMemo(), earnings: new DailyMemo() },
  };
  return new ScannerLoop({ market, db, scan, settings: { ...DEFAULT_APP_SETTINGS, watchlist: ['SPY'] }, now, log: () => {} });
}

describe('ScannerLoop', () => {
  it('closed with nothing saved: runs ONE last-session scan at startup and serves it read-only', async () => {
    const db = new ScannerDb(':memory:');
    const loop = makeLoop(db, new SwitchableCandles(bullFlagTriggered), () => SUNDAY);
    await loop.start({ heartbeat: false });
    const scan = db.latestScan()!;
    expect(scan).toMatchObject({ market: 'closed', sessionDate: '2026-10-23', startedAt: SUNDAY });
    expect(loop.status()).toMatchObject({ market: 'closed', banner: 'market closed — last session', nextScanAt: null, lastScanAt: SUNDAY });
    // display-only: a closed-market scan never creates, triggers or freezes history records
    expect(db.allSignals()).toEqual([]);
    expect((scan.payload as { tickers: { patterns: unknown[] }[] }).tickers[0]!.patterns.length).toBeGreaterThan(0);

    // a restart while still closed does not scan again
    const again = makeLoop(db, new SwitchableCandles(bullFlagTriggered), () => SUNDAY + 3600);
    await again.start({ heartbeat: false });
    expect(db.latestScan()!.startedAt).toBe(SUNDAY);
  });

  it('open: scans at start, writes history, and plans the next scan from the timing rules', async () => {
    const db = new ScannerDb(':memory:');
    const loop = makeLoop(db, new SwitchableCandles(bullFlagTriggered), () => MONDAY_10);
    await loop.start({ heartbeat: false });
    expect(loop.status()).toMatchObject({ market: 'open', banner: null, inLiquidWindow: true, nextScanAt: MONDAY_10 + 120 });
    const signal = db.activeSignals().find((s) => s.type === 'bull_flag')!;
    expect(signal).toMatchObject({ ticker: 'SPY', outcome: 'pending', frozenContract: expect.stringContaining('SPY') });
  });

  it('a signal missing from a later scan is ended; a ticker that errors does not end its signals', async () => {
    const db = new ScannerDb(':memory:');
    const candles = new SwitchableCandles(bullFlagTriggered);
    let now = MONDAY_10;
    await makeLoop(db, candles, () => now).start({ heartbeat: false });
    const key = db.activeSignals().find((s) => s.type === 'bull_flag')!.key;

    now += 120;
    await makeLoop(db, candles, () => now, true).scanOnce();
    expect(db.getSignal(key)!.endedAt).toBeNull();

    candles.bars = candlesOf(ZIGZAG); // pattern gone
    now += 120;
    await makeLoop(db, candles, () => now).scanOnce();
    expect(db.getSignal(key)).toMatchObject({ endedAt: now, endedReason: 'no longer detected', outcome: 'pending' });
  });
});
