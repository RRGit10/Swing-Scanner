import { describe, expect, it } from 'vitest';
import { buildExitPlan, entryStatus } from '../exitPlan.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../types.js';
import { SESSION, opt } from '../__fixtures__/chains.js';

const s = DEFAULT_CONTRACT_SETTINGS;

describe('buildExitPlan', () => {
  it('call: break-even, +60/80/100% markers, delta-gamma estimate at the target', () => {
    const c = opt({ type: 'call', strike: 100, ask: 2, delta: 0.6, gamma: 0.05, theta: -0.05 });
    const plan = buildExitPlan(c, [{ kind: 'pattern', label: 'Pattern target', price: 104 }], 100, s);
    expect(plan.breakEven).toBe(102);
    expect(plan.markers.map((m) => [m.pct, Number(m.price.toFixed(4))])).toEqual([[60, 3.2], [80, 3.6], [100, 4]]);
    // 2 + 0.6×4 + ½×0.05×16 − 0.05 (1 day theta) = 4.75
    expect(plan.targets[0]).toMatchObject({ label: 'Pattern target', stockPrice: 104 });
    expect(plan.targets[0]!.estimate).toBeCloseTo(4.75, 10);
    expect(plan.targets[0]!.estimateChangePct).toBeCloseTo(137.5, 10);
  });

  it('put: break-even = strike − premium; estimate grows as the stock falls', () => {
    const c = opt({ type: 'put', strike: 100, ask: 2, delta: -0.6, gamma: 0.05, theta: -0.05 });
    const plan = buildExitPlan(c, [{ kind: 'pattern', label: 'Pattern target', price: 96 }], 100, s);
    expect(plan.breakEven).toBe(98);
    expect(plan.targets[0]!.estimate).toBeCloseTo(4.75, 10); // 2 + (−0.6)(−4) + ½·0.05·16 − 0.05
  });

  it('floors the estimate at intrinsic value at the target', () => {
    // deep move with tiny gamma: 1 + 0.3×20 + ½×0.001×400 = 7.2 < intrinsic 15
    const c = opt({ type: 'call', strike: 105, ask: 1, delta: 0.3, gamma: 0.001 });
    const plan = buildExitPlan(c, [{ kind: 'pattern', label: 'Pattern target', price: 120 }], 100, s);
    expect(plan.targets[0]!.estimate).toBe(15);
  });

  it('gives one estimate per target (T1 EMA, T2 measured move)', () => {
    const c = opt({ type: 'call', strike: 100, ask: 2, delta: 0.6, gamma: 0.05, theta: -0.05 });
    const plan = buildExitPlan(
      c,
      [
        { kind: 'ema', label: '1h 48 EMA', price: 103 },
        { kind: 'measured_move', label: 'Measured move', price: 106 },
      ],
      100,
      s,
    );
    expect(plan.targets.map((t) => t.label)).toEqual(['1h 48 EMA', 'Measured move']);
    expect(plan.targets[1]!.estimate).toBeCloseTo(2 + 0.6 * 6 + 0.5 * 0.05 * 36 - 0.05, 10);
  });

  it('subtracts exactly one day of theta', () => {
    const base = opt({ type: 'call', strike: 100, ask: 2, delta: 0.5, gamma: 0, theta: 0 });
    const decaying = { ...base, theta: -0.3 };
    const target = [{ kind: 'pattern' as const, label: 'Pattern target', price: 102 }];
    expect(buildExitPlan(base, target, 100, s).targets[0]!.estimate).toBeCloseTo(3, 10);
    expect(buildExitPlan(decaying, target, 100, s).targets[0]!.estimate).toBeCloseTo(2.7, 10);
  });
});

describe('entryStatus', () => {
  it('AT ENTRY when the ask is in the bottom 25% of the current-session day range', () => {
    // range 1.8–2.6 → zone 1.8–2.0
    expect(entryStatus(opt({ type: 'call', strike: 100, ask: 2.0 }), SESSION, s)).toEqual({
      zone: { low: 1.8, high: 2.0 },
      status: 'AT ENTRY',
    });
  });

  it('ABOVE ENTRY ZONE when the ask is higher in the range', () => {
    expect(entryStatus(opt({ type: 'call', strike: 100, ask: 2.1 }), SESSION, s).status).toBe('ABOVE ENTRY ZONE');
  });

  it('NO CURRENT RANGE when the day bar is from an older session or missing', () => {
    expect(entryStatus(opt({ type: 'call', strike: 100, ask: 1.9, dayBarDate: '2026-10-20' }), SESSION, s).status).toBe(
      'NO CURRENT RANGE',
    );
    expect(entryStatus(opt({ type: 'call', strike: 100, dayLow: null, dayHigh: null, dayBarDate: null }), SESSION, s)).toEqual({
      zone: null,
      status: 'NO CURRENT RANGE',
    });
  });
});
