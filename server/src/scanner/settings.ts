import { DEFAULT_CANDLE_SETTINGS, type CandleSettings } from '../analysis/candles.js';
import { DEFAULT_PATTERN_SETTINGS, type PatternSettings } from '../analysis/patterns/types.js';
import { DEFAULT_CONTRACT_SETTINGS, type ContractSettings } from '../contracts/types.js';
import { DEFAULT_WATCHLIST } from '../watchlist.js';

export interface ScannerSettings {
  /** scan cadence inside a liquid window */
  liquidIntervalMin: number;
  /** scan cadence at other market hours */
  otherIntervalMin: number;
  alpacaPerMinute: number;
  finnhubPerMinute: number;
  /** an exit quote more than this long after the hit counts as "exit quote missed" */
  exitQuoteMaxLagMin: number;
  /** delayed data (15-min SIP / indicative) needs this long to catch up */
  dataSettleMin: number;
  /** extra outcome-tracking pass this long after the close */
  postCloseTrackMin: number;
  /** a tracking gap longer than this is logged as a backfill */
  backfillGapMin: number;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  liquidIntervalMin: 2,
  otherIntervalMin: 10,
  alpacaPerMinute: 180,
  finnhubPerMinute: 55,
  exitQuoteMaxLagMin: 15,
  dataSettleMin: 20,
  postCloseTrackMin: 30,
  backfillGapMin: 15,
};

/** Every tunable in one place; phase 6 Settings edits this. */
export interface AppSettings {
  watchlist: string[];
  scanner: ScannerSettings;
  patterns: PatternSettings;
  candles: CandleSettings;
  contracts: ContractSettings;
  ema: { /** 55 EMA reversal: how close the touch candle must come (0.002 = 0.2%) */ reversalTolerance: number };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  watchlist: DEFAULT_WATCHLIST,
  scanner: DEFAULT_SCANNER_SETTINGS,
  patterns: DEFAULT_PATTERN_SETTINGS,
  candles: DEFAULT_CANDLE_SETTINGS,
  contracts: DEFAULT_CONTRACT_SETTINGS,
  ema: { reversalTolerance: 0.002 },
};
