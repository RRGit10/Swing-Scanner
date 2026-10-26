import type { Candle } from '../../providers/types.js';
import { candlesOf, mirror, pathBars, ZIGZAG, type Bar } from './patterns.js';

/**
 * Synthetic candles copying the shapes drawn in the pattern diagrams (server/src/analysis/__fixtures__/diagrams/,
 * git-ignored; the tests never read the images). Prices are on an ATR ≈ 1 scale so ATR-based rules have
 * clear margins. Each "must detect" fixture has a near-miss that breaks one key shape rule.
 */

/** Big green body, tiny wicks: a boom boom when the earlier bodies are small. */
const boomUp = (open: number, close: number): Bar => [open, close + 0.03, open - 0.02, close];
/** Big red body, tiny wicks: a red boom boom. */
const boomDown = (open: number, close: number): Bar => [open, open + 0.02, close - 0.03, close];

/**
 * A parallel channel of n candles drifting `step` per candle from `start`; alternate candles poke out of the
 * top or bottom by 0.5 so the channel has two edges. `firstPoke` = which edge the first candle extends.
 */
function channel(start: number, n: number, step: number, firstPoke: 'high' | 'low'): Bar[] {
  return pathBars([[0, start], [n, start + n * step]])
    .slice(1)
    .map(([o, h, l, c], i) => {
      const pokeHigh = (i % 2 === 0) === (firstPoke === 'high');
      return [o, h + (pokeHigh ? 0.5 : 0), l - (pokeHigh ? 0 : 0.5), c] as Bar;
    });
}

// ---------- Bull flag (Bull-flag.png): steep pole, a 12-candle flag channel sloping DOWN, breakout.
const BULL_POLE = pathBars([[0, 100.5], [8, 108.5]]).slice(1);
const BULL_FLAG = channel(108.5, 12, -0.22, 'low');
export const diagramBullFlag = candlesOf(ZIGZAG, BULL_POLE, BULL_FLAG, [boomUp(105.86, 109.2)]);
/** Near-miss (the NVDA case): the "flag" climbs back UP toward the pole top instead of drifting down. */
export const bullFlagSlopingUp = candlesOf(ZIGZAG, BULL_POLE, [[108.5, 108.6, 106.9, 107]], pathBars([[0, 107], [6, 108.3]]).slice(1), [boomUp(108.3, 110)]);
/** Near-miss: a loose, wide "flag" (channel height > 40% of the pole). */
export const bullFlagLoose = candlesOf(ZIGZAG, BULL_POLE, [
  [108.5, 108.7, 105.0, 106.0], [106.0, 108.6, 104.9, 108.2], [108.2, 108.7, 104.9, 105.2],
  [105.2, 108.6, 104.95, 108.0], [108.0, 108.7, 105.0, 105.6], [105.6, 108.5, 104.9, 107.4],
], [boomUp(107.4, 109.4)]);

// ---------- Bear flag (Bear-flag.png): two-leg drop, a 16-candle flag channel sloping UP, breakdown.
const QUIET_120 = pathBars([[0, 120], [2, 121], [4, 120], [6, 121], [8, 120], [10, 121], [12, 120], [14, 121], [16, 120], [18, 121], [19, 120.5]]);
const BEAR_POLE = [...pathBars([[0, 120.5], [4, 115]]).slice(1), ...pathBars([[0, 115], [3, 117]]).slice(1), ...pathBars([[0, 117], [3, 111]]).slice(1)];
export const diagramBearFlag = candlesOf(QUIET_120, BEAR_POLE, channel(111, 16, 0.18, 'high'), [boomDown(113.88, 110)]);
/** Near-miss: the "flag" keeps sliding DOWN with the pole (the bear version of the NVDA case). */
export const bearFlagSlopingDown = mirror(bullFlagSlopingUp);

// ---------- Inverse head and shoulders (Bullish-inverse-hs.png): shoulders are small double dips, flat neckline.
export const diagramInverseHeadShoulders = candlesOf(
  pathBars([[0, 110], [6, 105.5], [8, 106.6], [10, 105], [16, 108], [26, 103], [32, 108.1], [36, 105.2], [38, 106.3], [40, 105.1], [43, 105.6]]),
  [boomUp(105.6, 107.2)],
);

// ---------- Head and shoulders top (Bearish-inverse-hs.png): three peaks, middle highest, flat neckline through the dips.
const HS_BODY = pathBars([[0, 96], [8, 104], [11, 102.2], [14, 105.2], [20, 102], [27, 108.2], [33, 102.1], [38, 105.3], [41, 104.6]]);
export const diagramHeadShoulders = candlesOf(HS_BODY, [boomDown(104.6, 102.8)]);
/** Near-miss: right shoulder 2 higher than the left (> 1 × ATR apart). */
export const headShouldersUneven = candlesOf(
  pathBars([[0, 96], [8, 104], [11, 102.2], [14, 105.2], [20, 102], [27, 108.2], [33, 102.1], [38, 107.3], [41, 106.6]]),
  [boomDown(106.6, 104.8)],
);

// ---------- Cup and handle (Bull-cup&handle.png): rounded U, neckline tilting down (right rim 1 lower), handle drifts down.
const ROUND_CUP = pathBars([[0, 95], [10, 101], [14, 97.6], [18, 96.2], [22, 95.6], [26, 96.2], [30, 97.6], [34, 100]]);
const DRIFT_DOWN = pathBars([[0, 100], [5, 99]]).slice(1);
export const diagramCupAndHandle = candlesOf(ROUND_CUP, DRIFT_DOWN, [boomUp(99, 100.8)]);
/** Near-miss: a sharp V instead of a rounded U (same rims, same handle). */
export const cupSharpV = candlesOf(pathBars([[0, 95], [10, 101], [22, 95.6], [34, 100]]), DRIFT_DOWN, [boomUp(99, 100.8)]);

// ---------- Inverted cup and handle (Bear-cup&handle.png): rounded dome on a flat neckline, handle drifts up, red boom.
export const diagramInvertedCupAndHandle = mirror(diagramCupAndHandle);
/** Near-miss: the handle climbs past the middle of the dome. */
export const invertedCupHandleTooHigh = mirror(candlesOf(ROUND_CUP, pathBars([[0, 100], [5, 97.6]]).slice(1), [boomUp(97.6, 99.4)]));

// ---------- Double top (Double-Top.png): two equal tops, a dip between, close below the dip.
export const diagramDoubleTop = candlesOf(pathBars([[0, 100], [14, 110], [22, 105], [30, 110.3], [34, 107.5], [36, 105.5]]), [[105.5, 105.6, 104.3, 104.4]]);
/** Double bottom (mirror of the drawing): two equal lows, a peak between, close above the peak. */
export const diagramDoubleBottom = mirror(diagramDoubleTop);
/** Near-miss: the second low is about 2 × ATR below the first. */
export const doubleBottomUneven = mirror(candlesOf(pathBars([[0, 100], [14, 110], [22, 105], [30, 112.3], [36, 109]])));

export type { Candle };
