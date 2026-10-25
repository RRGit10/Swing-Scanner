import { config } from '../../config.js';
import { aggregate15m, filterRegularHours } from '../aggregate.js';
import { etClock } from '../et.js';
import type { Candle, CandleProvider, CandleRange, Timeframe } from '../types.js';
import type { AlpacaClient } from './client.js';

const DAY_MS = 86_400_000;
const DEFAULT_INTRADAY_DAYS = 180;
const DEFAULT_DAILY_DAYS = 1100;
/** The free plan only allows SIP data older than 15 minutes. */
const SIP_DELAY_MS = 16 * 60_000;

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

type BarTimeframe = '1Min' | '15Min' | '1Day';

export function mapBars(body: unknown, symbol: string, timeframe: BarTimeframe): Candle[] {
  const bars = (body as { bars?: Record<string, AlpacaBar[]> | null }).bars?.[symbol] ?? [];
  return bars.map((b) => {
    const unix = Date.parse(b.t) / 1000;
    // Daily bars are stamped at midnight ET; re-stamp to 00:00 UTC of that ET date.
    const time = timeframe === '1Day' ? Date.parse(`${etClock(unix).date}T00:00:00Z`) / 1000 : unix;
    return { time, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v };
  });
}

export class AlpacaCandleProvider implements CandleProvider {
  constructor(private readonly client: AlpacaClient) {}

  async getCandles(symbol: string, timeframe: Timeframe, range: CandleRange = {}): Promise<Candle[]> {
    const end = this.clampEnd(range.end);
    const alpacaTf = timeframe === '1d' ? '1Day' : '15Min';
    const lookback = timeframe === '1d' ? DEFAULT_DAILY_DAYS : DEFAULT_INTRADAY_DAYS;
    const start = range.start ?? new Date(end.getTime() - lookback * DAY_MS);

    const bars = await this.fetchBars(symbol, alpacaTf, start, end);
    if (timeframe === '1d') return bars;

    const regular = filterRegularHours(bars);
    return timeframe === '15m' ? regular : aggregate15m(regular, timeframe);
  }

  async getMinuteBars(symbol: string, start: Date, end: Date): Promise<Candle[]> {
    const clamped = this.clampEnd(end);
    if (clamped <= start) return [];
    return filterRegularHours(await this.fetchBars(symbol, '1Min', start, clamped));
  }

  /** The free plan only serves SIP bars older than 15 minutes. */
  private clampEnd(end?: Date): Date {
    const latestAllowed = Date.now() - (config.stockFeed === 'sip' ? SIP_DELAY_MS : 0);
    return new Date(Math.min(end?.getTime() ?? latestAllowed, latestAllowed));
  }

  private async fetchBars(symbol: string, timeframe: BarTimeframe, start: Date, end: Date): Promise<Candle[]> {
    const pages = await this.client.getAllPages('data', '/v2/stocks/bars', {
      symbols: symbol,
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      feed: config.stockFeed,
      // Splits + dividends, to match brokers' "Adjusted" charts.
      adjustment: 'all',
      sort: 'asc',
      limit: '10000',
    });
    return pages.flatMap((p) => mapBars(p, symbol, timeframe));
  }
}
