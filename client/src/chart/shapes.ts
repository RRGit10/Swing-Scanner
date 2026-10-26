import type { Candle, CandleLabel, KeyPoint, PatternEntry } from '../api/types';
import { patternLabel } from '../lib/format';

/** A price at a candle (logical) index of the chart's candle array. */
export interface PricePt {
  index: number;
  price: number;
}

export type Shape =
  | { kind: 'polyline'; points: PricePt[]; width: number; dash?: boolean; label?: string }
  /** parallel channel over candles from..to: price = slope·index + upper / + lower; filled */
  | { kind: 'channel'; from: number; to: number; slope: number; upper: number; lower: number }
  /** filled box over candles from..to */
  | { kind: 'box'; from: number; to: number; top: number; bottom: number }
  /** smooth U through three points, flat at `via` */
  | { kind: 'curve'; from: PricePt; via: PricePt; to: PricePt }
  /** vertical dashed arrow at a (fractional) index */
  | { kind: 'arrow'; index: number; from: number; to: number };

export interface TagAnchor {
  text: string;
  index: number;
  price: number;
  prefer: 'above' | 'below';
  kind: 'pattern' | 'candle';
}

export interface PatternDrawing {
  shapes: Shape[];
  tags: TagAnchor[];
  /** plain-language description of what is drawn (screen readers, tests) */
  summary: string;
}

export interface ShapeInput {
  candles: Candle[];
  points: KeyPoint[];
  pattern: Pick<PatternEntry, 'type' | 'direction' | 'state' | 'triggerLevel' | 'targets' | 'triggerTime'>;
}

const ARROW_OFFSET = 0.8; // candles to the right of the flag end

/** Index of the trigger candle: the last candle that started before the trigger close time. */
export function triggerIndex(candles: Candle[], triggerCloseTime: number | null): number | null {
  if (triggerCloseTime == null) return null;
  let found: number | null = null;
  for (let i = 0; i < candles.length && candles[i]!.time < triggerCloseTime; i++) found = i;
  return found;
}

/**
 * Parallel channel enclosing candles from..to: slope from a least-squares fit of their mid prices,
 * upper line touching the highest high, lower line touching the lowest low (relative to the slope).
 */
export function fitChannel(candles: Candle[], from: number, to: number): { slope: number; upper: number; lower: number } {
  const idx = Array.from({ length: to - from + 1 }, (_, k) => from + k);
  let slope = 0;
  if (idx.length > 1) {
    const mx = idx.reduce((a, i) => a + i, 0) / idx.length;
    const mid = (i: number) => (candles[i]!.high + candles[i]!.low) / 2;
    const my = idx.reduce((a, i) => a + mid(i), 0) / idx.length;
    const sxx = idx.reduce((a, i) => a + (i - mx) ** 2, 0);
    slope = idx.reduce((a, i) => a + (i - mx) * (mid(i) - my), 0) / sxx;
  }
  return {
    slope,
    upper: Math.max(...idx.map((i) => candles[i]!.high - slope * i)),
    lower: Math.min(...idx.map((i) => candles[i]!.low - slope * i)),
  };
}

const SHORT_NAMES: Record<string, string> = {
  hammer: 'Hammer',
  inverted_hammer: 'Inv hammer',
  boom_boom: 'Boom',
  red_boom_boom: 'Red boom',
  three_green_soldiers: 'Soldiers',
  doji: 'Doji',
  spinning_top: 'Spin top',
  hanging_man: 'Hanging man',
  shooting_star: 'Shooting star',
};

export const shortCandleName = (name: string) => SHORT_NAMES[name] ?? name.replaceAll('_', ' ');

/** Short tags for the labeled candles among the last 3: below bullish candles, above the rest. */
export function candleTags(labels: CandleLabel[], candles: Candle[]): TagAnchor[] {
  const byTime = new Map(candles.map((c, i) => [c.time, i]));
  return labels.flatMap((l) => {
    const i = byTime.get(l.time);
    if (i == null || !l.names.length) return [];
    const below = l.bias === 'bullish';
    const c = candles[i]!;
    return [{ text: l.names.map(shortCandleName).join(' + '), index: i, price: below ? c.low : c.high, prefer: below ? ('below' as const) : ('above' as const), kind: 'candle' as const }];
  });
}

const neckline = (from: PricePt, to: PricePt): Shape => ({ kind: 'polyline', width: 1.5, dash: true, label: 'neckline', points: [from, to] });

/** The pattern's shape on this chart, or null when its key points aren't on these candles. */
export function buildPatternDrawing({ candles, points, pattern }: ShapeInput): PatternDrawing | null {
  const byTime = new Map(candles.map((c, i) => [c.time, i]));
  const at = (label: string): PricePt | null => {
    const p = points.find((x) => x.label === label);
    const i = p ? byTime.get(p.time) : undefined;
    return p && i != null ? { index: i, price: p.price } : null;
  };
  const last = candles.length - 1;
  const trig = pattern.state === 'triggered' ? triggerIndex(candles, pattern.triggerTime) : null;
  const end = trig ?? last;
  const side = pattern.direction === 'bullish' ? ('below' as const) : ('above' as const);
  const tag = (text: string, p: PricePt, prefer = side): TagAnchor => ({ text, index: p.index, price: p.price, prefer, kind: 'pattern' });
  const done = (shapes: Shape[], tags: TagAnchor[], parts: string[]): PatternDrawing => ({
    shapes,
    tags,
    summary: `${patternLabel(pattern.type)} drawn: ${parts.join(', ')}. Tags: ${tags.map((t) => t.text).join(', ')}.`,
  });

  switch (pattern.type) {
    case 'bull_flag':
    case 'bear_flag': {
      const start = at('pole_start');
      const poleEnd = at('pole_end');
      if (!start || !poleEnd) return null;
      const from = poleEnd.index + 1;
      const to = trig != null ? trig - 1 : last;
      const shapes: Shape[] = [];
      const parts: string[] = [];
      if (to >= from) {
        shapes.push({ kind: 'channel', from, to, ...fitChannel(candles, from, to) });
        parts.push('flag channel');
      }
      shapes.push({ kind: 'polyline', width: 4, points: [start, poleEnd] });
      parts.unshift('pole');
      const t1 = pattern.targets[0];
      if (t1) {
        shapes.push({ kind: 'arrow', index: end + ARROW_OFFSET, from: pattern.triggerLevel, to: t1.price });
        parts.push('arrow to T1');
      }
      const tags = [tag('Pole', start)];
      if (to >= from) {
        const mid = Math.floor((from + to) / 2);
        tags.push(tag('Flag', { index: mid, price: side === 'above' ? candles[mid]!.high : candles[mid]!.low }));
      }
      return done(shapes, tags, parts);
    }
    case 'double_top': {
      const p1 = at('peak_1');
      const dip = at('dip');
      const p2 = at('peak_2');
      if (!p1 || !dip || !p2) return null;
      // Outer legs make it read as an "M": the rise into peak 1 and the drop after peak 2.
      const half = dip.index - p1.index;
      const lowest = (from: number, to: number): PricePt | null => {
        let best: PricePt | null = null;
        for (let i = Math.max(0, from); i <= Math.min(last, to); i++) if (!best || candles[i]!.low < best.price) best = { index: i, price: candles[i]!.low };
        return best;
      };
      const lead = lowest(p1.index - half, p1.index - 1);
      const tail = trig != null ? { index: trig, price: candles[trig]!.close } : lowest(p2.index + 1, p2.index + half);
      const m = [...(lead ? [lead] : []), p1, dip, p2, ...(tail ? [tail] : [])];
      return done(
        [{ kind: 'polyline', width: 2.5, points: m }, neckline({ index: p1.index, price: dip.price }, { index: end, price: dip.price })],
        [tag('Top 1', p1, 'above'), tag('Top 2', p2, 'above')],
        ['M line', 'neckline'],
      );
    }
    case 'inverse_head_and_shoulders': {
      const ls = at('left_shoulder');
      const head = at('head');
      const rs = at('right_shoulder');
      const k1 = at('peak_1');
      const k2 = at('peak_2');
      if (!ls || !head || !rs || !k1 || !k2) return null;
      const slope = (k2.price - k1.price) / (k2.index - k1.index);
      return done(
        [{ kind: 'polyline', width: 2.5, points: [ls, k1, head, k2, rs] }, neckline(k1, { index: end, price: k1.price + slope * (end - k1.index) })],
        [tag('LS', ls, 'below'), tag('Head', head, 'below'), tag('RS', rs, 'below')],
        ['shoulders and head', 'neckline'],
      );
    }
    case 'cup_and_handle': {
      const left = at('left_rim');
      const bottom = at('cup_bottom');
      const right = at('right_rim');
      if (!left || !bottom || !right) return null;
      const shapes: Shape[] = [{ kind: 'curve', from: left, via: bottom, to: right }];
      const parts = ['cup curve'];
      const tags = [tag('Cup', bottom, 'below')];
      const hFrom = right.index + 1;
      const hTo = trig != null ? trig - 1 : last;
      if (hTo >= hFrom) {
        const handle = candles.slice(hFrom, hTo + 1);
        const top = Math.max(...handle.map((c) => c.high));
        shapes.push({ kind: 'box', from: hFrom, to: hTo, top, bottom: Math.min(...handle.map((c) => c.low)) });
        parts.push('handle box');
        tags.push(tag('Handle', { index: Math.floor((hFrom + hTo) / 2), price: top }, 'above'));
      }
      shapes.push(neckline(left, { index: end, price: left.price }));
      parts.push('neckline');
      return done(shapes, tags, parts);
    }
    default:
      return null;
  }
}
