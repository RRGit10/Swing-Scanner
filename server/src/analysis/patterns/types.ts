import type { Direction } from '../types.js';

export type PatternType =
  | 'cup_and_handle'
  | 'inverse_head_and_shoulders'
  | 'bull_flag'
  | 'bear_flag'
  | 'double_top'
  // not from the class method (mirrors added on request)
  | 'double_bottom'
  | 'inverted_cup_and_handle'
  | 'head_and_shoulders';

/** Patterns that are not part of Chris Sain's class method; labeled as such in the UI. */
export const NOT_CLASS_METHOD: readonly PatternType[] = ['double_bottom', 'inverted_cup_and_handle', 'head_and_shoulders'];

export interface PricePoint {
  time: number;
  price: number;
}

export interface KeyPoint extends PricePoint {
  /** e.g. left_rim, cup_bottom, peak_1, dip, pole_start, right_shoulder */
  label: string;
  index: number;
}

export interface PatternLine {
  /** neckline, trigger, target, pole, peaks */
  label: string;
  from: PricePoint;
  to: PricePoint;
}

export interface PatternMatch {
  type: PatternType;
  direction: Direction;
  /** armed = shape complete, waiting for the trigger; triggered = trigger fired within recentTriggerBars */
  state: 'armed' | 'triggered';
  points: KeyPoint[];
  lines: PatternLine[];
  /**
   * Level the trigger is measured against: break level (flags, double top), neckline (cup & handle),
   * right-shoulder low (inverse H&S).
   */
  triggerLevel: number;
  triggerIndex: number | null;
  triggerTime: number | null;
  /** Stock price target from the pattern. Never one price has already reached. */
  target: number;
  /** A close beyond this kills the pattern. */
  invalidation: number;
  startIndex: number;
  /** Trigger candle if triggered, otherwise the pattern's last structural point. */
  endIndex: number;
}

export interface PatternSettings {
  pivotN: number;
  atrPeriod: number;
  /** candles searched */
  lookback: number;
  /** a trigger older than this many candles is no longer reported */
  recentTriggerBars: number;
  /** first to last key point may cover at most this many trading days */
  maxSpanDays: number;
  // double top
  peakTolAtr: number;
  dipDepthAtr: number;
  // bull / bear flag
  poleMinAtr: number;
  poleMaxBars: number;
  flagMinBars: number;
  /** absolute cap on flag candles */
  flagMaxBars: number;
  /** flag may have at most this × the pole's candle count */
  flagPoleMultiple: number;
  /** flag channel slope (per candle, in ATR) must be ≤ this against the pole: down/flat for a bull flag */
  flagMaxSlopeAtr: number;
  /** flag channel height ≤ this × pole height (parallel and tight) */
  flagMaxHeightFraction: number;
  flagMaxRetrace: number;
  // cup & handle
  cupMinDepthAtr: number;
  rimTolAtr: number;
  cupMinWidth: number;
  handleMaxFraction: number;
  /** handle low must stay above bottom + this × cup depth (0.5 = upper half) */
  handleMinDepthFraction: number;
  /** rounded U, not a V: the cup candles' average low above the bottom ≤ this × depth */
  cupMaxAvgHeight: number;
  // inverse head & shoulders
  shoulderTolAtr: number;
  headMinAtr: number;
}

export const DEFAULT_PATTERN_SETTINGS: PatternSettings = {
  pivotN: 3,
  atrPeriod: 14,
  lookback: 150,
  recentTriggerBars: 3,
  maxSpanDays: 5,
  peakTolAtr: 0.5,
  dipDepthAtr: 1.5,
  poleMinAtr: 3,
  poleMaxBars: 10,
  flagMinBars: 2,
  flagMaxBars: 20,
  flagPoleMultiple: 2,
  flagMaxSlopeAtr: 0.1,
  flagMaxHeightFraction: 0.4,
  flagMaxRetrace: 0.5,
  cupMinDepthAtr: 2,
  rimTolAtr: 1.5,
  cupMinWidth: 10,
  handleMaxFraction: 1 / 3,
  handleMinDepthFraction: 0.5,
  cupMaxAvgHeight: 0.32,
  shoulderTolAtr: 1,
  headMinAtr: 0.5,
};
