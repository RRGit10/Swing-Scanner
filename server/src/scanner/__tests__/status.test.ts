import { describe, expect, it } from 'vitest';
import { signalStatus, statusRank } from '../status.js';

describe('signalStatus', () => {
  it.each([
    // [state, candle bias, direction, entry, expected]
    ['armed', 'neutral', 'bullish', null, 'WAIT'],
    ['triggered', 'neutral', 'bullish', 'AT ENTRY', 'WAIT'],
    ['armed', 'bullish', 'bullish', 'AT ENTRY', 'WATCH'],
    ['armed', 'none', 'bullish', null, 'WATCH'],
    ['triggered', 'bearish', 'bullish', 'AT ENTRY', 'WATCH'],
    ['triggered', 'none', 'bearish', null, 'WATCH'],
    ['triggered', 'bullish', 'bullish', 'ABOVE ENTRY ZONE', 'READY'],
    ['triggered', 'bullish', 'bullish', 'NO CURRENT RANGE', 'READY'],
    ['triggered', 'bullish', 'bullish', null, 'READY'], // no contract fits: status stands
    ['triggered', 'bullish', 'bullish', 'AT ENTRY', 'AT ENTRY'],
    ['triggered', 'bearish', 'bearish', 'AT ENTRY', 'AT ENTRY'],
  ] as const)('%s + bias %s on %s, entry %s → %s', (state, bias, direction, entry, expected) => {
    expect(signalStatus({ state, candleBias: bias, direction, entryStatus: entry })).toBe(expected);
  });
});

describe('statusRank', () => {
  it('AT ENTRY, READY, WATCH, WAIT', () => {
    expect(['WAIT', 'READY', 'WATCH', 'AT ENTRY'].sort((a, b) => statusRank(a as never) - statusRank(b as never))).toEqual([
      'AT ENTRY',
      'READY',
      'WATCH',
      'WAIT',
    ]);
  });
});
