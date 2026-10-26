import type { ContractPick } from '../api/types';
import { liquidityText } from '../lib/liquidity';
import { shortDate } from '../lib/format';
import { Badge } from './Marks';

/** Open interest with its date, or — when OI is stale — the liquidity figure the checks used, with a stale flag. */
/** `labeled`: the surrounding layout already says "Liquidity", so the text drops that word. */
export function LiquidityLine({ pick, className = '', labeled = false }: { pick: ContractPick; className?: string; labeled?: boolean }) {
  const c = pick.contract;
  if (!pick.liquidity) {
    // scans saved before liquidity was recorded
    return <span className={className}>OI {c.openInterest.toLocaleString('en-US')} ({shortDate(c.openInterestDate)})</span>;
  }
  const { text, stale } = liquidityText(pick.liquidity);
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`} data-testid="liquidity">
      <span>{labeled ? text.replace(/^Liquidity: /, '') : text}</span>
      {stale && (
        <Badge tone="warn" title="Alpaca's open interest is older than the previous session. Liquidity uses the larger of OI and the previous session's volume. Check OI in your broker.">
          {stale}
        </Badge>
      )}
    </span>
  );
}
