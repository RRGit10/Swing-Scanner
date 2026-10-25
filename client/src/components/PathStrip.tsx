import { useEffect, useRef, useState } from 'react';
import type { Direction, Target } from '../api/types';
import { money } from '../lib/format';
import { pathStrip } from '../lib/strips';

const LABEL_H = 30; // two 11–12px lines

/**
 * The stock's route, to scale: Inval ← Now → Trigger → T1 → T2, with two-line labels (name over value).
 * Bearish strips are mirrored so the trade always reads left to right. Labels that would collide move
 * above the line, then to a second row below.
 */
export function PathStrip(p: { direction: Direction; price: number | null; triggerLevel: number; invalidation: number; targets: Target[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);

  const points = [
    { key: 'Inval', value: p.invalidation },
    { key: 'Trigger', value: p.triggerLevel },
    ...p.targets.map((t, i) => ({ key: `T${i + 1}`, value: t.price })),
    ...(p.price != null ? [{ key: 'Now', value: p.price }] : []),
  ];
  // Label width as a share of the strip: the longer of its two lines, ≈6.8px per character.
  const placed = pathStrip(p.direction, points, (pt) => ((Math.max(pt.key.length, money(pt.value).length) * 6.8 + 10) / Math.max(width, 1)) * 100);
  const hasAbove = placed.some((x) => x.labelSide === 'above');
  const hasSecond = placed.some((x) => x.labelSide === 'below2');
  const lineY = hasAbove ? LABEL_H + 6 : 8;
  const height = lineY + 10 + LABEL_H * (hasSecond ? 2 : 1);
  const top = (side: string) => (side === 'above' ? 0 : side === 'below2' ? lineY + 10 + LABEL_H : lineY + 10);

  const at = (key: string) => placed.find((x) => x.key === key)!.pos;
  const trig = at('Trigger');
  const last = at(`T${p.targets.length}`);
  const color = p.direction === 'bullish' ? 'var(--long)' : 'var(--short)';
  const summary = placed.map((x) => `${x.key} ${money(x.value)}`).join(', ');

  return (
    <div ref={host} className="relative w-full" style={{ height }} role="img" aria-label={`Price path: ${summary}`}>
      <div className="absolute inset-x-0 h-px bg-ink-3/60" style={{ top: lineY }} />
      <div className="absolute h-[3px] rounded-full" style={{ top: lineY - 1, left: `${Math.min(trig, last)}%`, width: `${Math.abs(last - trig)}%`, background: color }} />
      {placed.map((x) => {
        const isNow = x.key === 'Now';
        const isLevel = x.key === 'Trigger' || x.key.startsWith('T');
        return (
          <div key={x.key} className="absolute" style={{ left: `${x.pos}%`, top: 0, height }}>
            {isNow || x.key === 'Trigger' ? (
              <div className="absolute size-[11px] -translate-x-1/2 rounded-full border-2 border-surface" style={{ top: lineY - 5, background: isNow ? 'var(--ink)' : color }} />
            ) : (
              <div className="absolute h-[11px] w-px -translate-x-1/2 bg-ink-2" style={{ top: lineY - 5 }} />
            )}
            <div
              className={`absolute whitespace-nowrap text-[11.5px] leading-[15px] ${x.anchor === 'middle' ? '-translate-x-1/2 text-center' : x.anchor === 'end' ? '-translate-x-full text-right' : ''}`}
              style={{ top: top(x.labelSide) }}
            >
              <div className={isLevel ? 'font-semibold' : isNow ? 'font-semibold text-ink' : 'text-ink-2'} style={isLevel ? { color } : undefined}>
                {x.key}
              </div>
              <div className={isLevel ? '' : isNow ? 'text-ink' : 'text-ink-2'} style={x.key === 'Trigger' ? { color } : undefined}>
                {money(x.value)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
