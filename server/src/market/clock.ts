import type { AlpacaClient } from '../providers/alpaca/client.js';
import { etClock, hhmmToMinutes } from '../providers/et.js';

export interface MarketClock {
  isOpen: boolean;
  /** unix seconds */
  timestamp: number;
  nextOpen: number;
  nextClose: number;
}

/** One trading session; open/close are ET "HH:MM" (half days close early, e.g. "13:00"). */
export interface TradingDay {
  date: string;
  open: string;
  close: string;
}

export interface MarketCalendarProvider {
  getClock(): Promise<MarketClock>;
  /** start/end YYYY-MM-DD inclusive */
  getCalendar(start: string, end: string): Promise<TradingDay[]>;
}

const unix = (iso: string) => Date.parse(iso) / 1000;

export function mapClock(body: unknown): MarketClock {
  const b = body as { timestamp: string; is_open: boolean; next_open: string; next_close: string };
  return { isOpen: b.is_open, timestamp: unix(b.timestamp), nextOpen: unix(b.next_open), nextClose: unix(b.next_close) };
}

export function mapCalendar(body: unknown): TradingDay[] {
  if (!Array.isArray(body)) return [];
  return body.map((d: { date: string; open: string; close: string }) => ({ date: d.date, open: d.open, close: d.close }));
}

/** Date of the session in progress, or the most recent finished one (weekends/holidays/pre-open → previous). */
export function lastSessionDate(days: TradingDay[], nowUnix: number): string | null {
  const now = etClock(nowUnix);
  const started = days.filter((d) => d.date < now.date || (d.date === now.date && now.minutes >= hhmmToMinutes(d.open)));
  return started.map((d) => d.date).sort().at(-1) ?? null;
}

/** Read-only market clock and calendar from Alpaca's paper server. */
export class AlpacaMarketProvider implements MarketCalendarProvider {
  constructor(private readonly client: AlpacaClient) {}

  async getClock(): Promise<MarketClock> {
    return mapClock(await this.client.get('paper', '/v2/clock', {}));
  }

  async getCalendar(start: string, end: string): Promise<TradingDay[]> {
    return mapCalendar(await this.client.get('paper', '/v2/calendar', { start, end }));
  }
}
