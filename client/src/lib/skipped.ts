import type { Skipped } from '../api/types';

const UNINFORMATIVE = new Set(['no greeks', 'no ask']);

/** Totals the per-expiration skip reasons ("no contract passed (93 over budget, …)"), most common first. */
export function summarizeSkipped(skipped: Skipped[]): { expirations: string[]; reasons: { reason: string; count: number | null }[] } {
  const counts = new Map<string, number | null>();
  for (const s of skipped) {
    const inner = /^no contract passed \((.*)\)$/.exec(s.reason)?.[1];
    if (!inner) {
      counts.set(s.reason, null);
      continue;
    }
    for (const part of inner.split(', ')) {
      const m = /^(\d+) (.+)$/.exec(part);
      if (m) counts.set(m[2]!, (counts.get(m[2]!) ?? 0) + Number(m[1]));
    }
  }
  return {
    expirations: skipped.map((s) => s.expiration),
    // Actionable reasons first; contracts with no greeks/ask are usually deep in or out of the money.
    reasons: [...counts]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => Number(UNINFORMATIVE.has(a.reason)) - Number(UNINFORMATIVE.has(b.reason)) || (b.count ?? 0) - (a.count ?? 0)),
  };
}
