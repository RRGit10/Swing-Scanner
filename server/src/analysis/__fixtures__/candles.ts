import type { Candle } from '../../providers/types.js';

/**
 * Hand-built OHLC scenarios. Times are 15 minutes apart from an arbitrary start;
 * the classifiers only care about order.
 */
const START = 1_792_762_200;

export function series(bars: [open: number, high: number, low: number, close: number][]): Candle[] {
  return bars.map(([open, high, low, close], i) => ({ time: START + i * 900, open, high, low, close, volume: 1000 }));
}

/** n trend bars: body = 0.8 × step in the step's direction, 0.2 wicks on both sides. */
export function trend(n: number, start: number, step: number): [number, number, number, number][] {
  return Array.from({ length: n }, (_, j) => {
    const open = start + j * step;
    const close = open + 0.8 * step;
    return [open, Math.max(open, close) + 0.2, Math.min(open, close) - 0.2, close];
  });
}

/** n quiet bars around `price`: body 0.2, both wicks 0.3 (each is a spinning top). */
export function quiet(n: number, price = 100): [number, number, number, number][] {
  return Array.from({ length: n }, (_, j) =>
    j % 2 === 0 ? [price, price + 0.5, price - 0.3, price + 0.2] : [price + 0.2, price + 0.5, price - 0.3, price],
  );
}

// 12 down bars: closes 109.2 → 98.2, lows 109.0 → 98.0
export const DOWNTREND = trend(12, 110, -1);
// 12 up bars: closes 100.8 → 111.8, highs 101.0 → 112.0
export const UPTREND = trend(12, 100, 1);

/** A plain bar with no label: body 60% of range, 20% wicks. */
export const PLAIN = (price: number): [number, number, number, number] => [price, price + 0.8, price - 0.2, price + 0.6];

export const downtrendThenHammer = series([...DOWNTREND, [97.5, 98.1, 96.3, 98.0]]);
export const downtrendThenInvertedHammer = series([...DOWNTREND, [97.0, 98.7, 96.9, 97.5]]);
export const runUpThenHangingMan = series([...UPTREND, [112.0, 112.6, 110.6, 112.5]]);
export const runUpThenShootingStar = series([...UPTREND, [112.0, 113.8, 111.9, 112.5]]);
/** Same hammer / inverted-hammer shapes, but sitting below the highs and above the lows: no placement. */
export const runUpThenMidRangeHammer = series([...UPTREND, [108.0, 108.6, 106.6, 108.5]]);
export const runUpThenMidRangeInvertedHammer = series([...UPTREND, [108.0, 109.8, 107.9, 108.5]]);

/** Body 0.4 = 2× the 0.2 average body, each wick 0.03 of a 0.46 range (6.5%). */
export const bigGreenAfterQuietBars = series([...quiet(20), [100.0, 100.43, 99.97, 100.4]]);
export const bigRedAfterQuietBars = series([...quiet(20), [100.4, 100.43, 99.97, 100.0]]);
/** Body 0.28 = 1.4× average: not big enough. */
export const smallGreenAfterQuietBars = series([...quiet(20), [100.0, 100.3, 99.98, 100.28]]);
/** Upper wick 0.06 of a 0.47 range (12.8%). */
export const wickyGreenAfterQuietBars = series([...quiet(20), [100.0, 100.46, 99.99, 100.4]]);
/** Only 19 prior candles: no 20-candle average yet. */
export const bigGreenAfterTooFewBars = series([...quiet(19), [100.0, 100.43, 99.97, 100.4]]);

export const SOLDIERS: [number, number, number, number][] = [
  [100.0, 101.1, 99.9, 101.0],
  [100.5, 101.7, 100.4, 101.6],
  [101.2, 102.4, 101.1, 102.3],
];
export const threeGreenSoldiers = series([...trend(3, 100, 0.1), ...SOLDIERS]);
/** Third candle opens at 100.3, below the second candle's body (100.5–101.6). */
export const soldiersWithGapDown = series([...trend(3, 100, 0.1), SOLDIERS[0]!, SOLDIERS[1]!, [100.3, 102.4, 100.2, 102.3]]);
export const soldiersAfterQuietBars = series([...quiet(20), ...SOLDIERS]);
