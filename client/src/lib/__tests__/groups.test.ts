import { describe, expect, it } from 'vitest';
import { groupByContract } from '../groups';

const p = (key: string, symbol: string | null) =>
  ({ key, contract: symbol ? { symbol, exitPlan: { breakEven: 0, markers: [], targets: [] }, skippedExpirations: [] } : { none: 'no contract fits', skippedExpirations: [] } }) as never;

describe('groupByContract', () => {
  it('patterns sharing a contract share one right panel; all no-contract patterns share one', () => {
    const groups = groupByContract([p('a', 'SPY1'), p('b', null), p('c', 'SPY1'), p('d', 'SPY2'), p('e', null)]);
    expect(groups.map((g) => [g.symbol, g.patterns.map((x: { key: string }) => x.key)])).toEqual([
      ['SPY1', ['a', 'c']],
      [null, ['b', 'e']],
      ['SPY2', ['d']],
    ]);
  });

  it('keeps first-appearance order (patterns arrive sorted by status)', () => {
    expect(groupByContract([p('x', null), p('y', 'Q')]).map((g) => g.symbol)).toEqual([null, 'Q']);
  });
});
