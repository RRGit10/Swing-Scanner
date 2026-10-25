import { addDays } from '../providers/et.js';
import type { EarningsEvent } from '../providers/types.js';
import type { ContractSettings } from './types.js';

/** Calendar days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Weekly Friday expirations between minDte and maxDte calendar days out, nearest first.
 * When a week's Friday isn't listed (market holiday), that week's Thursday stands in.
 */
export function fridayExpirations(expirations: string[], today: string, s: ContractSettings): string[] {
  const listed = new Set(expirations);
  const out: string[] = [];
  let friday = addDays(today, (5 - dayOfWeek(today) + 7) % 7);
  for (; daysBetween(today, friday) <= s.maxDte; friday = addDays(friday, 7)) {
    const pick = listed.has(friday) ? friday : listed.has(addDays(friday, -1)) ? addDays(friday, -1) : null;
    if (pick && daysBetween(today, pick) >= s.minDte) out.push(pick);
  }
  return out;
}

/** First earnings date from today through expiration day, or null. */
export function earningsBeforeExpiration(events: EarningsEvent[], today: string, expiration: string): string | null {
  const dates = events.map((e) => e.date).filter((d) => d >= today && d <= expiration).sort();
  return dates[0] ?? null;
}
