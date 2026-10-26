/** Shapes returned by the server API (mirrors server/src types; kept slim on purpose). */
export type Direction = 'bullish' | 'bearish';
export type Status = 'AT ENTRY' | 'READY' | 'WATCH' | 'WAIT';
export type Timeframe = '15m' | '30m' | '1h' | '1d';
export type IntradayTf = '15m' | '30m' | '1h';

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface PricePoint { time: number; price: number }
export interface KeyPoint extends PricePoint { label: string; index: number }
export interface PatternLine { label: string; from: PricePoint; to: PricePoint }
export interface Target { kind: 'ema' | 'measured_move' | 'pattern'; label: string; price: number }
export interface EmaLevel { period: 13 | 48 | 55 | 200; value: number }
export type EmaValues = Record<'13' | '48' | '55' | '200', number | null>;
export interface EmaRow { timeframe: Timeframe; bars: number; price: number; ema: EmaValues; support: EmaLevel | null; resistance: EmaLevel | null }
export interface CandleLabel { time: number; names: string[]; bias: 'bullish' | 'bearish' | 'neutral' | 'none' }

export interface OptionContract {
  symbol: string; underlying: string; type: 'call' | 'put'; strike: number; expiration: string;
  bid: number | null; ask: number | null; last: number | null; dayLow: number | null; dayHigh: number | null;
  dayBarDate: string | null; volume: number; prevDayVolume?: number | null; prevDayBarDate?: string | null;
  openInterest: number; openInterestDate: string | null;
  delta: number | null; gamma: number | null; theta: number | null; iv: number | null; quoteTime: string | null;
}
export interface ExitTarget { label: string; stockPrice: number; estimate: number; estimateChangePct: number }
export interface ExitPlan { breakEven: number; markers: { pct: number; price: number }[]; targets: ExitTarget[] }
export interface Skipped { expiration: string; reason: string }
/** what the OI floor and grade C checks used: OI, or previous-session volume when OI is stale */
export interface Liquidity {
  value: number; source: 'oi' | 'volume'; stale: boolean; openInterest: number; openInterestDate: string | null;
  volume: number | null; volumeDate: string | null;
}
export interface ContractPick {
  kind: 'pick'; contract: OptionContract; grade: 'A' | 'B' | 'C'; expiration: string; dte: number;
  /** absent in scans saved before this field existed */
  liquidity?: Liquidity;
  entry: { zone: { low: number; high: number } | null; status: 'AT ENTRY' | 'ABOVE ENTRY ZONE' | 'NO CURRENT RANGE' };
  exitPlan: ExitPlan; earningsDate: string | null; skippedExpirations: Skipped[];
}
export type PatternContract =
  | { symbol: string; exitPlan: ExitPlan; skippedExpirations: Skipped[] }
  | { none: string; skippedExpirations: Skipped[] };

export interface PatternEntry {
  key: string; type: string; direction: Direction; timeframes: IntradayTf[]; tradingTimeframe: IntradayTf;
  state: 'armed' | 'triggered'; status: Status; lowerQuality: boolean; triggerTime: number | null;
  triggerLevel: number; invalidation: number; targets: Target[]; candleLabels: CandleLabel[];
  drawings: Partial<Record<IntradayTf, { points: KeyPoint[]; lines: PatternLine[] }>>;
  horizonExpiration?: string | null;
  /** added in phase 6; absent in scans saved earlier */
  dailyEmasInPath?: EmaLevel[];
  ema55Reversal?: { time: number } | null;
  /** opposite-direction pattern(s) on the same time frame; status is capped at WATCH while set */
  conflict?: { with: string[]; timeframes: IntradayTf[] } | null;
  contract: PatternContract;
}
export interface TickerEntry {
  ticker: string; price: number | null; delayedPrice: number | null; emaTable: EmaRow[];
  patterns: PatternEntry[]; contracts: ContractPick[]; bestStatus: Status | null; error?: string;
}

export interface StatusPayload {
  market: 'open' | 'closed'; banner: string | null; sessionDate: string | null; inLiquidWindow: boolean;
  lastScanAt: number | null; nextScanAt: number | null; scanning?: boolean; scannerError?: string | null;
}
export interface SignalsPayload {
  scannedAt: number | null; finishedAt: number | null; market: 'open' | 'closed' | null;
  sessionDate: string | null; errors: string[]; tickers: TickerEntry[];
}
export interface ChartPayload {
  ticker: string; timeframe: Timeframe; candles: Candle[]; ema: Record<'13' | '48' | '55' | '200', (number | null)[]>;
  patterns: { key: string; type: string; direction: Direction; status: Status; points: KeyPoint[]; lines: PatternLine[] }[];
}

export type Outcome = 'open' | 'pending' | 'win' | 'loss' | 'expired' | 'never_triggered' | 'no_contract' | 'already_resolved';
export interface SignalEvent { kind: string; at: number; from: string | null; to: string | null; detail: unknown }
export interface HistorySignal {
  id: number; key: string; ticker: string; type: string; direction: Direction; timeframes: IntradayTf[];
  tradingTimeframe: IntradayTf; firstSeenAt: number; lastSeenAt: number; status: Status; lowerQuality: boolean;
  triggerTime: number | null; frozenAt: number | null; frozenT1: number | null; frozenContract: string | null;
  entryAsk: number | null; expiration: string | null; lowestEntryAsk: number | null; outcome: Outcome;
  outcomeAt: number | null; exitBid: number | null; exitAsk: number | null; exitNote: string | null;
  gainPct: number | null; endedAt: number | null; endedReason: string | null; settingsVersion: number; events: SignalEvent[];
}
export interface OutcomeCounts { resolved: number; wins: number; losses: number; expired: number; hitRate: number | null }
export interface HistorySummary {
  total: number; triggered: number; pending: number; neverTriggered: number; noContract: number;
  /** absent from servers before this field existed */
  alreadyResolved?: number;
  pattern: OutcomeCounts; tradeable: OutcomeCounts & { avgGainPct: number | null; gainSamples: number };
}
export interface SettingsChange { path: string; from: unknown; to: unknown }
export interface HistoryPayload {
  currentVersion: number;
  versions: { version: number; savedAt: number; changes: SettingsChange[]; note: string | null }[];
  summary: { current: HistorySummary; allTime: HistorySummary };
  /** per pattern type; absent from servers before this field existed */
  byPattern?: { current: Record<string, HistorySummary>; allTime: Record<string, HistorySummary> };
  notClassMethod?: string[];
  signals: HistorySignal[];
}

/** Editable settings (server validates). */
export interface AppSettings {
  watchlist: string[];
  patterns: Record<string, number>;
  candles: Record<string, number>;
  contracts: Record<string, number> & { profitMarkers: number[] };
  ema: { reversalTolerance: number };
  scanner: Record<string, number>;
}
export interface SettingsPayload {
  version: number; savedAt: number; settings: AppSettings; defaults: AppSettings; note: string | null;
  changed?: boolean;
}
