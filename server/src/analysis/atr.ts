import type { Candle } from '../providers/types.js';

/**
 * Wilder's Average True Range. Used ONLY as a tolerance ruler for pattern shapes, never as a signal.
 * TR = max(H − L, |H − prevC|, |L − prevC|); seeded with the mean of the first `period` TRs.
 */
export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return out;

  const tr = candles.map((c, i) => {
    const prevClose = i > 0 ? candles[i - 1]!.close : c.close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}
