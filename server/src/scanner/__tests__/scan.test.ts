import { describe, expect, it } from 'vitest';
import { scanTicker, type ScanDeps } from '../scan.js';
import { CandleCache, DailyMemo } from '../cache.js';
import { DEFAULT_APP_SETTINGS } from '../settings.js';
import { bullFlagTriggered } from '../../analysis/__fixtures__/patterns.js';
import { opt } from '../../contracts/__fixtures__/chains.js';
import type { Candle, CandleProvider, OptionContract, Timeframe } from '../../providers/types.js';

class FixtureCandles implements CandleProvider {
  constructor(private bars: Candle[]) {}
  async getCandles(_s: string, tf: Timeframe) {
    return tf === '1d' ? [] : this.bars;
  }
  async getMinuteBars() {
    return [];
  }
}

function deps(chain: OptionContract[]): ScanDeps {
  return {
    candles: new CandleCache(new FixtureCandles(bullFlagTriggered)),
    quotes: { getQuote: async (symbol) => ({ symbol, price: 108.7, open: 0, high: 0, low: 0, prevClose: 0, change: 0, changePercent: 0, time: 0 }) },
    options: {
      getExpirations: async () => ['2026-10-30'],
      getChain: async () => chain,
      getContract: async (occ) => chain.find((c) => c.symbol === occ) ?? null,
    },
    earnings: { getEarnings: async () => [] },
    memo: { expirations: new DailyMemo(), earnings: new DailyMemo() },
  };
}

const ctx = {
  today: '2026-10-23',
  sessionDate: '2026-10-23',
  calendar: [{ date: '2026-10-23', open: '09:30', close: '16:00' }],
  settings: DEFAULT_APP_SETTINGS,
};

describe('scanTicker (fake providers, bull flag fixture)', () => {
  it('finds the triggered bull flag, picks a call, and marks READY when the ask is above the entry zone', async () => {
    const call = opt({ type: 'call', strike: 105, ask: 3, delta: 0.6, gamma: 0.05, theta: -0.05 });
    const entry = await scanTicker(deps([call]), 'SPY', ctx);
    const flag = entry.patterns.find((p) => p.type === 'bull_flag')!;
    expect(flag).toMatchObject({ direction: 'bullish', state: 'triggered', status: 'READY', tradingTimeframe: '15m', contract: { symbol: call.symbol } });
    expect(flag.key).toBe(`SPY|bull_flag|bullish|${bullFlagTriggered[16]!.time}`);
    expect(flag.drawings['15m']!.lines.map((l) => l.label)).toContain('target');
    expect(flag.candleLabels).toHaveLength(3);
    expect(flag.horizonExpiration).toBe('2026-10-30');
    expect(flag.dailyEmasInPath).toEqual([]); // fixture has no daily bars
    expect(flag).toHaveProperty('ema55Reversal');
    expect(entry.contracts.map((c) => c.contract.symbol)).toEqual([call.symbol]);
    expect(entry).toMatchObject({ ticker: 'SPY', price: 108.7, bestStatus: 'READY' });
  });

  it('AT ENTRY when the contract ask sits in the entry zone', async () => {
    const call = opt({ type: 'call', strike: 105, ask: 1.9, delta: 0.6, gamma: 0.05, theta: -0.05 });
    const entry = await scanTicker(deps([call]), 'SPY', ctx);
    expect(entry.patterns.find((p) => p.type === 'bull_flag')!.status).toBe('AT ENTRY');
  });

  it('reports a provider error on the ticker instead of throwing', async () => {
    const d = deps([]);
    d.quotes = { getQuote: async () => Promise.reject(new Error('Finnhub 429 on /api/v1/quote')) };
    const entry = await scanTicker(d, 'SPY', ctx);
    expect(entry.error).toMatch(/429/);
    expect(entry.patterns).toEqual([]);
  });
});
