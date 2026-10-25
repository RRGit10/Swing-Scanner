import type { Candle } from '../../providers/types.js';
import { series } from './candles.js';

export type Bar = [open: number, high: number, low: number, close: number];

const WICK = 0.25;

/**
 * Bars whose closes walk linearly between waypoints [barIndex, price]. Each bar opens at the
 * previous close and has 0.25 wicks, so a 0.5-per-bar walk gives a true range of 1.0 (ATR ≈ 1).
 */
export function pathBars(waypoints: [number, number][]): Bar[] {
  const closes: number[] = [];
  for (let w = 0; w < waypoints.length - 1; w++) {
    const [i0, p0] = waypoints[w]!;
    const [i1, p1] = waypoints[w + 1]!;
    for (let i = i0; i < i1; i++) closes[i] = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
  }
  const [lastI, lastP] = waypoints.at(-1)!;
  closes[lastI] = lastP;
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]!;
    return [open, Math.max(open, close) + WICK, Math.min(open, close) - WICK, close];
  });
}

export const candlesOf = (...parts: Bar[][]): Candle[] => series(parts.flat());

/** Mirror prices around 200 (highs ↔ lows), turning a bullish fixture into its bearish twin. */
export function mirror(candles: Candle[]): Candle[] {
  return candles.map((c) => ({ ...c, open: 200 - c.open, close: 200 - c.close, high: 200 - c.low, low: 200 - c.high }));
}

/** 20 bars zig-zagging 100 ↔ 101 (no pivots, no trend, ATR ≈ 1). */
export const ZIGZAG = pathBars([[0, 100], [2, 101], [4, 100], [6, 101], [8, 100], [10, 101], [12, 100], [14, 101], [16, 100], [18, 101], [19, 100.5]]);

// ---------- double top: peaks at bars 20 and 40 (highs 110.25), dip at bar 30 (low 104.75)
const DT_BASE: [number, number][] = [[0, 100], [20, 110], [30, 105], [40, 110]];
export const doubleTopArmed = candlesOf(pathBars([...DT_BASE, [46, 107]]));
/** Bar 51 closes 104.5, below the 104.75 dip. */
export const doubleTopTriggered = candlesOf(pathBars([...DT_BASE, [50, 105], [51, 104.5]]));
/** Falls through the 99.25 target two bars after the trigger. */
export const doubleTopTargetHit = candlesOf(pathBars([...DT_BASE, [50, 105], [51, 104.5], [53, 99]]));
/** Second peak 112.25 vs 110.25: about 2 ATR apart. */
export const doubleTopUnequalPeaks = candlesOf(pathBars([[0, 100], [20, 110], [30, 105], [44, 112], [50, 109]]));
/** Dip only 1.0 below the peaks (< 1.5 ATR). */
export const doubleTopShallowDip = candlesOf(pathBars([[0, 100], [20, 110], [24, 109.5], [28, 110], [31, 108.75]]));

// ---------- bull flag: zigzag 0–19, pole 20–25 (top 108.25), flag 26–29, bar 30 closes above the 108.25 flag high
const POLE = pathBars([[0, 100.5], [6, 108]]).slice(1);
export const bullFlagTriggered = candlesOf(ZIGZAG, POLE, pathBars([[0, 108], [4, 106]]).slice(1), [[106, 108.8, 105.9, 108.6]]);
export const bullFlagArmed = candlesOf(ZIGZAG, POLE, pathBars([[0, 108], [4, 106]]).slice(1));
/** Pullback to 103.25 retraces ~59% of the 8.5 pole. */
export const bullFlagTooDeep = candlesOf(ZIGZAG, POLE, pathBars([[0, 108], [4, 103.5]]).slice(1), [[103.5, 108.8, 103.4, 108.6]]);
/** 10 flag candles before the breakout (> 8). */
export const bullFlagTooLong = candlesOf(ZIGZAG, POLE, pathBars([[0, 108], [10, 106]]).slice(1), [[106, 108.8, 105.9, 108.6]]);
/** Pole rises only 2.0 (about 2 ATR). */
export const bullFlagSmallPole = candlesOf(
  ZIGZAG,
  pathBars([[0, 100.5], [2, 101.5]]).slice(1),
  pathBars([[0, 101.5], [3, 101]]).slice(1),
  [[101, 102.3, 100.9, 102.2]],
);

// ---------- cup & handle: left rim bar 10 (neckline 100.25), bottom bar 20 (94.75), right rim bar 30, handle 31–34
const CUP: [number, number][] = [[0, 95], [10, 100], [20, 95], [30, 100], [34, 98]];
export const cupHandleArmed = candlesOf(pathBars(CUP));
/** Boom boom launching from the handle, closing 99.2 (below the neckline). */
export const cupHandleFromHandle = candlesOf(pathBars(CUP), [[98.0, 99.22, 97.98, 99.2]]);
/** Boom boom closing 100.6, above the neckline. */
export const cupHandleBreakout = candlesOf(pathBars(CUP), [[98.0, 100.62, 97.98, 100.6]]);
/** Handle falls to 95.75, below the cup midpoint (97.5). */
export const cupHandleDeepHandle = candlesOf(pathBars([[0, 95], [10, 100], [20, 95], [30, 100], [34, 96]]), [[96.0, 97.22, 95.98, 97.2]]);
/** Right rim only 98.25 (2 below the neckline). */
export const cupHandleLowRightRim = candlesOf(pathBars([[0, 95], [10, 100], [20, 95], [30, 98], [33, 97.85]]), [[97.85, 99.07, 97.83, 99.05]]);
/** Rims only 9 candles apart (handle and boom boom otherwise valid). */
export const cupHandleNarrow = candlesOf(pathBars([[0, 95], [10, 100], [14, 96], [19, 100], [21, 99]]), [[99.0, 100.22, 98.98, 100.2]]);

// ---------- inverse H&S: LS bar 10, P1 bar 16 (108.25), head bar 26, P2 bar 32 (107.75), RS bar 38
const RS_BOUNCE: Bar[] = [
  [105.0, 105.6, 104.9, 105.4],
  [105.4, 105.7, 105.0, 105.2],
  [105.2, 105.7, 105.0, 105.5],
];
const IHS = (ls: number, head: number, rs: number) =>
  pathBars([[0, 110], [10, ls], [16, 108], [26, head], [32, 107.5], [38, rs]]);
/** Boom boom after the right shoulder, closing 106.5 (neckline there ≈ 107.44). */
const IHS_TRIGGER: Bar = [105.5, 106.52, 105.48, 106.5];
export const ihsTriggered = candlesOf(IHS(105, 103, 105), RS_BOUNCE, [IHS_TRIGGER]);
export const ihsArmed = candlesOf(IHS(105, 103, 105), RS_BOUNCE);
export const ihsTargetHit = candlesOf(IHS(105, 103, 105), RS_BOUNCE, [IHS_TRIGGER, [106.5, 108.5, 106.4, 108.3]]);
/** Shoulders lower than the "head": the middle dip is not the lowest. */
export const ihsHeadNotLowest = candlesOf(IHS(102.5, 103, 102.5), [
  [102.5, 103.1, 102.4, 102.9],
  [102.9, 103.2, 102.5, 102.7],
  [102.7, 103.2, 102.5, 103.0],
  [103.0, 103.82, 102.98, 103.8],
]);
/** Right shoulder 106.75 vs left 105: shoulders ~1.75 ATR apart. */
export const ihsUnevenShoulders = candlesOf(IHS(105, 103, 106.75), [
  [106.75, 107.35, 106.65, 107.15],
  [107.15, 107.45, 106.75, 106.95],
  [106.95, 107.45, 106.75, 107.25],
  [107.25, 107.37, 107.0, 107.35],
]);
/** Bullish candle closes 107.6, above the neckline: missed, not a trigger. */
export const ihsCloseAboveNeckline = candlesOf(IHS(105, 103, 105), RS_BOUNCE, [[105.5, 107.62, 105.48, 107.6]]);
