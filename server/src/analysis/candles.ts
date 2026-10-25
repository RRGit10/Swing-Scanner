import type { Candle } from '../providers/types.js';
import type { Direction } from './types.js';

export type CandleName =
  | 'hammer'
  | 'inverted_hammer'
  | 'boom_boom'
  | 'three_green_soldiers'
  | 'doji'
  | 'spinning_top'
  | 'red_boom_boom'
  | 'hanging_man'
  | 'shooting_star';

export type CandleBias = 'bullish' | 'bearish' | 'neutral' | 'none';

const NAME_BIAS: Record<CandleName, Exclude<CandleBias, 'none'>> = {
  hammer: 'bullish',
  inverted_hammer: 'bullish',
  boom_boom: 'bullish',
  three_green_soldiers: 'bullish',
  doji: 'neutral',
  spinning_top: 'neutral',
  red_boom_boom: 'bearish',
  hanging_man: 'bearish',
  shooting_star: 'bearish',
};

/** Fractions are of the candle's high–low range unless noted. */
export interface CandleSettings {
  /** L: candles looked back for "top of run-up" / "bottom of drop" */
  runLookback: number;
  dojiMaxBody: number;
  boomMaxWick: number;
  /** boom body must exceed this × the average body of the previous boomAvgPeriod candles */
  boomBodyMultiple: number;
  boomAvgPeriod: number;
  hammerMaxBody: number;
  /** the long wick must be at least this × the body */
  hammerWickToBody: number;
  hammerMaxOppositeWick: number;
  spinningMaxBody: number;
}

export const DEFAULT_CANDLE_SETTINGS: CandleSettings = {
  runLookback: 10,
  dojiMaxBody: 0.1,
  boomMaxWick: 0.1,
  boomBodyMultiple: 1.5,
  boomAvgPeriod: 20,
  hammerMaxBody: 0.35,
  hammerWickToBody: 2,
  hammerMaxOppositeWick: 0.1,
  spinningMaxBody: 0.3,
};

export interface CandleLabel {
  time: number;
  /** single-candle label first, then three_green_soldiers if it applies */
  names: CandleName[];
  bias: CandleBias;
}

function parts(c: Candle) {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  return { range, body, upper, lower };
}

/** Where candle i sits relative to the last L candles. Needs L+1 candles of history. */
function placement(candles: Candle[], i: number, L: number): 'top' | 'bottom' | null {
  if (i < L) return null;
  const c = candles[i]!;
  const window = candles.slice(i - L + 1, i + 1);
  const earlierClose = candles[i - L]!.close;
  if (c.high >= Math.max(...window.map((w) => w.high)) && c.close > earlierClose) return 'top';
  if (c.low <= Math.min(...window.map((w) => w.low)) && c.close < earlierClose) return 'bottom';
  return null;
}

function singleCandleName(candles: Candle[], i: number, s: CandleSettings): CandleName | null {
  const c = candles[i]!;
  const { range, body, upper, lower } = parts(c);

  if (range === 0 || body < s.dojiMaxBody * range) return 'doji';

  if (i >= s.boomAvgPeriod && upper < s.boomMaxWick * range && lower < s.boomMaxWick * range) {
    const prior = candles.slice(i - s.boomAvgPeriod, i);
    const avgBody = prior.reduce((sum, p) => sum + Math.abs(p.close - p.open), 0) / prior.length;
    if (body > s.boomBodyMultiple * avgBody) {
      if (c.close > c.open) return 'boom_boom';
      if (c.close < c.open) return 'red_boom_boom';
    }
  }

  const smallBody = body <= s.hammerMaxBody * range;
  if (smallBody && lower >= s.hammerWickToBody * body && upper <= s.hammerMaxOppositeWick * range) {
    const where = placement(candles, i, s.runLookback);
    return where === 'bottom' ? 'hammer' : where === 'top' ? 'hanging_man' : null;
  }
  if (smallBody && upper >= s.hammerWickToBody * body && lower <= s.hammerMaxOppositeWick * range) {
    const where = placement(candles, i, s.runLookback);
    return where === 'bottom' ? 'inverted_hammer' : where === 'top' ? 'shooting_star' : null;
  }

  if (body <= s.spinningMaxBody * range && upper > body && lower > body) return 'spinning_top';
  return null;
}

/** Candles i-2, i-1, i all green, closes rising, each opening inside the prior candle's body. */
function isThreeGreenSoldiers(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  const trio = candles.slice(i - 2, i + 1);
  if (!trio.every((c) => c.close > c.open)) return false;
  for (let j = 1; j < 3; j++) {
    const prev = trio[j - 1]!;
    const cur = trio[j]!;
    if (cur.close <= prev.close || cur.open < prev.open || cur.open > prev.close) return false;
  }
  return true;
}

export function classifyCandle(candles: Candle[], i: number, settings: CandleSettings): CandleLabel {
  const names: CandleName[] = [];
  const single = singleCandleName(candles, i, settings);
  if (single) names.push(single);
  if (isThreeGreenSoldiers(candles, i)) names.push('three_green_soldiers');
  // A candle's bias comes from its single-candle label when it has one.
  const bias: CandleBias = names[0] ? NAME_BIAS[names[0]] : 'none';
  return { time: candles[i]!.time, names, bias };
}

/**
 * Labels for the last 3 candles (oldest first) and their combined bias:
 * newest is doji/spinning top → neutral; otherwise the newest bullish/bearish label; else none.
 */
export function classifyLastThree(
  candles: Candle[],
  settings: CandleSettings,
): { labels: CandleLabel[]; bias: CandleBias } {
  const start = Math.max(0, candles.length - 3);
  const labels = candles.slice(start).map((_, k) => classifyCandle(candles, start + k, settings));
  const newest = labels.at(-1);
  if (!newest) return { labels, bias: 'none' };
  if (newest.bias === 'neutral') return { labels, bias: 'neutral' };
  const directional = [...labels].reverse().find((l) => l.bias === 'bullish' || l.bias === 'bearish');
  return { labels, bias: directional?.bias ?? 'none' };
}

/** Candle part of the signal status only; phase 5 combines it with the pattern trigger. */
export function candleGate(bias: CandleBias, direction: Direction): 'READY' | 'WATCH' | 'WAIT' {
  if (bias === 'neutral') return 'WAIT';
  return bias === direction ? 'READY' : 'WATCH';
}
