import { describe, expect, it } from 'vitest';
import { DEFAULT_CANDLE_SETTINGS, candleGate, classifyCandle, classifyLastThree } from '../candles.js';
import type { Candle } from '../../providers/types.js';
import * as fx from '../__fixtures__/candles.js';

const last = (candles: Candle[]) => classifyCandle(candles, candles.length - 1, DEFAULT_CANDLE_SETTINGS);

describe('hammer family (placement decides the name)', () => {
  it('hammer at the bottom of a drop → bullish hammer', () => {
    expect(last(fx.downtrendThenHammer)).toMatchObject({ names: ['hammer'], bias: 'bullish' });
  });

  it('hammer shape at the top of a run-up → bearish hanging man', () => {
    expect(last(fx.runUpThenHangingMan)).toMatchObject({ names: ['hanging_man'], bias: 'bearish' });
  });

  it('hammer shape mid-range → no label, no bias', () => {
    expect(last(fx.runUpThenMidRangeHammer)).toMatchObject({ names: [], bias: 'none' });
  });

  it('inverted hammer at the bottom of a drop → bullish inverted hammer', () => {
    expect(last(fx.downtrendThenInvertedHammer)).toMatchObject({ names: ['inverted_hammer'], bias: 'bullish' });
  });

  it('inverted hammer shape at the top of a run-up → bearish shooting star', () => {
    expect(last(fx.runUpThenShootingStar)).toMatchObject({ names: ['shooting_star'], bias: 'bearish' });
  });

  it('inverted hammer shape mid-range → no label', () => {
    expect(last(fx.runUpThenMidRangeInvertedHammer)).toMatchObject({ names: [], bias: 'none' });
  });

  it('no placement without L+1 candles of history', () => {
    const short = fx.series([...fx.trend(5, 104, -1), [97.5, 98.1, 96.3, 98.0]]);
    expect(last(short).names).toEqual([]);
  });

  it('the run lookback L setting changes the outcome', () => {
    // 5 flat bars at 95, 5 rising to ~103, 5 falling to ~99, then a hammer.
    const candles = fx.series([
      ...fx.trend(5, 95, 0.05),
      ...fx.trend(5, 98, 1),
      ...fx.trend(5, 104, -1),
      [99.0, 99.6, 97.8, 99.5],
    ]);
    expect(classifyCandle(candles, 15, { ...DEFAULT_CANDLE_SETTINGS, runLookback: 5 }).names).toEqual(['hammer']);
    // With L = 10 the close is above the close 10 candles earlier, so it is not the bottom of a drop.
    expect(classifyCandle(candles, 15, { ...DEFAULT_CANDLE_SETTINGS, runLookback: 10 }).names).toEqual([]);
  });
});

describe('boom boom', () => {
  it('big green body, small wicks, > 1.5× the previous 20 bodies → boom boom', () => {
    expect(last(fx.bigGreenAfterQuietBars)).toMatchObject({ names: ['boom_boom'], bias: 'bullish' });
  });

  it('red version → red boom boom', () => {
    expect(last(fx.bigRedAfterQuietBars)).toMatchObject({ names: ['red_boom_boom'], bias: 'bearish' });
  });

  it('near miss: body only 1.4× the average', () => {
    expect(last(fx.smallGreenAfterQuietBars).names).not.toContain('boom_boom');
  });

  it('near miss: one wick is 12.8% of the range', () => {
    expect(last(fx.wickyGreenAfterQuietBars).names).not.toContain('boom_boom');
  });

  it('near miss: fewer than 20 prior candles', () => {
    expect(last(fx.bigGreenAfterTooFewBars).names).not.toContain('boom_boom');
  });
});

describe('neutral candles', () => {
  it('doji: body 9% of range', () => {
    expect(last(fx.series([[100, 100.5, 99.5, 100.09]]))).toMatchObject({ names: ['doji'], bias: 'neutral' });
  });

  it('near miss: body 11% is not a doji (it is a spinning top)', () => {
    expect(last(fx.series([[100, 100.5, 99.5, 100.11]])).names).toEqual(['spinning_top']);
  });

  it('a zero-range candle is a doji', () => {
    expect(last(fx.series([[100, 100, 100, 100]])).names).toEqual(['doji']);
  });

  it('spinning top: body 20%, both wicks bigger than the body', () => {
    expect(last(fx.series([[100, 100.6, 99.6, 100.2]]))).toMatchObject({ names: ['spinning_top'], bias: 'neutral' });
  });

  it('near miss: body 40% is not a spinning top', () => {
    expect(last(fx.series([[100, 100.7, 99.7, 100.4]])).names).toEqual([]);
  });
});

describe('three green soldiers', () => {
  it('three green candles, higher closes, each opening inside the prior body', () => {
    expect(last(fx.threeGreenSoldiers)).toMatchObject({ names: ['three_green_soldiers'], bias: 'bullish' });
  });

  it('near miss: third candle opens below the second candle body', () => {
    expect(last(fx.soldiersWithGapDown).names).not.toContain('three_green_soldiers');
  });

  it('stacks with a single-candle label on the same candle', () => {
    expect(last(fx.soldiersAfterQuietBars).names).toEqual(['boom_boom', 'three_green_soldiers']);
  });
});

describe('classifyLastThree', () => {
  const s = DEFAULT_CANDLE_SETTINGS;

  it('returns labels for the last 3 candles, oldest first, with times', () => {
    const out = classifyLastThree(fx.downtrendThenHammer, s);
    expect(out.labels).toHaveLength(3);
    expect(out.labels.map((l) => l.time)).toEqual(fx.downtrendThenHammer.slice(-3).map((c) => c.time));
  });

  it('newest candle is a doji → neutral, even after a hammer', () => {
    const candles = fx.series([...fx.DOWNTREND, [97.5, 98.1, 96.3, 98.0], fx.PLAIN(98), [98.6, 99.0, 98.2, 98.65]]);
    expect(classifyLastThree(candles, s).bias).toBe('neutral');
  });

  it('newest candles unlabeled → falls back to the older hammer → bullish', () => {
    const candles = fx.series([...fx.DOWNTREND, [97.5, 98.1, 96.3, 98.0], fx.PLAIN(98), fx.PLAIN(98.5)]);
    expect(classifyLastThree(candles, s).bias).toBe('bullish');
  });

  it('older neutral candles are skipped when the newest is directional', () => {
    // quiet bars are spinning tops; the newest is a boom boom
    expect(classifyLastThree(fx.bigGreenAfterQuietBars, s).bias).toBe('bullish');
  });

  it('nothing labeled → none', () => {
    expect(classifyLastThree(fx.series([fx.PLAIN(100), fx.PLAIN(100.6), fx.PLAIN(101.2)]), s).bias).toBe('none');
  });

  it('handles fewer than 3 candles', () => {
    expect(classifyLastThree(fx.series([fx.PLAIN(100)]), s).labels).toHaveLength(1);
    expect(classifyLastThree([], s)).toEqual({ labels: [], bias: 'none' });
  });
});

describe('candleGate', () => {
  it.each([
    ['bullish', 'bullish', 'READY'],
    ['bearish', 'bearish', 'READY'],
    ['bearish', 'bullish', 'WATCH'],
    ['bullish', 'bearish', 'WATCH'],
    ['none', 'bullish', 'WATCH'],
    ['none', 'bearish', 'WATCH'],
    ['neutral', 'bullish', 'WAIT'],
    ['neutral', 'bearish', 'WAIT'],
  ] as const)('bias %s on a %s pattern → %s', (bias, direction, status) => {
    expect(candleGate(bias, direction)).toBe(status);
  });
});
