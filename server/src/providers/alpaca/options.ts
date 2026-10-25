import { config } from '../../config.js';
import { addDays, etClock, etToday } from '../et.js';
import { num } from '../normalize.js';
import type { OptionContract, OptionsProvider } from '../types.js';
import type { AlpacaClient } from './client.js';

/** How far ahead getExpirations looks; the method only uses 7–30 days. */
const EXPIRATION_WINDOW_DAYS = 60;

interface AlpacaSnapshot {
  latestQuote?: { ap?: number; bp?: number; t?: string } | null;
  latestTrade?: { p?: number } | null;
  dailyBar?: { h?: number; l?: number; v?: number; t?: string } | null;
  greeks?: { delta?: number; gamma?: number; theta?: number } | null;
  impliedVolatility?: number | null;
}

interface AlpacaContract {
  symbol: string;
  expiration_date: string;
  open_interest?: string | null;
  open_interest_date?: string | null;
}

export interface ContractOpenInterest {
  symbol: string;
  expiration: string;
  openInterest: number | null;
  openInterestDate: string | null;
}

/** OCC symbol, e.g. SPY261106C00580000 → SPY, 2026-11-06, call, 580. */
export function parseOcc(
  symbol: string,
): { underlying: string; expiration: string; type: 'call' | 'put'; strike: number } | null {
  const m = /^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(symbol);
  if (!m) return null;
  const [, underlying, yy, mm, dd, cp, strike] = m as unknown as [string, string, string, string, string, string, string];
  return {
    underlying,
    expiration: `20${yy}-${mm}-${dd}`,
    type: cp === 'C' ? 'call' : 'put',
    strike: Number(strike) / 1000,
  };
}

/** Snapshots carry no open interest; it is filled in by joinOpenInterest. */
export function mapSnapshots(body: unknown): OptionContract[] {
  const snaps = (body as { snapshots?: Record<string, AlpacaSnapshot> | null }).snapshots ?? {};
  const out: OptionContract[] = [];
  for (const [symbol, s] of Object.entries(snaps)) {
    const occ = parseOcc(symbol);
    if (!occ) continue;
    const dayBarTime = s.dailyBar?.t ? Date.parse(s.dailyBar.t) / 1000 : null;
    out.push({
      symbol,
      ...occ,
      bid: num(s.latestQuote?.bp),
      ask: num(s.latestQuote?.ap),
      last: num(s.latestTrade?.p),
      dayLow: num(s.dailyBar?.l),
      dayHigh: num(s.dailyBar?.h),
      dayBarDate: dayBarTime == null ? null : etClock(dayBarTime).date,
      volume: num(s.dailyBar?.v) ?? 0,
      openInterest: 0,
      openInterestDate: null,
      delta: num(s.greeks?.delta),
      gamma: num(s.greeks?.gamma),
      theta: num(s.greeks?.theta),
      iv: num(s.impliedVolatility),
      quoteTime: s.latestQuote?.t ?? null,
    });
  }
  return out;
}

export function mapContracts(body: unknown): ContractOpenInterest[] {
  const list = (body as { option_contracts?: AlpacaContract[] | null }).option_contracts ?? [];
  return list.map((c) => {
    const oi = c.open_interest == null ? NaN : Number(c.open_interest);
    return {
      symbol: c.symbol,
      expiration: c.expiration_date,
      openInterest: Number.isFinite(oi) ? oi : null,
      openInterestDate: c.open_interest_date ?? null,
    };
  });
}

export function mapExpirations(contracts: ContractOpenInterest[]): string[] {
  return [...new Set(contracts.map((c) => c.expiration))].sort();
}

export function joinOpenInterest(chain: OptionContract[], contracts: ContractOpenInterest[]): OptionContract[] {
  const bySymbol = new Map(contracts.map((c) => [c.symbol, c]));
  return chain.map((c) => {
    const oi = bySymbol.get(c.symbol);
    return { ...c, openInterest: oi?.openInterest ?? 0, openInterestDate: oi?.openInterestDate ?? null };
  });
}

export class AlpacaOptionsProvider implements OptionsProvider {
  private readonly oiCache = new Map<string, { date: string; value: Promise<ContractOpenInterest[]> }>();

  constructor(private readonly client: AlpacaClient) {}

  async getExpirations(symbol: string): Promise<string[]> {
    const today = etToday();
    const pages = await this.client.getAllPages('paper', '/v2/options/contracts', {
      underlying_symbols: symbol,
      status: 'active',
      expiration_date_gte: today,
      expiration_date_lte: addDays(today, EXPIRATION_WINDOW_DAYS),
      limit: '10000',
    });
    return mapExpirations(pages.flatMap(mapContracts));
  }

  async getChain(symbol: string, expiration: string): Promise<OptionContract[]> {
    const [snapshotPages, openInterest] = await Promise.all([
      this.client.getAllPages('data', `/v1beta1/options/snapshots/${symbol}`, {
        feed: config.optionsFeed,
        expiration_date: expiration,
        limit: '1000',
      }),
      this.openInterest(symbol, expiration),
    ]);
    const chain = snapshotPages.flatMap(mapSnapshots).sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type));
    return joinOpenInterest(chain, openInterest);
  }

  /** One contract's current snapshot (quote, greeks, day bar) via the per-underlying path, filtered to its strike. */
  async getContract(occSymbol: string): Promise<OptionContract | null> {
    const occ = parseOcc(occSymbol);
    if (!occ) return null;
    const [pages, openInterest] = await Promise.all([
      this.client.getAllPages('data', `/v1beta1/options/snapshots/${occ.underlying}`, {
        feed: config.optionsFeed,
        expiration_date: occ.expiration,
        type: occ.type,
        strike_price_gte: String(occ.strike),
        strike_price_lte: String(occ.strike),
        limit: '1000',
      }),
      this.openInterest(occ.underlying, occ.expiration),
    ]);
    const found = pages.flatMap(mapSnapshots).filter((c) => c.symbol === occSymbol);
    return joinOpenInterest(found, openInterest)[0] ?? null;
  }

  /** Open interest is published once a day, so it is fetched once per underlying + expiration per ET date. */
  private openInterest(symbol: string, expiration: string): Promise<ContractOpenInterest[]> {
    const key = `${symbol}|${expiration}`;
    const today = etToday();
    const cached = this.oiCache.get(key);
    if (cached?.date === today) return cached.value;
    const value = this.client
      .getAllPages('paper', '/v2/options/contracts', {
        underlying_symbols: symbol,
        status: 'active',
        expiration_date: expiration,
        limit: '10000',
      })
      .then((pages) => pages.flatMap(mapContracts));
    this.oiCache.set(key, { date: today, value });
    value.catch(() => this.oiCache.get(key)?.value === value && this.oiCache.delete(key));
    return value;
  }
}
