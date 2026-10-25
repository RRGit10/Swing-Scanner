import type { ReactNode } from 'react';
import type { Direction, Status } from '../api/types';

const STATUS_STYLE: Record<Status, string> = {
  'AT ENTRY': 'bg-amber text-[#1d2b3a] font-bold',
  READY: 'bg-ink text-paper font-semibold',
  WATCH: 'border border-ink-2 text-ink-2',
  WAIT: 'border border-dashed border-ink-3 text-ink-3',
};

const STATUS_HELP: Record<Status, string> = {
  'AT ENTRY': 'Triggered, candles agree, and the contract ask is in its entry zone',
  READY: 'Triggered and the candles agree',
  WATCH: 'Waiting for the trigger, or the candles disagree',
  WAIT: 'Newest candle is a doji or spinning top',
};

export function StatusTag({ status }: { status: Status }) {
  return (
    <span title={STATUS_HELP[status]} className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs tracking-wide ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function DirectionMark({ direction, withText = false }: { direction: Direction; withText?: boolean }) {
  const bull = direction === 'bullish';
  return (
    <span className={bull ? 'text-long' : 'text-short'} aria-label={bull ? 'Bullish (call)' : 'Bearish (put)'}>
      <span aria-hidden>{bull ? '▲' : '▼'}</span>
      {withText && <span className="ml-1">{bull ? 'Bullish' : 'Bearish'}</span>}
    </span>
  );
}

export function Badge({ tone = 'plain', children, title }: { tone?: 'plain' | 'warn' | 'muted'; children: ReactNode; title?: string }) {
  const style =
    tone === 'warn' ? 'border-amber text-ink bg-amber-wash' : tone === 'muted' ? 'border-dashed border-ink-3 text-ink-3' : 'border-rule text-ink-2';
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-px text-xs ${style}`}>
      {children}
    </span>
  );
}
