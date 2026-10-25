import type { CandleLabel } from '../analysis/candles.js';
import type { EmaLevel, EmaTableRow } from '../analysis/emaLevels.js';
import type { KeyPoint, PatternLine, PatternType } from '../analysis/patterns/types.js';
import type { Target } from '../analysis/targets.js';
import type { Direction } from '../analysis/types.js';
import type { ContractPick, ContractResult, ExitPlan, SkippedExpiration } from '../contracts/types.js';
import type { IntradayTimeframe } from '../providers/types.js';
import { statusRank, type SignalStatus } from './status.js';

export type PatternContract =
  | { symbol: string; exitPlan: ExitPlan; skippedExpirations: SkippedExpiration[] }
  | { none: string; skippedExpirations: SkippedExpiration[] };

export interface PatternEntry {
  key: string;
  type: PatternType;
  direction: Direction;
  timeframes: IntradayTimeframe[];
  tradingTimeframe: IntradayTimeframe;
  state: 'armed' | 'triggered';
  status: SignalStatus;
  lowerQuality: boolean;
  /** unix seconds the trigger candle closed */
  triggerTime: number | null;
  triggerLevel: number;
  invalidation: number;
  targets: Target[];
  candleLabels: CandleLabel[];
  /** key points and lines per time frame the pattern appears on (trading chart first) */
  drawings: Partial<Record<IntradayTimeframe, { points: KeyPoint[]; lines: PatternLine[] }>>;
  /** nearest Friday ≥ minDte: the stock-outcome deadline if the trigger fires with no contract */
  horizonExpiration: string | null;
  /** daily 13/48/55/200 EMAs between price and the final target (resistance/support in the trade's path) */
  dailyEmasInPath: EmaLevel[];
  /** 55 EMA reversal in the pattern's direction within the last 3 candles of the trading chart */
  ema55Reversal: { time: number } | null;
  /** the shared contract is listed once under the ticker; each pattern keeps its own exit plan */
  contract: PatternContract;
}

export interface TickerEntry {
  ticker: string;
  /** Finnhub real-time */
  price: number | null;
  /** latest delayed SIP 15m close (aligned with the delayed option quotes) */
  delayedPrice: number | null;
  emaTable: EmaTableRow[];
  patterns: PatternEntry[];
  contracts: ContractPick[];
  bestStatus: SignalStatus | null;
  error?: string;
}

/** One entry per ticker: patterns sorted by status, each distinct contract listed once. */
export function buildTickerEntry(
  base: Pick<TickerEntry, 'ticker' | 'price' | 'delayedPrice' | 'emaTable'>,
  items: { pattern: Omit<PatternEntry, 'contract'>; result: ContractResult }[],
): TickerEntry {
  const contracts = new Map<string, ContractPick>();
  const patterns: PatternEntry[] = items.map(({ pattern, result }) => {
    if (result.kind === 'none') {
      return { ...pattern, contract: { none: result.reason, skippedExpirations: result.skippedExpirations } };
    }
    if (!contracts.has(result.contract.symbol)) contracts.set(result.contract.symbol, result);
    return {
      ...pattern,
      contract: { symbol: result.contract.symbol, exitPlan: result.exitPlan, skippedExpirations: result.skippedExpirations },
    };
  });
  patterns.sort((a, b) => statusRank(a.status) - statusRank(b.status));
  return { ...base, patterns, contracts: [...contracts.values()], bestStatus: patterns[0]?.status ?? null };
}

/** AT ENTRY / READY tickers first, then WATCH, WAIT; tickers without patterns last. */
export function sortTickers(entries: TickerEntry[]): TickerEntry[] {
  const rank = (t: TickerEntry) => (t.bestStatus ? statusRank(t.bestStatus) : 99);
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.ticker.localeCompare(b.ticker));
}
