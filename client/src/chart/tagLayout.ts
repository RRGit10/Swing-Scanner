/** Pixel rectangle (CSS pixels, pane coordinates), top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TagRequest {
  /** horizontal center of the anchor candle */
  cx: number;
  /** pixel y of the anchor candle's high (top) and low (bottom) */
  anchorTop: number;
  anchorBottom: number;
  prefer: 'above' | 'below';
  w: number;
  h: number;
  /** drop the tag (null) instead of overlapping when there's no clear spot */
  optional?: boolean;
}

export interface Obstacles {
  /** candle extents (wick to wick) */
  candles: { x1: number; x2: number; top: number; bottom: number }[];
  /** polylines that tags must not sit on, e.g. the EMAs */
  lines: { x: number; y: number }[][];
}

const GAP = 6; // between the candle and the tag
const STEP = 10; // each further candidate
const STEPS = 9;
const CANDLE_PAD = 2;
const LINE_PAD = 3;
const EDGE = 2;
/** extra distance charged for using the non-preferred side, so a nearby spot there beats a far one */
const OTHER_SIDE_COST = 14;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** y-range a polyline covers between x1 and x2, or null if it doesn't reach that span. */
function lineYRange(line: { x: number; y: number }[], x1: number, x2: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const s1 = Math.max(Math.min(a.x, b.x), x1);
    const s2 = Math.min(Math.max(a.x, b.x), x2);
    if (s1 > s2) continue;
    if (a.x === b.x) {
      // vertical segment: covers its whole height
      lo = Math.min(lo, a.y, b.y);
      hi = Math.max(hi, a.y, b.y);
      continue;
    }
    const yAt = (x: number) => (b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
    for (const y of [yAt(s1), yAt(s2)]) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

function clear(r: Rect, obstacles: Obstacles, placed: Rect[]): boolean {
  for (const c of obstacles.candles) {
    if (overlaps(r, { x: c.x1 - CANDLE_PAD, y: c.top - CANDLE_PAD, w: c.x2 - c.x1 + 2 * CANDLE_PAD, h: c.bottom - c.top + 2 * CANDLE_PAD })) return false;
  }
  for (const line of obstacles.lines) {
    const range = lineYRange(line, r.x, r.x + r.w);
    if (range && range[0] - LINE_PAD < r.y + r.h && r.y < range[1] + LINE_PAD) return false;
  }
  return !placed.some((p) => overlaps(r, { x: p.x - CANDLE_PAD, y: p.y - CANDLE_PAD, w: p.w + 2 * CANDLE_PAD, h: p.h + 2 * CANDLE_PAD }));
}

/**
 * Place each tag near its candle: the nearest spot clear of candles, lines and earlier tags, preferring
 * the requested side (the other side costs a little extra distance). Otherwise the nearest spot inside the
 * pane, or null for an optional tag.
 */
export function layoutTags(requests: TagRequest[], obstacles: Obstacles, bounds: { width: number; height: number }): (Rect | null)[] {
  const placed: Rect[] = [];
  const out: (Rect | null)[] = [];
  for (const q of requests) {
    const x = Math.min(Math.max(q.cx - q.w / 2, EDGE), Math.max(EDGE, bounds.width - q.w - EDGE));
    const candidates = Array.from({ length: STEPS }, (_, k) => [
      { y: q.anchorTop - GAP - q.h - k * STEP, cost: GAP + k * STEP + (q.prefer === 'above' ? 0 : OTHER_SIDE_COST) },
      { y: q.anchorBottom + GAP + k * STEP, cost: GAP + k * STEP + (q.prefer === 'below' ? 0 : OTHER_SIDE_COST) },
    ])
      .flat()
      .sort((a, b) => a.cost - b.cost)
      .map(({ y }) => ({ x, y, w: q.w, h: q.h }))
      .filter((r) => r.y >= EDGE && r.y + r.h <= bounds.height - EDGE);
    const fallback = candidates[0] ?? { x, y: Math.min(Math.max(q.anchorTop - GAP - q.h, EDGE), bounds.height - q.h - EDGE), w: q.w, h: q.h };
    const rect = candidates.find((r) => clear(r, obstacles, placed)) ?? (q.optional ? null : fallback);
    if (rect) placed.push(rect);
    out.push(rect);
  }
  return out;
}
