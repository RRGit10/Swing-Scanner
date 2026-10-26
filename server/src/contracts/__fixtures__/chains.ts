import type { OptionContract } from '../../providers/types.js';

export const TODAY = '2026-10-23'; // Friday
export const SESSION = '2026-10-23';

/** One contract with sensible defaults: liquid, current-session day range, greeks present. */
export function opt(p: Partial<OptionContract> & Pick<OptionContract, 'type' | 'strike'>): OptionContract {
  const expiration = p.expiration ?? '2026-10-30';
  const yymmdd = expiration.slice(2).replaceAll('-', '');
  const occ = `SPY${yymmdd}${p.type === 'call' ? 'C' : 'P'}${String(Math.round(p.strike * 1000)).padStart(8, '0')}`;
  return {
    symbol: occ,
    underlying: 'SPY',
    expiration,
    bid: (p.ask ?? 2) - 0.05,
    ask: 2,
    last: 2,
    dayLow: 1.8,
    dayHigh: 2.6,
    dayBarDate: SESSION,
    volume: 1000,
    openInterest: 5000,
    openInterestDate: '2026-10-22',
    delta: p.type === 'call' ? 0.5 : -0.5,
    gamma: 0.05,
    theta: -0.05,
    iv: 0.2,
    prevDayVolume: null,
    prevDayBarDate: null,
    quoteTime: '2026-10-23T19:59:00Z',
    ...p,
  };
}
