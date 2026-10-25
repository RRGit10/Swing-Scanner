import type { ContractPick } from '../api/types';
import { money } from '../lib/format';
import { rangeStrip } from '../lib/strips';

const STATUS_TEXT = { 'AT ENTRY': 'At entry: ask is in the bottom 25% of today’s range', 'ABOVE ENTRY ZONE': 'Above the entry zone', 'NO CURRENT RANGE': 'No current range' } as const;

/** The contract's day low–high with the entry zone (bottom 25%) shaded amber and the ask as a dot. */
export function RangeStrip({ pick }: { pick: ContractPick }) {
  const c = pick.contract;
  const zone = pick.entry.zone;
  if (pick.entry.status === 'NO CURRENT RANGE' || !zone || c.dayLow == null || c.dayHigh == null || c.ask == null) {
    return (
      <p className="text-sm text-ink-3">
        No current range{c.dayBarDate ? ` (last day bar ${c.dayBarDate})` : ''}. Entry can't be judged until it trades this session.
      </p>
    );
  }
  const r = rangeStrip({ low: c.dayLow, high: c.dayHigh, zoneHigh: zone.high, ask: c.ask });
  const atEntry = pick.entry.status === 'AT ENTRY';
  return (
    <div>
      <div className="relative mt-1 h-9" role="img" aria-label={`Day range ${money(c.dayLow)} to ${money(c.dayHigh)}, entry zone up to ${money(zone.high)}, ask ${money(c.ask)}`}>
        <div className="absolute inset-x-0 top-[14px] h-2 rounded-sm bg-rule/60" />
        <div className="absolute left-0 top-[14px] h-2 rounded-l-sm bg-amber" style={{ width: `${Math.max(r.zoneEnd, 1)}%` }} />
        <div className="absolute top-[10px] size-4 -translate-x-1/2 rounded-full border-2 border-paper bg-ink" style={{ left: `${r.ask}%` }} />
        <span className="absolute left-0 top-[26px] text-[11px] text-ink-2">{money(c.dayLow)}</span>
        <span className="absolute right-0 top-[26px] text-[11px] text-ink-2">{money(c.dayHigh)}</span>
      </div>
      <p className={`mt-2 text-sm ${atEntry ? 'font-semibold text-ink' : 'text-ink-2'}`}>
        {STATUS_TEXT[pick.entry.status]}
        {!atEntry && ` (zone ${money(zone.low)}–${money(zone.high)})`}
        {r.askClamped && `, ask is ${r.askClamped} today’s range`}
      </p>
    </div>
  );
}
