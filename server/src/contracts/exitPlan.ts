import type { Target } from '../analysis/targets.js';
import type { OptionContract } from '../providers/types.js';
import type { ContractSettings, EntryStatus, ExitPlan } from './types.js';

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Entry zone = day low → day low + entryZoneFraction × day range (rounded to cents).
 * Only a day bar from the current session counts; otherwise "NO CURRENT RANGE".
 */
export function entryStatus(c: OptionContract, sessionDate: string, s: ContractSettings): EntryStatus {
  if (c.dayLow == null || c.dayHigh == null || c.dayBarDate == null) return { zone: null, status: 'NO CURRENT RANGE' };
  const zone = { low: c.dayLow, high: cents(c.dayLow + s.entryZoneFraction * (c.dayHigh - c.dayLow)) };
  if (c.dayBarDate !== sessionDate) return { zone, status: 'NO CURRENT RANGE' };
  return { zone, status: c.ask != null && c.ask <= zone.high ? 'AT ENTRY' : 'ABOVE ENTRY ZONE' };
}

/**
 * Estimated contract value with the stock at `targetPrice`: ask + Δ·ΔS + ½Γ·ΔS² + thetaDays × θ,
 * floored at intrinsic value. quotePrice = underlying price at the option quote's time, so ΔS matches
 * the delayed ask and greeks. Requires ask, delta, gamma and theta.
 */
export function estimateAt(c: OptionContract, targetPrice: number, quotePrice: number, s: ContractSettings): number {
  const move = targetPrice - quotePrice;
  const intrinsic = Math.max(0, c.type === 'call' ? targetPrice - c.strike : c.strike - targetPrice);
  return Math.max(intrinsic, c.ask! + c.delta! * move + 0.5 * c.gamma! * move * move + s.thetaDays * c.theta!);
}

/** Break-even at expiration (info only), profit markers, and the estimate at each stock target. */
export function buildExitPlan(c: OptionContract, targets: Target[], quotePrice: number, s: ContractSettings): ExitPlan {
  const ask = c.ask!;
  return {
    breakEven: c.type === 'call' ? c.strike + ask : c.strike - ask,
    markers: s.profitMarkers.map((m) => ({ pct: Math.round(m * 100), price: ask * (1 + m) })),
    targets: targets.map((t) => {
      const estimate = estimateAt(c, t.price, quotePrice, s);
      return { label: t.label, stockPrice: t.price, estimate, estimateChangePct: (estimate / ask - 1) * 100 };
    }),
  };
}
