import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { Candle } from '../api/types';
import type { PatternDrawing, TagAnchor } from './shapes';
import { layoutTags, type Obstacles } from './tagLayout';

// The draw target type, taken from the library's own renderer signature (no direct fancy-canvas import).
type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface ShapeStyle {
  /** the pattern's direction color */
  stroke: string;
  /** low-opacity fill for the channel / handle box */
  fill: string;
  /** pattern tags: tinted fill, direction border */
  tagFill: string;
  /** candle tags: neutral pill */
  candleTagFill: string;
  candleTagBorder: string;
  text: string;
}

export interface ShapesData {
  drawing: PatternDrawing | null;
  candleTags: TagAnchor[];
  candles: Candle[];
  /** EMA values per candle index; tags keep clear of these lines */
  emas: (number | null)[][];
  /** trigger, targets, invalidation: horizontal price lines tags must not sit on */
  levels: number[];
  style: ShapeStyle;
}

interface Pt {
  x: number;
  y: number;
}

type PixelShape =
  | { kind: 'polyline'; pts: Pt[]; width: number; dash: boolean }
  | { kind: 'polygon'; pts: Pt[] }
  | { kind: 'curve'; from: Pt; via: Pt; to: Pt }
  | { kind: 'arrow'; x: number; y1: number; y2: number };

interface PixelTag {
  text: string;
  cx: number;
  top: number;
  bottom: number;
  prefer: 'above' | 'below';
  kind: TagAnchor['kind'];
}

interface Frame {
  shapes: PixelShape[];
  tags: PixelTag[];
  obstacles: Obstacles;
  /** y of the chart's own labels drawn at the pane's right edge (price-line and EMA titles) */
  edgeLabelYs: number[];
}

/** Control points of the cup's U: leaves each rim downward, hugs the sides, flat at the bottom. */
function cupSegments(a: Pt, m: Pt, b: Pt): [Pt, Pt, Pt, Pt][] {
  return [
    [a, { x: a.x + (m.x - a.x) * 0.15, y: a.y + (m.y - a.y) * 0.75 }, { x: m.x - (m.x - a.x) * 0.45, y: m.y }, m],
    [m, { x: m.x + (b.x - m.x) * 0.45, y: m.y }, { x: b.x - (b.x - m.x) * 0.15, y: b.y + (m.y - b.y) * 0.75 }, b],
  ];
}

function sampleCubic([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], n = 16): Pt[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const u = 1 - t;
    return {
      x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
    };
  });
}

const TAG_FONT = '600 11px Archivo, ui-sans-serif, system-ui, sans-serif';
const TAG_H = 17;
const TAG_PAD = 6;
/** room the chart's right-edge labels take, e.g. "Invalidation"; taller than one label because the chart
 * pushes overlapping labels apart, so a label can sit a little off its price. */
const EDGE_LABEL_W = 100;
const EDGE_LABEL_H = 56;

/**
 * Series primitive that draws a pattern's shape over the candles: fills (flag channel, handle box)
 * behind the candles, lines / curve / arrow above them, and short tags placed clear of the candles,
 * the EMA lines and each other. Pixel geometry is rebuilt in updateAllViews (scroll, zoom, resize);
 * the renderer only paints.
 */
export class PatternShapes implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private data: ShapesData | null = null;
  private readonly view = new ShapesView();
  private readonly views: readonly IPrimitivePaneView[] = [this.view];

  attached(param: SeriesAttachedParameter<Time>): void {
    this.param = param;
  }

  detached(): void {
    this.param = null;
    this.data = null;
    this.view.frame = null;
  }

  setData(data: ShapesData | null): void {
    this.data = data;
    this.param?.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  updateAllViews(): void {
    this.view.frame = this.param && this.data ? this.buildFrame(this.param, this.data) : null;
    this.view.style = this.data?.style ?? null;
  }

  private buildFrame({ chart, series }: SeriesAttachedParameter<Time>, d: ShapesData): Frame | null {
    const ts = chart.timeScale();
    const xAt = (index: number): number | null => {
      const i0 = Math.floor(index);
      const a = ts.logicalToCoordinate(i0 as never);
      if (a == null) return null;
      if (index === i0) return a;
      const b = ts.logicalToCoordinate((i0 + 1) as never);
      return b == null ? null : a + (b - a) * (index - i0);
    };
    const yAt = (price: number) => series.priceToCoordinate(price);
    const pt = (index: number, price: number): Pt | null => {
      const x = xAt(index);
      const y = yAt(price);
      return x == null || y == null ? null : { x, y };
    };
    const all = (list: (Pt | null)[]): Pt[] | null => (list.every((p) => p != null) ? (list as Pt[]) : null);

    const shapes: PixelShape[] = [];
    for (const s of d.drawing?.shapes ?? []) {
      if (s.kind === 'polyline') {
        const pts = all(s.points.map((p) => pt(p.index, p.price)));
        if (pts) shapes.push({ kind: 'polyline', pts, width: s.width, dash: !!s.dash });
      } else if (s.kind === 'channel') {
        const line = (c: number, i: number) => s.slope * i + c;
        const pts = all([pt(s.from, line(s.upper, s.from)), pt(s.to, line(s.upper, s.to)), pt(s.to, line(s.lower, s.to)), pt(s.from, line(s.lower, s.from))]);
        if (pts) {
          shapes.push({ kind: 'polygon', pts });
          shapes.push({ kind: 'polyline', pts: [pts[0]!, pts[1]!], width: 1.5, dash: false });
          shapes.push({ kind: 'polyline', pts: [pts[3]!, pts[2]!], width: 1.5, dash: false });
        }
      } else if (s.kind === 'box') {
        const pts = all([pt(s.from - 0.4, s.top), pt(s.to + 0.4, s.top), pt(s.to + 0.4, s.bottom), pt(s.from - 0.4, s.bottom)]);
        if (pts) {
          shapes.push({ kind: 'polygon', pts });
          shapes.push({ kind: 'polyline', pts: [...pts, pts[0]!], width: 1.5, dash: false });
        }
      } else if (s.kind === 'curve') {
        const pts = all([pt(s.from.index, s.from.price), pt(s.via.index, s.via.price), pt(s.to.index, s.to.price)]);
        if (pts) shapes.push({ kind: 'curve', from: pts[0]!, via: pts[1]!, to: pts[2]! });
      } else {
        const x = xAt(s.index);
        const y1 = yAt(s.from);
        const y2 = yAt(s.to);
        if (x != null && y1 != null && y2 != null) shapes.push({ kind: 'arrow', x, y1, y2 });
      }
    }

    const tags: PixelTag[] = [];
    for (const t of [...(d.drawing?.tags ?? []), ...d.candleTags]) {
      const c = d.candles[t.index];
      const cx = xAt(t.index);
      const top = c ? yAt(c.high) : null;
      const bottom = c ? yAt(c.low) : null;
      if (cx != null && top != null && bottom != null) tags.push({ text: t.text, cx, top, bottom, prefer: t.prefer, kind: t.kind });
    }

    // Obstacles from the visible candles and EMA lines only.
    const range = ts.getVisibleLogicalRange();
    const obstacles: Obstacles = { candles: [], lines: [] };
    if (range) {
      const from = Math.max(0, Math.floor(range.from));
      const to = Math.min(d.candles.length - 1, Math.ceil(range.to));
      const half = Math.max(1, (ts.options().barSpacing ?? 6) * 0.4);
      for (let i = from; i <= to; i++) {
        const x = xAt(i);
        const top = yAt(d.candles[i]!.high);
        const bottom = yAt(d.candles[i]!.low);
        if (x != null && top != null && bottom != null) obstacles.candles.push({ x1: x - half, x2: x + half, top, bottom });
      }
      for (const ema of d.emas) {
        const line: Pt[] = [];
        for (let i = from; i <= to; i++) {
          const v = ema[i];
          const p = v == null ? null : pt(i, v);
          if (p) line.push(p);
        }
        if (line.length > 1) obstacles.lines.push(line);
      }
    }
    // Tags also keep off the pattern's own lines and the price levels.
    for (const s of shapes) {
      if (s.kind === 'polyline') obstacles.lines.push(s.pts);
      else if (s.kind === 'curve') obstacles.lines.push(...cupSegments(s.from, s.via, s.to).map((seg) => sampleCubic(seg)));
      else if (s.kind === 'arrow') obstacles.lines.push([{ x: s.x, y: s.y1 }, { x: s.x, y: s.y2 }]);
    }
    const edgeLabelYs: number[] = [];
    for (const price of d.levels) {
      const y = yAt(price);
      if (y == null) continue;
      obstacles.lines.push([{ x: -1e6, y }, { x: 1e6, y }]);
      edgeLabelYs.push(y);
    }
    for (const ema of d.emas) {
      const lastValue = [...ema].reverse().find((v) => v != null);
      const y = lastValue == null ? null : yAt(lastValue);
      if (y != null) edgeLabelYs.push(y);
    }
    return shapes.length || tags.length ? { shapes, tags, obstacles, edgeLabelYs } : null;
  }
}

class ShapesView implements IPrimitivePaneView {
  frame: Frame | null = null;
  style: ShapeStyle | null = null;

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this.frame && this.style ? new ShapesRenderer(this.frame, this.style) : null;
  }
}

class ShapesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly frame: Frame,
    private readonly style: ShapeStyle,
  ) {}

  /** Fills go behind the candles so they stay readable. */
  drawBackground(target: Target): void {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      ctx.save();
      ctx.fillStyle = this.style.fill;
      for (const s of this.frame.shapes) {
        if (s.kind !== 'polygon') continue;
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * hr, p.y * vr) : ctx.moveTo(p.x * hr, p.y * vr)));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }

  draw(target: Target): void {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      ctx.save();
      ctx.strokeStyle = this.style.stroke;
      ctx.fillStyle = this.style.stroke;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const s of this.frame.shapes) {
        if (s.kind === 'polyline') {
          ctx.lineWidth = s.width * hr;
          ctx.setLineDash(s.dash ? [6 * hr, 4 * hr] : []);
          ctx.lineCap = s.dash ? 'butt' : 'round';
          ctx.beginPath();
          s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * hr, p.y * vr) : ctx.moveTo(p.x * hr, p.y * vr)));
          ctx.stroke();
        } else if (s.kind === 'curve') {
          ctx.lineWidth = 2.5 * hr;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(s.from.x * hr, s.from.y * vr);
          for (const [, c1, c2, e] of cupSegments(s.from, s.via, s.to)) ctx.bezierCurveTo(c1.x * hr, c1.y * vr, c2.x * hr, c2.y * vr, e.x * hr, e.y * vr);
          ctx.stroke();
        } else if (s.kind === 'arrow') {
          const dir = Math.sign(s.y2 - s.y1) || 1;
          const head = 7;
          ctx.lineWidth = 1.5 * hr;
          ctx.lineCap = 'butt';
          ctx.setLineDash([5 * hr, 4 * hr]);
          ctx.beginPath();
          ctx.moveTo(s.x * hr, s.y1 * vr);
          ctx.lineTo(s.x * hr, (s.y2 - dir * head) * vr);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(s.x * hr, s.y2 * vr);
          ctx.lineTo((s.x - 4.5) * hr, (s.y2 - dir * head) * vr);
          ctx.lineTo((s.x + 4.5) * hr, (s.y2 - dir * head) * vr);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    });

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (!this.frame.tags.length) return;
      ctx.save();
      ctx.font = TAG_FONT;
      const requests = this.frame.tags.map((t) => ({
        cx: t.cx, anchorTop: t.top, anchorBottom: t.bottom, prefer: t.prefer, w: Math.ceil(ctx.measureText(t.text).width) + 2 * TAG_PAD, h: TAG_H,
        // candle names are also listed under the chart, so a crowded one is dropped rather than overlapped
        optional: t.kind === 'candle',
      }));
      const edge = this.frame.edgeLabelYs.map((y) => ({ x1: mediaSize.width - EDGE_LABEL_W, x2: mediaSize.width, top: y - EDGE_LABEL_H / 2, bottom: y + EDGE_LABEL_H / 2 }));
      const rects = layoutTags(requests, { ...this.frame.obstacles, candles: [...this.frame.obstacles.candles, ...edge] }, mediaSize);
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      this.frame.tags.forEach((t, i) => {
        const r = rects[i];
        if (!r) return;
        const pattern = t.kind === 'pattern';
        ctx.beginPath();
        ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 4);
        ctx.fillStyle = pattern ? this.style.tagFill : this.style.candleTagFill;
        ctx.fill();
        ctx.strokeStyle = pattern ? this.style.stroke : this.style.candleTagBorder;
        ctx.stroke();
        ctx.fillStyle = this.style.text;
        ctx.fillText(t.text, r.x + TAG_PAD, r.y + r.h / 2 + 0.5);
      });
      ctx.restore();
    });
  }
}
