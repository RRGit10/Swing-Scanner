import { useResource } from '../api/client';
import type { ContractPick, PatternEntry, SignalsPayload, StatusPayload, TickerEntry } from '../api/types';
import { DirectionMark, Badge, StatusTag } from '../components/Marks';
import { PathStrip } from '../components/PathStrip';
import { contractFor, estAtT1, NoContract, PatternBadges, tfList, triggerText } from '../components/PatternBits';
import { RangeStrip } from '../components/RangeStrip';
import { OPTION_PRICE_LABEL } from '../labels';
import { contractName, etDateTime, fixed, money, patternLabel, shortDate, signedPct } from '../lib/format';

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
      <p className="mb-2 text-sm text-ink-3">
        {active.length ? `${active.length} tickers with a setup` : 'No setups in the latest scan'}, scanned {etDateTime(data.scannedAt)} ET. Ready and at-entry first.
      </p>
      {active.map((t) => (
        <TickerBand key={t.ticker} entry={t} />
      ))}
      {quiet.length > 0 && (
        <p className="border-b border-rule py-4 text-sm text-ink-2">
          No setup right now: <span className="text-ink">{quiet.map((t) => t.ticker).join(', ')}</span>
        </p>
      )}
      {failed.map((t) => (
        <p key={t.ticker} className="border-b border-rule py-3 text-sm text-short">
          Couldn’t scan {t.ticker}: {t.error}
        </p>
      ))}
    </div>
  );
}

function TickerBand({ entry }: { entry: TickerEntry }) {
  return (
    <section aria-labelledby={`t-${entry.ticker}`} className="grid gap-x-10 gap-y-5 border-b border-rule py-6 md:grid-cols-[8.5rem_minmax(0,1fr)] xl:grid-cols-[8.5rem_minmax(0,1fr)_23rem]">
      <div>
        <a id={`t-${entry.ticker}`} href={`#/t/${entry.ticker}`} className="ticker text-[2rem] text-ink hover:text-ink-2">
          {entry.ticker}
        </a>
        <div className="mt-2 text-lg">{money(entry.price)}</div>
        <a href={`#/t/${entry.ticker}`} className="mt-1 inline-block text-sm text-ink-2 underline decoration-rule underline-offset-4 hover:decoration-ink">
          Open chart
        </a>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        {entry.patterns.map((p) => (
          <PatternRow key={p.key} entry={entry} p={p} />
        ))}
      </div>
      <div className="flex flex-col gap-6 md:col-start-2 xl:col-start-auto">
        {entry.contracts.map((c) => (
          <ContractBlock key={c.contract.symbol} pick={c} users={entry.patterns.filter((p) => 'symbol' in p.contract && p.contract.symbol === c.contract.symbol)} />
        ))}
        {entry.patterns.filter((p) => !('symbol' in p.contract)).slice(0, 1).map((p) => (
          <div key={p.key} className="border-l-2 border-rule pl-4">
            <NoContract p={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PatternRow({ entry, p }: { entry: TickerEntry; p: PatternEntry }) {
  const pick = contractFor(entry, p);
  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <DirectionMark direction={p.direction} />
        <h3 className="text-[17px] font-semibold">{patternLabel(p.type)}</h3>
        <span className="text-sm text-ink-2">{tfList(p)}</span>
        <StatusTag status={p.status} />
        <span className="text-sm text-ink-2">{triggerText(p)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <PatternBadges p={p} />
      </div>
      <div className="mt-2 max-w-3xl">
        <PathStrip direction={p.direction} price={entry.price} triggerLevel={p.triggerLevel} invalidation={p.invalidation} targets={p.targets} />
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {p.targets.map((t, i) => (
          <span key={i} className="mr-4">
            T{i + 1} {money(t.price)} <span className="text-ink-3">({t.label})</span>
          </span>
        ))}
        {pick && (
          <span>
            Est. at T1 <span className="font-semibold text-ink">{signedPct(estAtT1(p))}</span> on {contractName(pick.contract.symbol)}
          </span>
        )}
      </p>
      {!pick && <p className="mt-1 text-sm text-ink-3">No contract fits this setup.</p>}
    </article>
  );
}

function ContractBlock({ pick, users }: { pick: ContractPick; users: PatternEntry[] }) {
  const c = pick.contract;
  return (
    <div className="border-l-2 border-ink pl-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="ticker text-lg">{contractName(c.symbol)}</span>
        <span className="text-sm text-ink-2">{pick.dte} days</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm">
        <span>
          Δ {fixed(c.delta, 2)} <span className="font-semibold">grade {pick.grade}</span>
        </span>
        <span>
          Ask <span className="text-base font-semibold">{money(c.ask)}</span>
        </span>
        <span className="text-ink-3">OI {c.openInterest.toLocaleString()}</span>
      </div>
      <p className="text-xs text-ink-3">{OPTION_PRICE_LABEL}</p>
      <RangeStrip pick={pick} />
      {pick.earningsDate && (
        <div className="mt-2">
          <Badge tone="warn">Earnings {shortDate(pick.earningsDate)}, before expiration</Badge>
        </div>
      )}
      {users.length > 1 && <p className="mt-2 text-sm text-ink-2">Shared by {users.map((u) => patternLabel(u.type).toLowerCase()).join(' and ')}.</p>}
    </div>
  );
}
