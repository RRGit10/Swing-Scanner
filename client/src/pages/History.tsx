import { Fragment, useMemo, useState } from 'react';
import { useResource } from '../api/client';
import type { HistoryPayload, HistorySignal, HistorySummary, Outcome, StatusPayload } from '../api/types';
import { DirectionMark } from '../components/Marks';
import { contractName, etDateTime, money, patternLabel, pct, signedPct } from '../lib/format';

const OUTCOME_TEXT: Record<Outcome, string> = {
  win: 'T1 hit',
  loss: 'Invalidated',
  expired: 'Expired',
  pending: 'Tracking',
  open: 'Not triggered yet',
  never_triggered: 'Never triggered',
  no_contract: 'No Friday to track',
};

const OUTCOME_STYLE: Partial<Record<Outcome, string>> = { win: 'text-long font-semibold', loss: 'text-short font-semibold', expired: 'text-ink-2' };

export function History({ status }: { status: StatusPayload | null }) {
  const { data, error } = useResource<HistoryPayload>('/api/history', status?.lastScanAt ?? null);
  const [scope, setScope] = useState<'current' | 'allTime'>('current');
  const [outcome, setOutcome] = useState<'all' | Outcome>('all');
  const [ticker, setTicker] = useState('all');
  const [open, setOpen] = useState<number | null>(null);

  const tickers = useMemo(() => [...new Set(data?.signals.map((s) => s.ticker) ?? [])].sort(), [data]);
  if (error) return <p className="text-short">{error}</p>;
  if (!data) return <p className="text-ink-3">Loading history…</p>;

  const rows = data.signals.filter(
    (s) => (outcome === 'all' || s.outcome === outcome) && (ticker === 'all' || s.ticker === ticker) && (scope === 'allTime' || s.settingsVersion === data.currentVersion),
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <h1 className="text-3xl font-semibold">History</h1>
        <div role="group" aria-label="Which signals" className="flex gap-1 text-sm">
          {(['current', 'allTime'] as const).map((s) => (
            <button
              key={s}
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-sm px-2.5 py-1 ${scope === s ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
            >
              {s === 'current' ? `Settings version ${data.currentVersion}` : 'All time'}
            </button>
          ))}
        </div>
      </div>

      <HitRates summary={data.summary[scope]} />

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-ink-2">Settings versions ({data.versions.length})</summary>
        <ul className="mt-2">
          {data.versions.map((v) => (
            <li key={v.version} className="border-b border-rule/60 py-1.5">
              <span className="font-semibold">Version {v.version}</span> <span className="text-ink-2">{etDateTime(v.savedAt)}</span>
              {v.note && <span className="text-ink-2"> ({v.note})</span>}
              {v.changes.length > 0 && <span className="text-ink-2">: {v.changes.map((c) => `${c.path} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join(', ')}</span>}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <label>
          <span className="mr-2 text-ink-2">Outcome</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as never)} className="rounded-sm border border-rule bg-surface px-2 py-1">
            <option value="all">All</option>
            {(Object.keys(OUTCOME_TEXT) as Outcome[]).map((o) => (
              <option key={o} value={o}>{OUTCOME_TEXT[o]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mr-2 text-ink-2">Ticker</span>
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="rounded-sm border border-rule bg-surface px-2 py-1">
            <option value="all">All</option>
            {tickers.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 max-w-prose text-ink-2">
          {data.signals.length === 0
            ? 'No signals logged yet. Signals are recorded from scans during market hours; weekend and after-hours scans are display-only.'
            : 'No signals match these filters.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-ink-2">
                {['Ticker', 'Pattern', 'First seen', 'Triggered', 'Contract', 'Entry ask', 'Lowest in zone', 'T1', 'Outcome', 'Gain (indicative)'].map((h) => (
                  <th key={h} className="py-2 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Fragment key={s.id}>
                  <tr className="cursor-pointer border-b border-rule/60 hover:bg-surface" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                    <td className="py-2 pr-4 font-semibold">{s.ticker}</td>
                    <td className="py-2 pr-4">
                      <DirectionMark direction={s.direction} /> {patternLabel(s.type)} <span className="text-ink-3">{s.tradingTimeframe}</span>
                    </td>
                    <td className="py-2 pr-4 text-ink-2">{etDateTime(s.firstSeenAt)}</td>
                    <td className="py-2 pr-4 text-ink-2">{etDateTime(s.triggerTime)}</td>
                    <td className="py-2 pr-4">{s.frozenContract ? contractName(s.frozenContract) : s.frozenAt ? <span className="text-ink-3">No contract</span> : '—'}</td>
                    <td className="py-2 pr-4">{money(s.entryAsk)}</td>
                    <td className="py-2 pr-4">{money(s.lowestEntryAsk)}</td>
                    <td className="py-2 pr-4">{money(s.frozenT1)}</td>
                    <td className={`py-2 pr-4 ${OUTCOME_STYLE[s.outcome] ?? 'text-ink-2'}`}>{OUTCOME_TEXT[s.outcome]}</td>
                    <td className="py-2">{gainCell(s)}</td>
                  </tr>
                  {open === s.id && (
                    <tr className="border-b border-rule/60 bg-surface">
                      <td colSpan={10} className="px-3 py-3">
                        <ol className="space-y-1">
                          {s.events.map((e, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="w-36 shrink-0 text-ink-2">{etDateTime(e.at)}</span>
                              <span>{eventText(e)}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HitRates({ summary }: { summary: HistorySummary }) {
  const p = summary.pattern;
  const t = summary.tradeable;
  return (
    <div className="mt-5 grid max-w-5xl gap-6 md:grid-cols-2">
      <div>
        <h2 className="text-[15px] font-semibold">Pattern hit rate</h2>
        <p className="mt-1 text-ink-2">
          {p.resolved ? (
            <>
              <span className="text-4xl font-semibold text-ink">{pct(p.hitRate)}</span>
              <span className="mt-1 block">
                {p.wins} of {p.resolved} triggered signals reached T1 before invalidation or expiration ({p.losses} invalidated, {p.expired} expired). Judged on the stock.
              </span>
            </>
          ) : (
            'No triggered signal has resolved yet.'
          )}
        </p>
      </div>
      <div>
        <h2 className="text-[15px] font-semibold">Tradeable hit rate</h2>
        <p className="mt-1 text-ink-2">
          {t.resolved ? (
            <>
              <span className="text-4xl font-semibold text-ink">{pct(t.hitRate)}</span>
              <span className="mt-1 block">
                {t.wins} of {t.resolved} signals that had a contract reached T1 first.{' '}
                {t.gainSamples ? `Average gain ${signedPct(t.avgGainPct)} over ${t.gainSamples} exit quotes (indicative).` : 'No exit quotes recorded yet.'}
              </span>
            </>
          ) : (
            'No signal with a contract has resolved yet.'
          )}
        </p>
      </div>
      <p className="text-sm text-ink-3 md:col-span-2">
        {summary.triggered} triggered ({summary.pending} still tracking), {summary.neverTriggered} never triggered. T1 counts on a touch, invalidation on a close, which slightly favors wins.
      </p>
    </div>
  );
}

function gainCell(s: HistorySignal) {
  if (s.gainPct != null) return <span className={s.gainPct >= 0 ? 'text-long' : 'text-short'}>{signedPct(s.gainPct)}</span>;
  if (s.exitNote === 'exit quote missed') return <span className="text-ink-3">Exit quote missed</span>;
  if (s.exitNote === 'no contract') return <span className="text-ink-3">No contract</span>;
  return <span className="text-ink-3">—</span>;
}

function eventText(e: HistorySignal['events'][number]): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  switch (e.kind) {
    case 'first_seen': return `First seen, ${e.to}${d.contract ? `, contract ${contractName(String(d.contract))}` : ''}`;
    case 'status': return `Status ${e.from} → ${e.to}`;
    case 'contract': return `Contract ${e.from ? contractName(e.from) : 'none'} → ${e.to ? contractName(e.to) : 'none'}`;
    case 'triggered': return `Triggered. Frozen: ${e.to ? contractName(e.to) : 'no contract'}, entry ask ${money(d.entryAsk as number | null)}, T1 ${money(d.t1 as number | null)}`;
    case 'outcome': return `Outcome: ${OUTCOME_TEXT[e.to as Outcome] ?? e.to} at ${etDateTime(d.at as number)}`;
    case 'exit_quote': return e.to === 'ok' ? `Exit quote: bid ${money(d.bid as number)}, ask ${money(d.ask as number)} (indicative)` : 'Exit quote missed';
    case 'backfill': return `Backfilled after downtime (${etDateTime(Number(e.from))} → ${etDateTime(Number(e.to))})`;
    case 'ended': return `Ended (${(d.outcome as string) ?? ''})`;
    case 'reappeared': return 'Detected again';
    default: return e.kind;
  }
}
