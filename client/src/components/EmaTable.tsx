import type { EmaLevel, EmaRow } from '../api/types';
import { money } from '../lib/format';

const PERIODS = ['13', '48', '55', '200'] as const;

/** 13/48/55/200 on 15m, 30m, 1h and daily; nearest support/resistance; daily EMAs in the trade's path highlighted. */
export function EmaTable({ rows, inPath }: { rows: EmaRow[]; inPath: EmaLevel[] }) {
  const flagged = new Set(inPath.map((e) => String(e.period)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="mb-2 text-left text-[15px] font-semibold text-ink">EMA levels</caption>
        <thead>
          <tr className="border-b border-rule text-left text-ink-2">
            <th className="py-1.5 pr-3 font-normal">Chart</th>
            {PERIODS.map((p) => (
              <th key={p} className="py-1.5 pr-3 text-right font-normal">{p}{p === '55' ? ' (reversal)' : ''}</th>
            ))}
            <th className="py-1.5 pr-3 text-right font-normal">Support</th>
            <th className="py-1.5 text-right font-normal">Resistance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.timeframe} className="border-b border-rule/60">
              <th scope="row" className="py-1.5 pr-3 text-left font-semibold">{r.timeframe === '1d' ? 'Daily' : r.timeframe}</th>
              {PERIODS.map((p) => {
                const hot = r.timeframe === '1d' && flagged.has(p);
                return (
                  <td key={p} className={`py-1.5 pr-3 text-right ${hot ? 'bg-amber-wash font-semibold' : ''}`} title={hot ? 'Daily EMA in the trade’s path' : undefined}>
                    {money(r.ema[p])}
                  </td>
                );
              })}
              <td className="py-1.5 pr-3 text-right text-ink-2">{r.support ? `${r.support.period} at ${money(r.support.value)}` : '—'}</td>
              <td className="py-1.5 text-right text-ink-2">{r.resistance ? `${r.resistance.period} at ${money(r.resistance.value)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {inPath.length > 0 && <p className="mt-2 text-sm text-ink-2">Highlighted: daily EMAs between price and the target, which can stall the move.</p>}
    </div>
  );
}
