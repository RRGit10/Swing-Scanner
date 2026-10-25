import { describe, expect, it } from 'vitest';
import { detectPatterns } from '../patterns/index.js';
import * as fx from '../__fixtures__/patterns.js';

const fixtures = {
  doubleTopTriggered: fx.doubleTopTriggered,
  bullFlagTriggered: fx.bullFlagTriggered,
  bearFlagTriggered: fx.mirror(fx.bullFlagTriggered),
  cupHandleFromHandle: fx.cupHandleFromHandle,
  ihsTriggered: fx.ihsTriggered,
};

describe('detectPatterns', () => {
  it.each(Object.entries(fixtures))('%s: each type at most once, with a target, points and lines', (_, candles) => {
    const matches = detectPatterns(candles);
    expect(matches.length).toBeGreaterThan(0);
    const types = matches.map((m) => m.type);
    expect(new Set(types).size).toBe(types.length);
    for (const m of matches) {
      expect(Number.isFinite(m.target)).toBe(true);
      expect(m.points.length).toBeGreaterThan(0);
      expect(m.lines.some((l) => l.label === 'target')).toBe(true);
      // target lies in the trade's direction from the trigger level
      expect(m.direction === 'bullish' ? m.target >= m.triggerLevel : m.target <= m.triggerLevel).toBe(true);
    }
  });

  it('finds the expected type in each fixture', () => {
    expect(detectPatterns(fx.doubleTopTriggered).map((m) => m.type)).toContain('double_top');
    expect(detectPatterns(fx.bullFlagTriggered).map((m) => m.type)).toContain('bull_flag');
    expect(detectPatterns(fx.mirror(fx.bullFlagTriggered)).map((m) => m.type)).toContain('bear_flag');
    expect(detectPatterns(fx.cupHandleFromHandle).map((m) => m.type)).toContain('cup_and_handle');
    expect(detectPatterns(fx.ihsTriggered).map((m) => m.type)).toContain('inverse_head_and_shoulders');
  });

  it('sorts most recent first', () => {
    const matches = detectPatterns(fx.ihsTriggered);
    const ends = matches.map((m) => m.endIndex);
    expect(ends).toEqual([...ends].sort((a, b) => b - a));
  });

  it('returns nothing for a short, featureless series', () => {
    expect(detectPatterns(fx.candlesOf(fx.ZIGZAG))).toEqual([]);
  });
});
