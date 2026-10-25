import { describe, expect, it } from 'vitest';
import { summarizeSkipped } from '../skipped';

describe('summarizeSkipped', () => {
  it('adds up reasons across expirations, most common first, with no-greeks last', () => {
    const s = summarizeSkipped([
      { expiration: '2026-10-30', reason: 'no contract passed (38 no greeks, 48 under $0.50, 93 over budget)' },
      { expiration: '2026-11-06', reason: 'no contract passed (6 no greeks, 21 under $0.50, 122 over budget, 1 no gain at T1)' },
    ]);
    expect(s.expirations).toEqual(['2026-10-30', '2026-11-06']);
    expect(s.reasons).toEqual([
      { reason: 'over budget', count: 215 },
      { reason: 'under $0.50', count: 69 },
      { reason: 'no gain at T1', count: 1 },
      { reason: 'no greeks', count: 44 },
    ]);
  });

  it('keeps reasons that are not counts (e.g. no puts listed)', () => {
    expect(summarizeSkipped([{ expiration: '2026-10-30', reason: 'no puts listed' }]).reasons).toEqual([{ reason: 'no puts listed', count: null }]);
  });
});
