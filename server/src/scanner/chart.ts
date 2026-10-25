import { emaSet } from '../analysis/ema.js';
import type { ChartPayload } from '../api/routes.js';
import { etToday } from '../providers/et.js';
import type { Timeframe } from '../providers/types.js';
import type { ScannerDb } from '../storage/db.js';
import type { CandleCache } from './cache.js';
import type { TickerEntry } from './group.js';
import { timeframeCandles } from './scan.js';

/** Chart data for the detail view: candles, the 4 EMAs, and the latest scan's pattern drawings on that time frame. */
export function makeChart(cache: CandleCache, db: ScannerDb) {
  return async (ticker: string, tf: Timeframe): Promise<ChartPayload | null> => {
    const entry = ((db.latestScan()?.payload as { tickers?: TickerEntry[] } | undefined)?.tickers ?? []).find((t) => t.ticker === ticker);
    if (!entry) return null; // only tickers the scanner knows about
    const candles = tf === '1d' ? await cache.getDaily(ticker, etToday()) : timeframeCandles(await cache.get15m(ticker))[tf];
    if (!candles.length) return null;
    return {
      ticker,
      timeframe: tf,
      candles,
      ema: emaSet(candles),
      patterns: tf === '1d'
        ? []
        : entry.patterns.flatMap((p) => {
            const d = p.drawings[tf];
            return d ? [{ key: p.key, type: p.type, direction: p.direction, status: p.status, points: d.points, lines: d.lines }] : [];
          }),
    };
  };
}
