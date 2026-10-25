import type { ContractPick, IntradayTf, PatternEntry, TickerEntry } from '../api/types';
import { contractName, etDateTime, money, patternLabel, shortDate, signedPct } from '../lib/format';
import { summarizeSkipped } from '../lib/skipped';
import { Badge } from './Marks';

export const tfList = (p: PatternEntry) => {
  const [main, ...rest] = p.timeframes;
  return rest.length ? `${main} (also ${rest.join(', ')})` : main;
};

export function triggerText(p: PatternEntry): string {
  if (p.state === 'triggered') return `Triggered ${etDateTime(p.triggerTime)}`;
  if (p.type === 'inverse_head_and_shoulders') return 'Armed: waiting for a bullish candle off the right shoulder';
  if (p.type === 'cup_and_handle') return 'Armed: waiting for a boom boom off the handle or neckline';
  return `Armed: waiting for a close ${p.direction === 'bullish' ? 'above' : 'below'} ${money(p.triggerLevel)}`;
}

/** Lower quality, 55 EMA reversal, daily EMA in path. */
export function PatternBadges({ p, tf = p.tradingTimeframe }: { p: PatternEntry; tf?: IntradayTf }) {
  return (
    <>
      {p.lowerQuality && (
        <Badge tone="muted" title="The trigger candle closed outside 9:30–11:30 and 3:00–4:00 ET">
          Lower quality
        </Badge>
      )}
      {p.ema55Reversal && tf === p.tradingTimeframe && <Badge title="Price pulled back to the 55 EMA and the next candle closed back in the trend direction">55 EMA reversal</Badge>}
      {(p.dailyEmasInPath ?? []).map((e) => (
        <Badge key={e.period} tone="warn" title="A daily EMA sits between price and the target and may act as resistance/support">
          Daily {e.period} EMA in path at {money(e.value)}
        </Badge>
      ))}
    </>
  );
}

export function contractFor(entry: TickerEntry, p: PatternEntry): ContractPick | null {
  if (!('symbol' in p.contract)) return null;
  const symbol = p.contract.symbol;
  return entry.contracts.find((c) => c.contract.symbol === symbol) ?? null;
}

/** "No contract fits": the expirations tried, the most common reasons, and every reason in a dropdown. */
export function NoContract({ p }: { p: PatternEntry }) {
  if ('symbol' in p.contract) return null;
  const skipped = p.contract.skippedExpirations;
  if (!skipped.length) return <p className="text-sm text-ink-2"><span className="font-semibold text-ink">No contract fits:</span> {p.contract.none}.</p>;
  const { reasons } = summarizeSkipped(skipped);
  const top = reasons.slice(0, 3).map((r) => (r.count == null ? r.reason : `${r.count} ${r.reason}`));
  return (
    <div className="text-sm leading-relaxed text-ink-2">
      <p>
        <span className="font-semibold text-ink">No contract fits</span> on {skipped.map((s) => shortDate(s.expiration).replace(/^\w+ /, '')).join(', ')}.
      </p>
      <p className="mt-2">Most common: {top.join(', ')}.</p>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-card-border bg-surface px-3 py-1.5 text-ink hover:border-ink-3 [&::-webkit-details-marker]:hidden">
          Every reason
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-180">
            <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <ul className="mt-2 space-y-1 text-ink-3">
          {skipped.map((s) => (
            <li key={s.expiration}>
              <span className="text-ink-2">{shortDate(s.expiration)}:</span> {s.reason.replace(/^no contract passed \(|\)$/g, '')}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function estAtT1(p: PatternEntry): number | null {
  return 'symbol' in p.contract ? (p.contract.exitPlan.targets[0]?.estimateChangePct ?? null) : null;
}

export { contractName, patternLabel, signedPct };
