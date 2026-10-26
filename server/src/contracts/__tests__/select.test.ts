import { describe, expect, it } from 'vitest';
import { gradeFor, selectContract, type SelectionInput } from '../select.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../types.js';
import type { OptionContract } from '../../providers/types.js';
import { SESSION, TODAY, opt } from '../__fixtures__/chains.js';

const s = DEFAULT_CONTRACT_SETTINGS;
const FRIDAYS = ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20'];

function input(over: Partial<SelectionInput> = {}): SelectionInput {
  return {
    direction: 'bullish',
    expirations: FRIDAYS,
    today: TODAY,
    sessionDate: SESSION,
    previousSession: '2026-10-22',
    targets: [{ kind: 'pattern', label: 'Pattern target', price: 110 }],
    triggered: false,
    newestCandleNames: [],
    quotePrice: 100,
    earnings: [],
    settings: s,
    ...over,
  };
}

/** getChain stub: the same chain for every expiration unless a map is given. */
const chains = (byExp: Record<string, OptionContract[]> | OptionContract[]) => async (exp: string) =>
  Array.isArray(byExp) ? byExp.map((c) => ({ ...c, expiration: exp })) : (byExp[exp] ?? []);

const pick = async (chain: OptionContract[], over: Partial<SelectionInput> = {}) => {
  const r = await selectContract(input(over), chains(chain));
  return r.kind === 'pick' ? r : null;
};

describe('gradeFor (|delta|, contiguous bands)', () => {
  it.each([
    [0.95, 'A'], [0.57, 'A'], [0.565, 'B'], [0.3, 'B'], [0.295, 'C'], [0.28, 'C'], [0.279, null], [-0.6, 'A'], [-0.29, 'C'],
  ] as const)('delta %s → %s', (delta, grade) => {
    expect(gradeFor(delta, s)).toBe(grade);
  });
});

describe('selectContract: filters', () => {
  it('picks the highest-delta call that fits the budget', async () => {
    const r = await pick([
      opt({ type: 'call', strike: 95, ask: 6.0, delta: 0.8 }), // $600 > budget
      opt({ type: 'call', strike: 98, ask: 4.0, delta: 0.65 }),
      opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.5 }),
    ]);
    expect(r).toMatchObject({ grade: 'A', contract: { strike: 98 } });
  });

  it('falls to grade B when every A strike exceeds the budget', async () => {
    const r = await pick([opt({ type: 'call', strike: 95, ask: 6.0, delta: 0.8 }), opt({ type: 'call', strike: 101, ask: 2.0, delta: 0.45 })]);
    expect(r).toMatchObject({ grade: 'B', contract: { strike: 101 } });
  });

  it('never recommends a contract under $0.50', async () => {
    const r = await pick([opt({ type: 'call', strike: 104, ask: 0.49, delta: 0.35 }), opt({ type: 'call', strike: 103, ask: 0.5, delta: 0.33 })]);
    expect(r?.contract.strike).toBe(103);
  });

  it('skips contracts without greeks or IV', async () => {
    const r = await pick([opt({ type: 'call', strike: 98, ask: 4, delta: null }), opt({ type: 'call', strike: 99, ask: 3, iv: null }), opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.5 })]);
    expect(r?.contract.strike).toBe(100);
  });

  it('liquidity floor: skips OI below 100 for every grade; exactly 100 passes', async () => {
    const r = await pick([opt({ type: 'call', strike: 98, ask: 4, delta: 0.65, openInterest: 99 }), opt({ type: 'call', strike: 99, ask: 3, delta: 0.55, openInterest: 100 })]);
    expect(r?.contract.strike).toBe(99);
  });

  it('rejects delta below 0.28', async () => {
    expect(await pick([opt({ type: 'call', strike: 106, ask: 0.8, delta: 0.279 })])).toBeNull();
  });

  it('ignores the other option type', async () => {
    expect(await pick([opt({ type: 'put', strike: 100, ask: 2, delta: -0.6 })])).toBeNull();
  });

  it('tie on delta → lower ask, then higher OI', async () => {
    const r = await pick([
      opt({ type: 'call', strike: 99, ask: 3.0, delta: 0.6, openInterest: 900 }),
      opt({ type: 'call', strike: 99.5, ask: 2.8, delta: 0.6, openInterest: 500 }),
      opt({ type: 'call', strike: 98.5, ask: 2.8, delta: 0.6, openInterest: 800 }),
    ]);
    expect(r?.contract.strike).toBe(98.5);
  });
});

describe('selectContract: stale open interest → liquidity = max(OI, previous-session volume)', () => {
  const MON = { today: '2026-10-26', sessionDate: '2026-10-26', previousSession: '2026-10-23' };
  const stale = { openInterestDate: '2026-10-22', prevDayBarDate: '2026-10-23', dayBarDate: '2026-10-26' };

  it('stale OI + high previous-session volume passes the floor and is reported on the pick', async () => {
    const r = await pick([opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.6, openInterest: 40, prevDayVolume: 46519, ...stale })], MON);
    expect(r?.liquidity).toMatchObject({ value: 46519, source: 'volume', stale: true, openInterest: 40, openInterestDate: '2026-10-22' });
  });

  it('stale OI + low volume fails the floor', async () => {
    expect(await pick([opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.6, openInterest: 40, prevDayVolume: 60, ...stale })], MON)).toBeNull();
  });

  it('grade C uses the same liquidity: high volume passes ≥ 1000, low volume does not', async () => {
    const c = { type: 'call' as const, strike: 105, ask: 0.9, delta: 0.29, openInterest: 400, ...stale };
    const power = { ...MON, triggered: true, newestCandleNames: ['boom_boom'] as const };
    expect(await pick([opt({ ...c, prevDayVolume: 1500 })], power)).toMatchObject({ grade: 'C', liquidity: { value: 1500, source: 'volume' } });
    expect(await pick([opt({ ...c, prevDayVolume: 999 })], power)).toBeNull();
  });

  it('fresh OI is unchanged: volume is ignored even when larger', async () => {
    const fresh = { openInterestDate: '2026-10-23', prevDayBarDate: '2026-10-23', dayBarDate: '2026-10-26' };
    expect(await pick([opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.6, openInterest: 99, prevDayVolume: 50000, ...fresh })], MON)).toBeNull();
    expect(await pick([opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.6, openInterest: 150, prevDayVolume: 50000, ...fresh })], MON)).toMatchObject({
      liquidity: { value: 150, source: 'oi', stale: false },
    });
  });
});

describe('selectContract: grade C conditions', () => {
  const cOnly = [opt({ type: 'call', strike: 105, ask: 0.9, delta: 0.29, openInterest: 1500 })];

  it('allowed with a power candle, a triggered pattern and OI ≥ 1000', async () => {
    expect(await pick(cOnly, { triggered: true, newestCandleNames: ['boom_boom'] })).toMatchObject({ grade: 'C' });
    expect(await pick(cOnly, { triggered: true, newestCandleNames: ['three_green_soldiers'] })).toMatchObject({ grade: 'C' });
  });

  it('blocked without a power candle (a hammer is not one)', async () => {
    expect(await pick(cOnly, { triggered: true, newestCandleNames: ['hammer'] })).toBeNull();
  });

  it('blocked while the pattern is only armed', async () => {
    expect(await pick(cOnly, { triggered: false, newestCandleNames: ['boom_boom'] })).toBeNull();
  });

  it('blocked with OI under 1000', async () => {
    expect(await pick([{ ...cOnly[0]!, openInterest: 999 }], { triggered: true, newestCandleNames: ['boom_boom'] })).toBeNull();
  });

  it('puts: only a red boom boom is a power candle', async () => {
    const putC = [opt({ type: 'put', strike: 95, ask: 0.9, delta: -0.29, openInterest: 1500 })];
    const bear = { direction: 'bearish' as const, targets: [{ kind: 'pattern' as const, label: 'Pattern target', price: 90 }], triggered: true };
    expect(await pick(putC, { ...bear, newestCandleNames: ['red_boom_boom'] })).toMatchObject({ grade: 'C' });
    expect(await pick(putC, { ...bear, newestCandleNames: ['boom_boom'] })).toBeNull();
  });
});

describe('selectContract: estimated value at T1 must beat the ask', () => {
  it('call passes when the estimate at T1 (delta-gamma − 1 day theta) is above the ask, even if break-even is beyond T1', async () => {
    // 3 + 0.55×2 + ½×0.05×4 − 0.1 = 4.1 > 3; break-even 103 is past T1 102 (info only now)
    const r = await pick([opt({ type: 'call', strike: 100, ask: 3, delta: 0.55, gamma: 0.05, theta: -0.1 })], {
      targets: [{ kind: 'pattern', label: 'Pattern target', price: 102 }],
    });
    expect(r?.contract.strike).toBe(100);
    expect(r?.exitPlan.breakEven).toBe(103);
    expect(r?.exitPlan.targets[0]!.estimateChangePct).toBeCloseTo((4.1 / 3 - 1) * 100, 8);
  });

  it('near miss: one day of theta wipes out the gain', async () => {
    // 2 + 0.3×1 − 0.35 = 1.95 < 2 (would be 2.3 without theta)
    const c = opt({ type: 'call', strike: 101, ask: 2, delta: 0.3, gamma: 0, theta: -0.35 });
    expect(await pick([c], { targets: [{ kind: 'pattern', label: 'Pattern target', price: 101 }] })).toBeNull();
  });

  it('near miss: checked at T1, not T2', async () => {
    // at T1 (+0.2): 2 + 0.06 − 0.1 = 1.96 < 2; at T2 it would pass
    const targets = [
      { kind: 'ema' as const, label: '1h 48 EMA', price: 100.2 },
      { kind: 'measured_move' as const, label: 'Measured move', price: 110 },
    ];
    expect(await pick([opt({ type: 'call', strike: 101, ask: 2, delta: 0.3, gamma: 0, theta: -0.1 })], { targets })).toBeNull();
  });

  it('put passes when the estimate at T1 is above the ask; bearish uses puts and |delta|', async () => {
    // 3 + (−0.5)(−2) + ½×0.05×4 − 0.1 = 4.0 > 3
    const r = await pick(
      [opt({ type: 'put', strike: 100, ask: 3, delta: -0.5, gamma: 0.05, theta: -0.1 }), opt({ type: 'call', strike: 95, ask: 2, delta: 0.9 })],
      { direction: 'bearish', targets: [{ kind: 'pattern', label: 'Pattern target', price: 98 }] },
    );
    expect(r).toMatchObject({ grade: 'B', contract: { type: 'put', strike: 100 } });
  });

  it('near miss (put): theta beats the small move to T1', async () => {
    const c = opt({ type: 'put', strike: 99, ask: 2, delta: -0.3, gamma: 0, theta: -0.35 });
    expect(await pick([c], { direction: 'bearish', targets: [{ kind: 'pattern', label: 'Pattern target', price: 99 }] })).toBeNull();
  });

  it('skips contracts with no theta (missing greeks)', async () => {
    expect(await pick([opt({ type: 'call', strike: 100, ask: 2, theta: null })])).toBeNull();
  });
});

describe('selectContract: expiration fallback', () => {
  it('uses the first Friday where a contract passes, and says why earlier ones were skipped', async () => {
    const r = await selectContract(
      input({ earnings: [{ symbol: 'SPY', date: '2026-11-04', hour: 'bmo', epsEstimate: null }] }),
      chains({
        '2026-10-30': [opt({ type: 'call', strike: 95, ask: 6, delta: 0.8 })], // over budget
        '2026-11-06': [opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.5, expiration: '2026-11-06' })],
      }),
    );
    expect(r).toMatchObject({ kind: 'pick', expiration: '2026-11-06', dte: 14, earningsDate: '2026-11-04' });
    expect(r.skippedExpirations).toEqual([{ expiration: '2026-10-30', reason: 'no contract passed (1 over budget)' }]);
  });

  it('earnings flag follows the picked expiration', async () => {
    const r = await selectContract(
      input({ earnings: [{ symbol: 'SPY', date: '2026-11-04', hour: 'bmo', epsEstimate: null }] }),
      chains([opt({ type: 'call', strike: 100, ask: 2.5, delta: 0.5 })]),
    );
    expect(r).toMatchObject({ kind: 'pick', expiration: '2026-10-30', earningsDate: null });
  });

  it('"no contract fits" when no Friday up to 30 days has one; lists every reason', async () => {
    const r = await selectContract(input(), chains([opt({ type: 'call', strike: 95, ask: 6, delta: 0.8 }), opt({ type: 'call', strike: 106, ask: 0.4, delta: 0.2 })]));
    expect(r.kind).toBe('none');
    expect(r).toMatchObject({ reason: 'no contract fits' });
    expect(r.skippedExpirations).toHaveLength(4);
    expect(r.skippedExpirations[0]!.reason).toBe('no contract passed (1 over budget, 1 under $0.50)');
  });

  it('no Friday 3–30 days out → none with that reason', async () => {
    const r = await selectContract(input({ expirations: ['2026-10-27', '2026-12-18'] }), chains([]));
    expect(r).toMatchObject({ kind: 'none', reason: 'no Friday expiration 3–30 days out', skippedExpirations: [] });
  });
});

describe('selectContract: result card', () => {
  it('carries entry zone/status and the exit plan, using the delayed quote price for the estimate', async () => {
    const r = await pick([opt({ type: 'call', strike: 100, ask: 2.0, delta: 0.6, gamma: 0.05 })], {
      targets: [{ kind: 'pattern', label: 'Pattern target', price: 104 }],
      quotePrice: 100,
    });
    expect(r?.entry).toEqual({ zone: { low: 1.8, high: 2.0 }, status: 'AT ENTRY' });
    expect(r?.exitPlan.breakEven).toBe(102);
    expect(r?.exitPlan.targets[0]!.estimate).toBeCloseTo(4.75, 10);
  });
});
