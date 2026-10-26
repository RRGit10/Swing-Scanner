import type { Liquidity } from '../api/types';
import { shortDate } from './format';

const n = (v: number) => v.toLocaleString('en-US');
const weekday = (date: string) => shortDate(date).split(' ')[0];

/** Card text for the number the OI checks used, plus a stale flag ("OI stale (Thu Oct 22)") when OI is old. */
export function liquidityText(l: Liquidity): { text: string; stale: string | null } {
  if (!l.stale) return { text: `OI ${n(l.openInterest)} (${shortDate(l.openInterestDate)})`, stale: null };
  const stale = l.openInterestDate ? `OI stale (${shortDate(l.openInterestDate)})` : 'no OI figure';
  if (l.source === 'volume') return { text: `Liquidity: ${weekday(l.volumeDate!)} volume ${n(l.volume!)}, OI ${n(l.openInterest)}`, stale };
  const vol = l.volume != null && l.volumeDate ? ` (${weekday(l.volumeDate)} volume ${n(l.volume)})` : '';
  return { text: `Liquidity: OI ${n(l.openInterest)}${vol}`, stale };
}
