import type { PatternEntry } from '../api/types';

export interface PatternGroup {
  /** contract symbol, or null for patterns with no contract */
  symbol: string | null;
  patterns: PatternEntry[];
}

/** One right panel per distinct contract (and one for all no-contract patterns), in first-appearance order. */
export function groupByContract(patterns: PatternEntry[]): PatternGroup[] {
  const groups = new Map<string, PatternGroup>();
  for (const p of patterns) {
    const symbol = 'symbol' in p.contract ? p.contract.symbol : null;
    const key = symbol ?? '__none__';
    if (!groups.has(key)) groups.set(key, { symbol, patterns: [] });
    groups.get(key)!.patterns.push(p);
  }
  return [...groups.values()];
}
