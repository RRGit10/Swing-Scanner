import { describe, expect, it } from 'vitest';
import { layoutTags, type Rect } from '../tagLayout';

const bounds = { width: 600, height: 400 };
const overlaps = (a: Rect | null, b: Rect | null) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutTags', () => {
  const candles = [{ x1: 95, x2: 105, top: 150, bottom: 250 }];

  it('places the tag just above the candle when preferred and clear', () => {
    const [r] = layoutTags([{ cx: 100, anchorTop: 150, anchorBottom: 250, prefer: 'above', w: 40, h: 16 }], { candles, lines: [] }, bounds);
    expect(r).toEqual({ x: 80, y: 128, w: 40, h: 16 });
  });

  it('moves away from an EMA line that crosses the preferred spot', () => {
    // EMA runs flat through y = 136, right where the tag would go
    const ema = [{ x: 0, y: 136 }, { x: 600, y: 136 }];
    const [r] = layoutTags([{ cx: 100, anchorTop: 150, anchorBottom: 250, prefer: 'above', w: 40, h: 16 }], { candles, lines: [ema] }, bounds)!;
    expect(r!.y + r!.h < 136 - 3 || r!.y > 136 + 3).toBe(true);
    expect(overlaps(r!, { x: 95, y: 150, w: 10, h: 100 })).toBe(false);
  });

  it('never overlaps candles, a sloped EMA, or another tag', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ x1: 60 + i * 12, x2: 68 + i * 12, top: 150 + (i % 3) * 8, bottom: 230 }));
    const ema = [{ x: 0, y: 120 }, { x: 600, y: 160 }];
    const reqs = [0, 1, 2].map((i) => ({ cx: 100 + i * 10, anchorTop: 150, anchorBottom: 230, prefer: 'above' as const, w: 44, h: 16 }));
    const rects = layoutTags(reqs, { candles: many, lines: [ema] }, bounds);
    for (const r of rects.map((x) => x!)) {
      for (const c of many) expect(overlaps(r, { x: c.x1, y: c.top, w: c.x2 - c.x1, h: c.bottom - c.top })).toBe(false);
      const yAt = (x: number) => 120 + (40 * x) / 600;
      expect(r.y > yAt(r.x + r.w) + 3 || r.y + r.h < yAt(r.x) - 3).toBe(true);
    }
    expect(overlaps(rects[0]!, rects[1]!) || overlaps(rects[1]!, rects[2]!) || overlaps(rects[0]!, rects[2]!)).toBe(false);
  });

  it('counts a vertical line (e.g. the flag arrow) as covering its full height', () => {
    const arrow = [{ x: 100, y: 0 }, { x: 100, y: 400 }];
    const [r] = layoutTags([{ cx: 100, anchorTop: 150, anchorBottom: 250, prefer: 'above', w: 40, h: 16 }], { candles: [], lines: [arrow] }, bounds);
    // nothing on that x is clear, so it falls back to the nearest spot rather than failing
    expect(r).toEqual({ x: 80, y: 128, w: 40, h: 16 });
  });

  it('takes a near spot on the other side over a far one on the preferred side', () => {
    // EMAs crowd everything just above the candle; the spot just below is clear
    const lines = [[{ x: 0, y: 136 }, { x: 600, y: 136 }], [{ x: 0, y: 115 }, { x: 600, y: 115 }]];
    const [r] = layoutTags([{ cx: 100, anchorTop: 150, anchorBottom: 250, prefer: 'above', w: 40, h: 16 }], { candles, lines }, bounds);
    expect(r).toEqual({ x: 80, y: 256, w: 40, h: 16 });
  });

  it('an optional tag with no clear spot is dropped (null); a required one falls back', () => {
    const wall = [{ x: 100, y: 0 }, { x: 100, y: 400 }];
    const req = { cx: 100, anchorTop: 150, anchorBottom: 250, prefer: 'above' as const, w: 40, h: 16 };
    expect(layoutTags([{ ...req, optional: true }, req], { candles: [], lines: [wall] }, bounds)).toEqual([null, { x: 80, y: 128, w: 40, h: 16 }]);
  });

  it('falls back below when there is no room above, and stays inside the pane', () => {
    const [r] = layoutTags([{ cx: 10, anchorTop: 12, anchorBottom: 60, prefer: 'above', w: 40, h: 16 }], { candles: [{ x1: 5, x2: 15, top: 12, bottom: 60 }], lines: [] }, bounds);
    expect(r!.y).toBeGreaterThan(60);
    expect(r!.x).toBeGreaterThanOrEqual(0);
  });
});
