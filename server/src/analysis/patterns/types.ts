import type { Direction } from '../types.js';

export type PatternType = 'cup_and_handle' | 'inverse_head_and_shoulders' | 'bull_flag' | 'bear_flag' | 'double_top';

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
  flagMaxBars: number;
  flagMaxRetrace: number;
  // cup & handle
  cupMinDepthAtr: number;
  rimTolAtr: number;
  cupMinWidth: number;
  handleMaxFraction: number;
  /** handle low must stay above bottom + this × cup depth (0.5 = upper half) */
  handleMinDepthFraction: number;
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
  flagMaxBars: 8,
  flagMaxRetrace: 0.5,
  cupMinDepthAtr: 2,
  rimTolAtr: 0.5,
  cupMinWidth: 10,
  handleMaxFraction: 1 / 3,
  handleMinDepthFraction: 0.5,
  shoulderTolAtr: 1,
  headMinAtr: 0.5,
};
