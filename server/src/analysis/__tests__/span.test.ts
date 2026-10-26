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

  it('an armed pattern disappears once its first key point is more than 5 trading days old', () => {
    const c = fx.doubleTopArmed;
    const last = c.at(-1)!;
    // six more sessions of quiet trading between the dip and the peaks: still armed, but too old to act on
    const later = Array.from({ length: 6 }, (_, i) => ({ ...last, time: last.time + (i + 1) * 86_400, open: 107, high: 107.2, low: 106.8, close: 107 }));
    expect(detectPatterns(c).map((m) => m.type)).toContain('double_top');
    expect(detectPatterns([...c, ...later]).map((m) => m.type)).not.toContain('double_top');
  });

  it('defaults to 5 trading days', () => {
    expect(DEFAULT_PATTERN_SETTINGS.maxSpanDays).toBe(5);
  });
});
