import type { PatternEntry } from './group.js';
import type { SignalStatus } from './status.js';

const CAPPED: SignalStatus[] = ['READY', 'AT ENTRY'];

/**
 * Opposite-direction patterns detected on the same time frame of one ticker conflict: both stay listed with a
 * "Conflicting signals" flag and are capped at WATCH (never READY or AT ENTRY) while the conflict lasts.
 * Same-direction patterns, and opposite ones on different time frames, are left as they are.
 */
export function applyConflicts(patterns: PatternEntry[]): PatternEntry[] {
  return patterns.map((p) => {
    const opposing = patterns.filter((o) => o !== p && o.direction !== p.direction && o.timeframes.some((tf) => p.timeframes.includes(tf)));
    if (!opposing.length) return { ...p, conflict: null };
    const timeframes = p.timeframes.filter((tf) => opposing.some((o) => o.timeframes.includes(tf)));
    return {
      ...p,
      status: CAPPED.includes(p.status) ? 'WATCH' : p.status,
      conflict: { with: [...new Set(opposing.map((o) => o.type))], timeframes },
    };
  });
}
