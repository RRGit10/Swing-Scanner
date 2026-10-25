import { describe, expect, it } from 'vitest';
import { detectPatterns } from '../patterns/index.js';
import { DEFAULT_PATTERN_SETTINGS } from '../patterns/types.js';
import type { Candle } from '../../providers/types.js';
import * as fx from '../__fixtures__/patterns.js';

/** Re-stamp a fixture to one candle per calendar day, so each pattern spans weeks. */
const daily = (candles: Candle[]): Candle[] => candles.map((c, i) => ({ ...c, time: candles[0]!.time + i * 86_400 }));

const cases: [string, Candle[]][] = [
  ['double_top', fx.doubleTopArmed],
  ['bull_flag', fx.bullFlagTriggered],
  ['bear_flag', fx.mirror(fx.bullFlagTriggered)],
  ['cup_and_handle', fx.cupHandleFromHandle],
  ['inverse_head_and_shoulders', fx.ihsTriggered],
];

describe('pattern span cap (maxSpanDays)', () => {
  it.each(cases)('%s: found when it spans one session', (type, candles) => {
    expect(detectPatterns(candles).map((m) => m.type)).toContain(type);
  });

  it.each(cases)('%s: rejected when its key points span more than 5 trading days', (type, candles) => {
    expect(detectPatterns(daily(candles)).map((m) => m.type)).not.toContain(type);
  });

  it.each(cases)('%s: found again when the cap is raised', (type, candles) => {
    const settings = { ...DEFAULT_PATTERN_SETTINGS, maxSpanDays: 60 };
    expect(detectPatterns(daily(candles), settings).map((m) => m.type)).toContain(type);
  });

  it('defaults to 5 trading days', () => {
    expect(DEFAULT_PATTERN_SETTINGS.maxSpanDays).toBe(5);
  });
});
