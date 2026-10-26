import { useResource } from '../api/client';
import type { ContractPick, PatternEntry, SignalsPayload, StatusPayload, TickerEntry } from '../api/types';
import { LiquidityLine } from '../components/LiquidityLine';
import { Badge, DirectionMark, StatusTag } from '../components/Marks';
import { PathStrip } from '../components/PathStrip';
import { estAtT1, NoContract, PatternBadges, triggerText } from '../components/PatternBits';
import { RangeStrip } from '../components/RangeStrip';
import { TickerLogo } from '../components/TickerLogo';
import { OPTION_PRICE_LABEL } from '../labels';
import { contractName, etDateTime, fixed, money, patternLabel, shortDate, signedPct } from '../lib/format';
import { groupByContract } from '../lib/groups';

export function Dashboard({ status }: { status: StatusPayload | null }) {
  const { data, error, loading } = useResource<SignalsPayload>('/api/signals', status?.lastScanAt ?? null);

  if (error) return <p className="text-short">{error}</p>;
  if (loading && !data) return <p className="text-ink-3">Loading the latest scan…</p>;
  if (!data?.scannedAt) {
    return <p className="max-w-prose text-ink-2">No scan yet. The first scan runs at the next market open (9:30 ET); results appear here automatically.</p>;
  }

  const active = data.tickers.filter((t) => t.patterns.length);
  const quiet = data.tickers.filter((t) => !t.patterns.length && !t.error);
  const failed = data.tickers.filter((t) => t.error);

  return (
    <div>
      <p className="mb-4 text-[15px] text-ink-2">
        {active.length ? `${active.length} tickers with a setup` : 'No setups in the latest scan'}, scanned {etDateTime(data.scannedAt)} ET. Ready and at-entry first.
      </p>
      <div className="flex flex-col gap-4">
        {active.map((t) => (
          <TickerCard key={t.ticker} entry={t} />
        ))}
      </div>
      {quiet.length > 0 && (
        <p className="mt-5 text-sm text-ink-2">
          No setup right now: <span className="text-ink">{quiet.map((t) => t.ticker).join(', ')}</span>
        </p>
      )}
      {failed.map((t) => (
        <p key={t.ticker} className="mt-3 text-sm text-short">
          Couldn’t scan {t.ticker}: {t.error}
        </p>
      ))}
    </div>
  );
}

/** One card per ticker: identity column on the left, then one row per contract group (patterns + right panel). */
function TickerCard({ entry }: { entry: TickerEntry }) {
  return (
    <section
      aria-labelledby={`t-${entry.ticker}`}
      className="grid overflow-hidden rounded-xl border border-card-border bg-surface md:grid-cols-[10.5rem_minmax(0,1fr)]"
    >
      <div className="flex items-center gap-4 border-b border-card-border p-5 md:block md:border-b-0 md:border-r">
        <TickerLogo ticker={entry.ticker} />
        <div className="md:mt-3">
          <a id={`t-${entry.ticker}`} href={`#/t/${entry.ticker}`} className="ticker block text-[28px] text-ink hover:text-accent">
            {entry.ticker}
          </a>
          <div className="mt-1 text-lg">{money(entry.price)}</div>
          <a href={`#/t/${entry.ticker}`} className="mt-1 inline-block text-sm text-accent hover:underline">
            Open chart →
          </a>
        </div>
      </div>
      <div className="divide-y divide-card-border">
        {groupByContract(entry.patterns).map((g) => (
          <div key={g.symbol ?? 'none'} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="flex min-w-0 flex-col gap-7">
              {g.patterns.map((p) => (
                <PatternBlock key={p.key} entry={entry} p={p} />
              ))}
            </div>
            <aside className="self-start rounded-lg border border-card-border bg-panel p-4" aria-label={g.symbol ? `Contract ${contractName(g.symbol)}` : 'No contract fits'}>
              {g.symbol ? (
                <ContractPanel pick={entry.contracts.find((c) => c.contract.symbol === g.symbol)!} users={g.patterns} />
              ) : (
                <NoContract p={g.patterns[0]!} />
              )}
            </aside>
          </div>
        ))}
      </div>
    </section>
  );
}

function PatternBlock({ entry, p }: { entry: TickerEntry; p: PatternEntry }) {
  const hasContract = 'symbol' in p.contract;
  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DirectionMark direction={p.direction} />
        <h3 className="text-[17px] font-semibold">{patternLabel(p.type)}</h3>
        <span className="text-sm text-ink-2">{p.timeframes[0]}{p.timeframes.length > 1 ? ` (also ${p.timeframes.slice(1).join(', ')})` : ''}</span>
        <StatusTag status={p.status} />
      </div>
      <p className="mt-1 text-sm text-ink-2">{triggerText(p)}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
        <PatternBadges p={p} />
      </div>
      <div className="mt-3">
        <PathStrip direction={p.direction} price={entry.price} triggerLevel={p.triggerLevel} invalidation={p.invalidation} targets={p.targets} />
      </div>
      <p className="mt-2 text-sm">
        {p.targets.map((t, i) => (
          <span key={i} className="mr-4">
            T{i + 1} {money(t.price)} <span className="text-ink-2">({t.label})</span>
          </span>
        ))}
      </p>
      {!hasContract && <p className="mt-1 text-sm text-ink-2">No contract fits this setup.</p>}
    </article>
  );
}

function ContractPanel({ pick, users }: { pick: ContractPick; users: PatternEntry[] }) {
  const c = pick.contract;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="ticker text-lg">{contractName(c.symbol)}</span>
        <span className="text-sm text-ink-2">{pick.dte} days</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 text-sm">
        <span>
          Δ {fixed(c.delta, 2)} <span className="font-semibold">grade {pick.grade}</span>
        </span>
        <span>
          Ask <span className="text-base font-semibold">{money(c.ask)}</span>
        </span>
      </div>
      <LiquidityLine pick={pick} className="mt-1 text-sm text-ink-2" />
      <p className="text-xs text-ink-3">{OPTION_PRICE_LABEL}</p>
      <div className="mt-2">
        <RangeStrip pick={pick} />
      </div>
      <ul className="mt-3 space-y-0.5 text-sm">
        {users.map((u) => (
          <li key={u.key}>
            Est. at T1 <span className="font-semibold text-ink">{signedPct(estAtT1(u))}</span>
            {users.length > 1 && <span className="text-ink-2"> ({patternLabel(u.type).toLowerCase()})</span>}
          </li>
        ))}
      </ul>
      {pick.earningsDate && (
        <div className="mt-3">
          <Badge tone="warn">Earnings {shortDate(pick.earningsDate)}, before expiration</Badge>
        </div>
      )}
    </div>
  );
}
