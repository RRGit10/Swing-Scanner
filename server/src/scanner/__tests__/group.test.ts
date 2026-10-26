import { describe, expect, it } from 'vitest';
import { buildTickerEntry, sortTickers, type PatternEntry, type TickerEntry } from '../group.js';
import type { ContractResult } from '../../contracts/types.js';
import { opt } from '../../contracts/__fixtures__/chains.js';

function pattern(over: Partial<PatternEntry>): Omit<PatternEntry, 'contract'> {
  return {
    key: 'k', type: 'double_top', direction: 'bearish', timeframes: ['15m'], tradingTimeframe: '15m', state: 'armed',
    status: 'WATCH', lowerQuality: false, triggerTime: null, triggerLevel: 1, invalidation: 2, targets: [], candleLabels: [],
    drawings: {}, horizonExpiration: null, dailyEmasInPath: [], ema55Reversal: null, ...over,
  };
}

const pick = (strike: number): ContractResult => ({
  kind: 'pick', contract: opt({ type: 'put', strike }), grade: 'B', expiration: '2026-10-30', dte: 5,
  liquidity: { value: 5000, source: 'oi', stale: false, openInterest: 5000, openInterestDate: '2026-10-22', volume: null, volumeDate: null },
  entry: { zone: null, status: 'NO CURRENT RANGE' }, exitPlan: { breakEven: 0, markers: [], targets: [] },
  earningsDate: null, skippedExpirations: [],
});

describe('buildTickerEntry', () => {
  it('lists every pattern under the ticker and shows a shared contract once', () => {
    const entry = buildTickerEntry({ ticker: 'SPY', price: 760, delayedPrice: 759.9, emaTable: [] }, [
      { pattern: pattern({ key: 'a', type: 'double_top', status: 'WATCH' }), result: pick(756) },
      { pattern: pattern({ key: 'b', type: 'bear_flag', status: 'READY' }), result: pick(756) },
    ]);
    const symbol = opt({ type: 'put', strike: 756 }).symbol;
    expect(entry.patterns.map((p) => p.key)).toEqual(['b', 'a']); // READY before WATCH
    expect(entry.patterns.map((p) => ('symbol' in p.contract ? p.contract.symbol : null))).toEqual([symbol, symbol]);
    expect(entry.contracts.map((c) => c.contract.symbol)).toEqual([symbol]);
    expect(entry.bestStatus).toBe('READY');
  });

  it('keeps distinct contracts and carries "no contract fits" with its reasons', () => {
    const none: ContractResult = { kind: 'none', reason: 'no contract fits', skippedExpirations: [{ expiration: '2026-10-30', reason: 'no contract passed (3 over budget)' }] };
    const entry = buildTickerEntry({ ticker: 'QQQ', price: 704, delayedPrice: 704, emaTable: [] }, [
      { pattern: pattern({ key: 'a' }), result: pick(700) },
      { pattern: pattern({ key: 'b', type: 'bear_flag' }), result: pick(698) },
      { pattern: pattern({ key: 'c', type: 'bull_flag', direction: 'bullish' }), result: none },
    ]);
    expect(entry.contracts).toHaveLength(2);
    expect(entry.patterns.find((p) => p.key === 'c')!.contract).toEqual({ none: 'no contract fits', skippedExpirations: none.skippedExpirations });
  });
});

describe('sortTickers', () => {
  const t = (ticker: string, bestStatus: TickerEntry['bestStatus']) => ({ ticker, bestStatus }) as TickerEntry;

  it('AT ENTRY and READY tickers first, then WATCH, WAIT, tickers with no patterns last', () => {
    expect(sortTickers([t('A', 'WAIT'), t('B', null), t('C', 'READY'), t('D', 'AT ENTRY'), t('E', 'WATCH')]).map((x) => x.ticker)).toEqual([
      'D', 'C', 'E', 'A', 'B',
    ]);
  });
});
