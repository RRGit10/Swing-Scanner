export interface StripPoint {
  key: string;
  value: number;
}

export type LabelRow = 'below' | 'above' | 'below2';

export interface PlacedPoint extends StripPoint {
  /** 0–100, left to right in the direction of the trade */
  pos: number;
  /** first row where the label doesn't overlap another (below the line, above it, then a second row below) */
  labelSide: LabelRow;
  /** text alignment, so labels near either edge stay inside the strip */
  anchor: 'start' | 'middle' | 'end';
}

const PAD = 4;
const EDGE = 15;
const ROWS: LabelRow[] = ['below', 'above', 'below2'];

/**
 * Price path to scale (invalidation, price, trigger, targets). Bearish strips are mirrored so the
 * trade always reads left → right. `labelWidth(point)` = label width as % of the strip (default 10).
 */
export function pathStrip(
  direction: 'bullish' | 'bearish',
  points: StripPoint[],
  labelWidth: (p: StripPoint) => number = () => 10,
): PlacedPoint[] {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const placed = points
    .map((p) => {
      const raw = PAD + ((p.value - min) / span) * (100 - 2 * PAD);
      const pos = direction === 'bullish' ? raw : 100 - raw;
      const anchor = pos < EDGE ? ('start' as const) : pos > 100 - EDGE ? ('end' as const) : ('middle' as const);
      return { ...p, pos, anchor };
    })
    .sort((a, b) => a.pos - b.pos);

  const lastEnd: Record<LabelRow, number> = { below: -Infinity, above: -Infinity, below2: -Infinity };
  return placed.map((p) => {
    const w = labelWidth(p);
    const from = p.anchor === 'start' ? p.pos : p.anchor === 'end' ? p.pos - w : p.pos - w / 2;
    const row = ROWS.find((r) => from >= lastEnd[r] + 1) ?? 'below';
    lastEnd[row] = from + w;
    return { ...p, labelSide: row };
  });
}

/** Contract day range as 0–100: the entry zone's end and the ask (clamped, with the side it fell off). */
export function rangeStrip(r: { low: number; high: number; zoneHigh: number; ask: number }): {
  zoneEnd: number;
  ask: number;
  askClamped: 'below' | 'above' | null;
} {
  const span = r.high - r.low;
  const at = (v: number) => (span > 0 ? ((v - r.low) / span) * 100 : 0);
  const raw = at(r.ask);
  const askClamped = r.ask < r.low ? 'below' : r.ask > r.high ? 'above' : null;
  return { zoneEnd: Math.min(100, Math.max(0, at(r.zoneHigh))), ask: Math.min(100, Math.max(0, raw)), askClamped };
}
