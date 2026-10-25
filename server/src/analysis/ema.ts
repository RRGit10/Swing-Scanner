import type { Candle } from '../providers/types.js';

export const EMA_PERIODS = [13, 48, 55, 200] as const;
export type EmaPeriod = (typeof EMA_PERIODS)[number];
export type EmaValues = Record<EmaPeriod, number | null>;

/**
 * Exponential moving average, k = 2/(n+1), seeded with the simple average of the
 * first n values (TradingView ta.ema style). Entries before the seed are null.
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** 13/48/55/200 EMAs of the closes, index-aligned with the candles. */
export function emaSet(candles: Candle[]): Record<EmaPeriod, (number | null)[]> {
  const closes = candles.map((c) => c.close);
  return Object.fromEntries(EMA_PERIODS.map((p) => [p, ema(closes, p)])) as Record<EmaPeriod, (number | null)[]>;
}

/** Most recent value of each EMA. */
export function latestEmas(candles: Candle[]): EmaValues {
  const set = emaSet(candles);
  return Object.fromEntries(EMA_PERIODS.map((p) => [p, set[p].at(-1) ?? null])) as EmaValues;
}
