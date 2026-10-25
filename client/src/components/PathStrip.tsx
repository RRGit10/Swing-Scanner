import { useEffect, useRef, useState } from 'react';
import type { Direction, Target } from '../api/types';
import { money } from '../lib/format';
import { pathStrip } from '../lib/strips';

/**
 * The stock's route, to scale: invalidation ← price → trigger → T1 → T2. Bearish strips are mirrored
 * so the trade always reads left to right.
 */
export function PathStrip(p: { direction: Direction; price: number | null; triggerLevel: number; invalidation: number; targets: Target[] }) {
  const points = [
    { key: 'Invalidation', value: p.invalidation },
    { key: 'Trigger', value: p.triggerLevel },
    ...p.targets.map((t, i) => ({ key: `T${i + 1}`, value: t.price })),
    ...(p.price != null ? [{ key: 'Now', value: p.price }] : []),
  ];
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);
  // Label width as a share of the strip (≈6.3px per character at 11px).
  const placed = pathStrip(p.direction, points, (pt) => (((`${pt.key} ${money(pt.value)}`.length * 6.3 + 6) / Math.max(width, 1)) * 100));
  const tall = placed.some((x) => x.labelSide === 'below2');
  const at = (key: string) => placed.find((x) => x.key === key)!.pos;
  const trig = at('Trigger');
  const last = at(`T${p.targets.length}`);
  const color = p.direction === 'bullish' ? 'var(--long)' : 'var(--short)';
  const summary = placed.map((x) => `${x.key} ${money(x.value)}`).join(', ');

  return (
    <div ref={host} className={`relative w-full ${tall ? 'h-[70px]' : 'h-14'}`} role="img" aria-label={`Price path: ${summary}`}>
      <div className="absolute inset-x-0 top-[26px] h-px bg-rule" />
      <div className="absolute top-[25px] h-[3px] rounded-full" style={{ left: `${Math.min(trig, last)}%`, width: `${Math.abs(last - trig)}%`, background: color, opacity: 0.85 }} />
      {placed.map((x) => {
        const isNow = x.key === 'Now';
        return (
          <div key={x.key} className="absolute top-0 h-full" style={{ left: `${x.pos}%` }}>
            <div
              className={isNow ? 'absolute top-[21px] size-[11px] -translate-x-1/2 rounded-full border-2 border-paper bg-ink' : 'absolute top-[21px] h-[11px] w-px -translate-x-1/2 bg-ink-2'}
            />
            <div
              className={`absolute whitespace-nowrap text-[11px] leading-tight ${x.anchor === 'middle' ? '-translate-x-1/2' : x.anchor === 'end' ? '-translate-x-full' : ''} ${x.labelSide === 'above' ? 'top-0' : x.labelSide === 'below2' ? 'top-[52px]' : 'top-[36px]'} ${isNow ? 'font-semibold text-ink' : 'text-ink-2'}`}
            >
              <span className={x.key.startsWith('T') ? 'font-semibold' : ''} style={x.key.startsWith('T') ? { color } : undefined}>
                {x.key}
              </span>{' '}
              {money(x.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
