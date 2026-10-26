import type { ContractPick, PatternEntry } from '../api/types';
import { OPTION_PRICE_LABEL } from '../labels';
import { contractName, fixed, money, shortDate, signedPct } from '../lib/format';
import { LiquidityLine } from './LiquidityLine';
import { Badge } from './Marks';
import { NoContract } from './PatternBits';
import { RangeStrip } from './RangeStrip';

/** Contract details and the full exit plan for one pattern. */
export function ContractCard({ pick, pattern }: { pick: ContractPick | null; pattern: PatternEntry }) {
  if (!pick || !('symbol' in pattern.contract)) {
    return (
      <section className="border-l-2 border-rule pl-4">
        <h2 className="mb-2 text-[15px] font-semibold">Contract</h2>
        <NoContract p={pattern} />
      </section>
    );
  }
  const c = pick.contract;
  const plan = pattern.contract.exitPlan;
  const call = c.type === 'call';
  return (
    <section className="border-l-2 border-ink pl-4" aria-label="Contract and exit plan">
      <h2 className="ticker text-2xl">{contractName(c.symbol)}</h2>
      <p className="mt-1 text-sm text-ink-2">
        Long {call ? 'call' : 'put'}, expires {shortDate(pick.expiration)} ({pick.dte} days)
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-2">Grade</dt>
        <dd className="font-semibold">{pick.grade} (Δ {fixed(c.delta, 3)})</dd>
        <dt className="text-ink-2">Bid / ask</dt>
        <dd>
          {money(c.bid)} / <span className="text-base font-semibold">{money(c.ask)}</span>
          <span className="block text-xs text-ink-3">{OPTION_PRICE_LABEL}</span>
        </dd>
        <dt className="text-ink-2">Greeks</dt>
        <dd>Γ {fixed(c.gamma, 4)}, Θ {fixed(c.theta, 3)}/day, IV {c.iv != null ? `${(c.iv * 100).toFixed(1)}%` : '—'}</dd>
        <dt className="text-ink-2">Liquidity</dt>
        <dd>
          <LiquidityLine pick={pick} labeled />
        </dd>
      </dl>

      <h3 className="mt-5 text-[15px] font-semibold">Entry</h3>
      <RangeStrip pick={pick} />
      {pick.earningsDate && (
        <div className="mt-2">
          <Badge tone="warn">Earnings {shortDate(pick.earningsDate)}, before expiration</Badge>
        </div>
      )}

      <h3 className="mt-5 text-[15px] font-semibold">Exit plan</h3>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-2">
            <th className="py-1 font-normal">Stock target</th>
            <th className="py-1 text-right font-normal">Contract estimate</th>
            <th className="py-1 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody>
          {plan.targets.map((t, i) => (
            <tr key={i} className="border-b border-rule/60">
              <td className="py-1.5">
                T{i + 1} {money(t.stockPrice)} <span className="text-ink-3">{t.label}</span>
              </td>
              <td className="py-1.5 text-right">{money(t.estimate)} <span className="text-xs text-ink-3">estimate</span></td>
              <td className="py-1.5 text-right font-semibold">{signedPct(t.estimateChangePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-ink-3">Estimate = delta + gamma, minus 1 day of theta. Sell at the target; this is not a quote.</p>

      <p className="mt-3 text-sm">Profit markers</p>
      <ul className="flex flex-wrap gap-x-4 text-sm">
        {plan.markers.map((m) => (
          <li key={m.pct} className="whitespace-nowrap">
            +{m.pct}% at <span className="font-semibold">{money(m.price)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-ink-2">Break-even at expiration {money(plan.breakEven)} (info only)</p>
      {pick.skippedExpirations.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Earlier expirations skipped: {pick.skippedExpirations.map((s) => `${shortDate(s.expiration)} (${s.reason})`).join('; ')}.
        </p>
      )}
    </section>
  );
}
