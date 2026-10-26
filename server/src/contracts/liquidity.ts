import type { TradingDay } from '../market/clock.js';
import type { OptionContract } from '../providers/types.js';

export interface Liquidity {
  /** the number the ≥ 100 floor and the grade C ≥ 1,000 check use */
  value: number;
  /** which figure `value` is */
  source: 'oi' | 'volume';
  /** open interest is older than the previous session (or missing) */
  stale: boolean;
  openInterest: number;
  openInterestDate: string | null;
  /** previous-session contract volume, only looked up when OI is stale */
  volume: number | null;
  volumeDate: string | null;
}

/** The trading day before `sessionDate`, from the calendar; null when not in it. */
export function previousSessionDate(days: TradingDay[], sessionDate: string): string | null {
  return days.map((d) => d.date).filter((d) => d < sessionDate).sort().at(-1) ?? null;
}

/**
 * Fresh OI (dated the previous session or later) is used as is. Stale or missing OI: the larger of OI and the
 * previous session's contract volume (from whichever Alpaca daily bar is dated the previous session).
 */
export function liquidity(c: OptionContract, previousSession: string | null): Liquidity {
  const base = { openInterest: c.openInterest, openInterestDate: c.openInterestDate };
  const stale = previousSession != null && (c.openInterestDate == null || c.openInterestDate < previousSession);
  if (!stale) return { value: c.openInterest, source: 'oi', stale: false, ...base, volume: null, volumeDate: null };

  const volume = c.dayBarDate === previousSession ? c.volume : c.prevDayBarDate === previousSession ? c.prevDayVolume : null;
  const useVolume = volume != null && volume > c.openInterest;
  return {
    value: useVolume ? volume : c.openInterest,
    source: useVolume ? 'volume' : 'oi',
    stale: true,
    ...base,
    volume,
    volumeDate: volume != null ? previousSession : null,
  };
}
