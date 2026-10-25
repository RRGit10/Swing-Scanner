import { useEffect, useMemo, useState } from 'react';
import { useResource } from '../api/client';
import type { ChartPayload, PatternEntry, SignalsPayload, StatusPayload, Timeframe } from '../api/types';
import { ContractCard } from '../components/ContractCard';
import { EmaTable } from '../components/EmaTable';
import { DirectionMark, StatusTag } from '../components/Marks';
import { contractFor, PatternBadges, triggerText } from '../components/PatternBits';
import { PathStrip } from '../components/PathStrip';
import { PriceChart } from '../components/PriceChart';
import { etDateTime, money, patternLabel } from '../lib/format';

export function Detail({ ticker, status }: { ticker: string; status: StatusPayload | null }) {
  const signals = useResource<SignalsPayload>('/api/signals', status?.lastScanAt ?? null);
  const entry = signals.data?.tickers.find((t) => t.ticker === ticker) ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const pattern: PatternEntry | null = useMemo(
    () => entry?.patterns.find((p) => p.key === selectedKey) ?? entry?.patterns[0] ?? null,
    [entry, selectedKey],
  );
  const [tf, setTf] = useState<Timeframe | null>(null);
  useEffect(() => setTf(null), [pattern?.key]);
  const timeframe: Timeframe = tf ?? pattern?.tradingTimeframe ?? '15m';
  const chart = useResource<ChartPayload>(entry ? `/api/chart/${ticker}?tf=${timeframe}` : null, status?.lastScanAt ?? null);

  if (signals.error) return <p className="text-short">{signals.error}</p>;
  if (!signals.data) return <p className="text-ink-3">Loading {ticker}…</p>;
  if (!entry) {
    return (
      <p className="text-ink-2">
        {ticker} isn’t in the latest scan. <a href="#/" className="underline">Back to all signals</a>
      </p>
    );
  }

  const tfOptions: Timeframe[] = [...(pattern?.timeframes ?? ['15m', '30m', '1h']), '1d'];
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <a href="#/" className="text-sm text-ink-2 hover:text-ink">← All signals</a>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h1 className="ticker text-5xl">{ticker}</h1>
          <span className="text-2xl">{money(entry.price)}</span>
          <span className="text-sm text-ink-3">real-time quote</span>
        </div>

        {entry.patterns.length > 1 && (
          <div role="tablist" aria-label="Patterns" className="mt-5 flex flex-wrap gap-2">
            {entry.patterns.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={p.key === pattern?.key}
                onClick={() => setSelectedKey(p.key)}
                className={`rounded-sm border px-3 py-1.5 text-sm ${p.key === pattern?.key ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-2'}`}
              >
                {patternLabel(p.type)} {p.tradingTimeframe}
              </button>
            ))}
          </div>
        )}

        {pattern && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DirectionMark direction={pattern.direction} withText />
              <h2 className="text-xl font-semibold">{patternLabel(pattern.type)}</h2>
              <StatusTag status={pattern.status} />
              <span className="text-sm text-ink-2">{triggerText(pattern)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <PatternBadges p={pattern} tf={timeframe === '1d' ? undefined : timeframe} />
            </div>
            <div className="mt-2 max-w-3xl">
              <PathStrip direction={pattern.direction} price={entry.price} triggerLevel={pattern.triggerLevel} invalidation={pattern.invalidation} targets={pattern.targets} />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Chart time frame">
          {tfOptions.map((o) => (
            <button
              key={o}
              onClick={() => setTf(o)}
              aria-pressed={o === timeframe}
              className={`rounded-sm px-2.5 py-1 text-sm ${o === timeframe ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
            >
              {o === '1d' ? 'Daily' : o}
            </button>
          ))}
          <span className="ml-auto flex flex-wrap gap-x-3 text-xs text-ink-2">
            {(['13', '48', '55', '200'] as const).map((p) => (
              <span key={p}>
                <span aria-hidden className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: `var(--ema-${p})` }} />
                EMA {p}
              </span>
            ))}
          </span>
        </div>
        <div className="mt-2">
          {chart.data ? <PriceChart chart={chart.data} pattern={pattern} /> : <div className="grid h-[420px] place-items-center bg-surface text-ink-3">{chart.error ?? 'Loading chart…'}</div>}
        </div>
        {pattern && timeframe !== pattern.tradingTimeframe && timeframe !== '1d' && !pattern.timeframes.includes(timeframe as never) && (
          <p className="mt-1 text-xs text-ink-3">The pattern isn’t drawn on this time frame.</p>
        )}

        {pattern && (
          <div className="mt-6">
            <h3 className="text-[15px] font-semibold">Last 3 candles on {pattern.tradingTimeframe}</h3>
            <ul className="mt-1 text-sm">
              {pattern.candleLabels.map((l) => (
                <li key={l.time} className="flex gap-3 border-b border-rule/60 py-1">
                  <span className="w-36 text-ink-2">{etDateTime(l.time)}</span>
                  <span className={l.bias === 'bullish' ? 'text-long' : l.bias === 'bearish' ? 'text-short' : l.bias === 'neutral' ? 'text-ink-2' : 'text-ink-3'}>
                    {l.names.length ? l.names.map((n) => n.replaceAll('_', ' ')).join(' + ') : 'no label'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8">
          <EmaTable rows={entry.emaTable} inPath={pattern?.dailyEmasInPath ?? []} />
        </div>
      </div>

      <aside className="lg:pt-10">{pattern && <ContractCard pick={contractFor(entry, pattern)} pattern={pattern} />}</aside>
    </div>
  );
}
