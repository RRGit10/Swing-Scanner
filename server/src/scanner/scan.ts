import { classifyLastThree } from '../analysis/candles.js';
import { emaTable } from '../analysis/emaLevels.js';
import { mergeTimeframes, type TimeframeMatch } from '../analysis/merge.js';
import { detectPatterns } from '../analysis/patterns/index.js';
import { patternTargets } from '../analysis/targets.js';
import { fridayExpirations } from '../contracts/expiration.js';
import { selectContract } from '../contracts/select.js';
import type { TradingDay } from '../market/clock.js';
import { lowerQuality } from '../market/timing.js';
import { aggregate15m } from '../providers/aggregate.js';
import { addDays, etClock, etToUnix, hhmmToMinutes } from '../providers/et.js';
import type {
  Candle,
  EarningsEvent,
  EarningsProvider,
  IntradayTimeframe,
  OptionContract,
  OptionsProvider,
  QuoteProvider,
} from '../providers/types.js';
import type { CandleCache, DailyMemo } from './cache.js';
import { buildTickerEntry, type PatternEntry, type TickerEntry } from './group.js';
import type { AppSettings } from './settings.js';
import { signalStatus } from './status.js';

export interface ScanDeps {
  candles: CandleCache;
  quotes: QuoteProvider;
  options: OptionsProvider;
  earnings: EarningsProvider;
  memo: { expirations: DailyMemo<string[]>; earnings: DailyMemo<EarningsEvent[]> };
}

export interface ScanContext {
  /** ET date */
  today: string;
  /** current or most recent session date (decides "no current range") */
  sessionDate: string;
  /** trading days around today, to time the trigger candle's close */
  calendar: TradingDay[];
  settings: AppSettings;
}

export const TIMEFRAMES: IntradayTimeframe[] = ['15m', '30m', '1h'];
const TF_MINUTES: Record<IntradayTimeframe, number> = { '15m': 15, '30m': 30, '1h': 60 };

export function timeframeCandles(bars15: Candle[]): Record<IntradayTimeframe, Candle[]> {
  return { '15m': bars15, '30m': aggregate15m(bars15, '30m'), '1h': aggregate15m(bars15, '1h') };
}

/** Close time of a bar, capped at its session's close (the last 1h bar is 15:30–16:00). */
export function barCloseTime(barTime: number, tf: IntradayTimeframe, calendar: TradingDay[]): number {
  const date = etClock(barTime).date;
  const day = calendar.find((d) => d.date === date);
  const sessionClose = etToUnix(date, hhmmToMinutes(day?.close ?? '16:00'));
  return Math.min(barTime + TF_MINUTES[tf] * 60, sessionClose);
}

/** Scan one ticker: patterns on 15m/30m/1h, merged; targets, candle bias, contract, status. Never throws. */
export async function scanTicker(deps: ScanDeps, symbol: string, ctx: ScanContext): Promise<TickerEntry> {
  const s = ctx.settings;
  try {
    const bars15 = await deps.candles.get15m(symbol);
    const daily = await deps.candles.getDaily(symbol, ctx.today);
    const byTf = timeframeCandles(bars15);
    const quote = await deps.quotes.getQuote(symbol);
    const delayedPrice = bars15.at(-1)?.close ?? null;
    const table = emaTable({ ...byTf, '1d': daily });
    const base = { ticker: symbol, price: quote.price, delayedPrice, emaTable: table };

    const found: TimeframeMatch[] = TIMEFRAMES.flatMap((timeframe) =>
      detectPatterns(byTf[timeframe], s.patterns, s.candles).map((match) => ({ timeframe, match })),
    );
    const merged = mergeTimeframes(found);
    if (!merged.length || delayedPrice == null) return buildTickerEntry(base, []);

    const [expirations, earnings] = await Promise.all([
      deps.memo.expirations.get(symbol, ctx.today, () => deps.options.getExpirations(symbol)),
      deps.memo.earnings.get(symbol, ctx.today, () =>
        deps.earnings.getEarnings(symbol, ctx.today, addDays(ctx.today, s.contracts.maxDte)),
      ),
    ]);
    const chains = new Map<string, Promise<OptionContract[]>>();
    const getChain = (exp: string) => {
      if (!chains.has(exp)) chains.set(exp, deps.options.getChain(symbol, exp));
      return chains.get(exp)!;
    };

    const horizonExpiration = fridayExpirations(expirations, ctx.today, s.contracts)[0] ?? null;
    const items = [];
    for (const sig of merged) {
      const m = sig.match;
      const tf = sig.tradingTimeframe;
      const candles = byTf[tf];
      const labels = classifyLastThree(candles, s.candles);
      const targets = patternTargets(m, table, quote.price);
      const triggerClose = m.triggerTime == null ? null : barCloseTime(m.triggerTime, tf, ctx.calendar);
      const result = await selectContract(
        {
          direction: m.direction,
          expirations,
          today: ctx.today,
          sessionDate: ctx.sessionDate,
          targets,
          triggered: m.state === 'triggered',
          newestCandleNames: labels.labels.at(-1)?.names ?? [],
          quotePrice: delayedPrice,
          earnings,
          settings: s.contracts,
        },
        getChain,
      );
      const drawings: PatternEntry['drawings'] = { [tf]: { points: m.points, lines: m.lines } };
      for (const o of sig.others) drawings[o.timeframe] = { points: o.match.points, lines: o.match.lines };

      items.push({
        pattern: {
          key: `${symbol}|${m.type}|${m.direction}|${m.points[0]!.time}`,
          type: m.type,
          direction: m.direction,
          timeframes: sig.timeframes,
          tradingTimeframe: tf,
          state: m.state,
          status: signalStatus({
            state: m.state,
            candleBias: labels.bias,
            direction: m.direction,
            entryStatus: result.kind === 'pick' ? result.entry.status : null,
          }),
          lowerQuality:
            triggerClose != null &&
            lowerQuality(triggerClose, ctx.calendar.find((d) => d.date === etClock(triggerClose).date)),
          triggerTime: triggerClose,
          triggerLevel: m.triggerLevel,
          invalidation: m.invalidation,
          targets,
          candleLabels: labels.labels,
          drawings,
          horizonExpiration,
        },
        result,
      });
    }
    return buildTickerEntry(base, items);
  } catch (err) {
    return { ticker: symbol, price: null, delayedPrice: null, emaTable: [], patterns: [], contracts: [], bestStatus: null, error: (err as Error).message };
  }
}
