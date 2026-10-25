import type { CandleName } from '../analysis/candles.js';
import type { Target } from '../analysis/targets.js';
import type { Direction } from '../analysis/types.js';
import type { EarningsEvent, OptionContract } from '../providers/types.js';
import { daysBetween, earningsBeforeExpiration, fridayExpirations } from './expiration.js';
import { buildExitPlan, entryStatus, estimateAt } from './exitPlan.js';
import type { ContractResult, ContractSettings, Grade, SkippedExpiration } from './types.js';

export interface SelectionInput {
  direction: Direction;
  /** every listed expiration for the underlying */
  expirations: string[];
  /** ET date */
  today: string;
  /** date of the current (or, when closed, most recent) trading session */
  sessionDate: string;
  /** stock targets, nearest first; T1 drives the gain-at-target check */
  targets: Target[];
  /** the pattern's trigger has fired ("price already moving the right way") */
  triggered: boolean;
  /** labels on the newest candle of the trading chart */
  newestCandleNames: readonly CandleName[];
  /** underlying price at option-quote time (delayed), for the estimate */
  quotePrice: number;
  earnings: EarningsEvent[];
  settings: ContractSettings;
}

/** Grade from |delta|; null = rejected (far OTM). */
export function gradeFor(delta: number, s: ContractSettings): Grade | null {
  const d = Math.abs(delta);
  if (d >= s.gradeA) return 'A';
  if (d >= s.gradeB) return 'B';
  if (d >= s.gradeC) return 'C';
  return null;
}

function isPowerCandle(names: readonly CandleName[], direction: Direction): boolean {
  return direction === 'bullish'
    ? names.includes('boom_boom') || names.includes('three_green_soldiers')
    : names.includes('red_boom_boom');
}

/** First rule a contract fails, or null if it passes. */
function rejection(c: OptionContract, input: SelectionInput, t1: number): string | null {
  const s = input.settings;
  if (c.delta == null || c.gamma == null || c.theta == null || c.iv == null) return 'no greeks';
  if (c.ask == null || c.ask <= 0) return 'no ask';
  if (c.ask < s.minPremium) return `under $${s.minPremium.toFixed(2)}`;
  if (c.ask * 100 > s.budget) return 'over budget';
  if (c.openInterest < s.minOpenInterest) return `OI < ${s.minOpenInterest}`;
  const grade = gradeFor(c.delta, s);
  if (!grade) return `delta < ${s.gradeC}`;
  if (
    grade === 'C' &&
    !(isPowerCandle(input.newestCandleNames, input.direction) && input.triggered && c.openInterest >= s.gradeCMinOpenInterest)
  ) {
    return 'grade C conditions not met';
  }
  // The method sells at the target (usually same day), so the test is value at T1, not break-even at expiration.
  if (estimateAt(c, t1, input.quotePrice, s) <= c.ask) return 'no gain at T1';
  return null;
}

/**
 * Long call (bullish) or long put (bearish). Walks Friday expirations 7–30 days out and uses the first
 * one with a contract passing every check; picks the highest |delta| (ties: lower ask, higher OI).
 */
export async function selectContract(
  input: SelectionInput,
  getChain: (expiration: string) => Promise<OptionContract[]>,
): Promise<ContractResult> {
  const s = input.settings;
  const fridays = fridayExpirations(input.expirations, input.today, s);
  if (!fridays.length) return { kind: 'none', reason: `no Friday expiration ${s.minDte}–${s.maxDte} days out`, skippedExpirations: [] };

  const type = input.direction === 'bullish' ? 'call' : 'put';
  const t1 = input.targets[0]!.price;
  const skippedExpirations: SkippedExpiration[] = [];

  for (const expiration of fridays) {
    const counts = new Map<string, number>();
    const passing: OptionContract[] = [];
    for (const c of await getChain(expiration)) {
      if (c.type !== type) continue;
      const why = rejection(c, input, t1);
      if (why) counts.set(why, (counts.get(why) ?? 0) + 1);
      else passing.push(c);
    }

    if (!passing.length) {
      const detail = [...counts].map(([why, n]) => `${n} ${why}`).join(', ');
      skippedExpirations.push({ expiration, reason: detail ? `no contract passed (${detail})` : `no ${type}s listed` });
      continue;
    }

    const contract = passing.sort(
      (a, b) => Math.abs(b.delta!) - Math.abs(a.delta!) || a.ask! - b.ask! || b.openInterest - a.openInterest,
    )[0]!;
    return {
      kind: 'pick',
      contract,
      grade: gradeFor(contract.delta!, s)!,
      expiration,
      dte: daysBetween(input.today, expiration),
      entry: entryStatus(contract, input.sessionDate, s),
      exitPlan: buildExitPlan(contract, input.targets, input.quotePrice, s),
      earningsDate: earningsBeforeExpiration(input.earnings, input.today, expiration),
      skippedExpirations,
    };
  }
  return { kind: 'none', reason: 'no contract fits', skippedExpirations };
}
