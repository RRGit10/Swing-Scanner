/**
 * One live call per data endpoint, with field checks. Usage: npm run smoke [-- SYMBOL]
 * Prints counts and samples only — never keys or request headers.
 */
import { config, requireEnv } from '../src/config.js';
import { aggregate15m } from '../src/providers/aggregate.js';
import { joinOpenInterest, mapContracts, mapSnapshots } from '../src/providers/alpaca/options.js';
import { addDays, etClock, etStamp, etToday } from '../src/providers/et.js';
import { createAlpacaClient, createProviders } from '../src/providers/index.js';
import type { Candle, OptionContract } from '../src/providers/types.js';

interface Result {
  summary: string[];
  warnings: string[];
}

const symbol = (process.argv[2] ?? 'SPY').toUpperCase();
const today = etToday();

function span(candles: Candle[]): string {
  if (!candles.length) return 'none';
  const fmt = (c: Candle) => etStamp(new Date(c.time * 1000));
  return `${fmt(candles[0]!)} → ${fmt(candles.at(-1)!)} ET`;
}

function nullCount(contracts: OptionContract[], key: keyof OptionContract): number {
  return contracts.filter((c) => c[key] == null).length;
}

async function main() {
  requireEnv('ALPACA_API_KEY_ID');
  requireEnv('ALPACA_SECRET_KEY');
  requireEnv('FINNHUB_API_KEY');
  const p = createProviders();
  const alpaca = createAlpacaClient();
  let price: number | null = null;
  let bars15: Candle[] = [];
  let expiration: string | null = null;

  const checks: [string, () => Promise<Result>][] = [
    ['Finnhub quote', async () => {
      const q = await p.quotes.getQuote(symbol);
      price = q.price;
      return {
        summary: [`${symbol} ${q.price} (H ${q.high} L ${q.low} prev ${q.prevClose}), last trade ${etStamp(new Date(q.time * 1000))} ET`],
        warnings: [],
      };
    }],

    ['Finnhub earnings calendar', async () => {
      const to = addDays(today, 30);
      const mine = await p.earnings.getEarnings(symbol, today, to);
      const all = await p.earnings.getEarnings('', today, to);
      return {
        summary: [
          `${symbol}: ${mine.length ? mine.map((e) => `${e.date} ${e.hour}`).join(', ') : 'no earnings in next 30 days'}`,
          `market-wide: ${all.length} events ${today} → ${to}`,
        ],
        warnings: all.length ? [] : ['Market-wide calendar returned 0 events for the next 30 days'],
      };
    }],

    [`Alpaca stock bars 15Min (${config.stockFeed})`, async () => {
      bars15 = await p.candles.getCandles(symbol, '15m');
      const h30 = aggregate15m(bars15, '30m');
      const h1 = aggregate15m(bars15, '1h');
      const warnings: string[] = [];
      if (!bars15.length) warnings.push('No 15m bars returned');
      if (h1.length < 600) warnings.push(`Only ${h1.length} 1h bars — a 200 EMA needs ~600 (3× period) to settle`);
      return {
        summary: [`15m (regular hours): ${bars15.length} bars, ${span(bars15)}`, `→ 30m: ${h30.length} bars, 1h: ${h1.length} bars`],
        warnings,
      };
    }],

    [`Alpaca stock bars 1Day (${config.stockFeed})`, async () => {
      const days = await p.candles.getCandles(symbol, '1d');
      const warnings = days.length < 600 ? [`Only ${days.length} daily bars — a 200 EMA needs ~600 (3× period) to settle`] : [];
      const last = days.at(-1);
      const summary = [`${days.length} daily bars, last ${last ? new Date(last.time * 1000).toISOString().slice(0, 10) : 'none'}`];

      // Is the daily bar the regular session (9:30–16:00) or does it include extended hours?
      if (last) {
        const date = new Date(last.time * 1000).toISOString().slice(0, 10);
        const session = bars15.filter((b) => etClock(b.time).date === date);
        if (session.length) {
          const pct = (a: number, b: number) => (((a - b) / b) * 100).toFixed(3);
          summary.push(
            `${date} daily O ${last.open} C ${last.close} vs regular-hours 15m O ${session[0]!.open} C ${session.at(-1)!.close} ` +
              `(diff O ${pct(last.open, session[0]!.open)}%, C ${pct(last.close, session.at(-1)!.close)}%)`,
          );
        }
      }
      return { summary, warnings };
    }],

    ['Alpaca option contracts (paper, expirations + OI)', async () => {
      const dates = await p.options.getExpirations(symbol);
      const min = addDays(today, 7);
      const max = addDays(today, 30);
      expiration = dates.find((d) => d >= min && d <= max && new Date(`${d}T00:00:00Z`).getUTCDay() === 5) ?? null;
      return {
        summary: [`${dates.length} expirations in next 60d: ${dates.slice(0, 8).join(', ')}${dates.length > 8 ? ' …' : ''}`, `nearest Friday ≥7d: ${expiration ?? 'none'}`],
        warnings: expiration ? [] : ['No Friday expiration 7–30 days out'],
      };
    }],

    [`Alpaca option snapshots (${config.optionsFeed})`, async () => {
      if (!expiration) return { summary: ['skipped: no expiration'], warnings: ['Snapshots not checked'] };
      // Raw calls so we can confirm the fields we rely on actually exist in the responses.
      const [snapPages, contractPages] = await Promise.all([
        alpaca.getAllPages('data', `/v1beta1/options/snapshots/${symbol}`, { feed: config.optionsFeed, expiration_date: expiration, limit: '1000' }),
        alpaca.getAllPages('paper', '/v2/options/contracts', { underlying_symbols: symbol, status: 'active', expiration_date: expiration, limit: '10000' }),
      ]);
      const warnings: string[] = [];
      const rawSnaps = snapPages.flatMap((pg) => Object.values((pg as { snapshots?: Record<string, Record<string, unknown>> }).snapshots ?? {}));
      if (!rawSnaps.length) return { summary: ['0 snapshots'], warnings: ['Snapshots returned no contracts'] };
      const keyCounts = ['latestQuote', 'latestTrade', 'dailyBar', 'greeks', 'impliedVolatility'].map((k) => {
        const n = rawSnaps.filter((s) => s[k] != null).length;
        if (n === 0) warnings.push(`Field "${k}" missing on every snapshot`);
        return `${k} ${n}`;
      });

      const rawContracts = contractPages.flatMap((pg) => (pg as { option_contracts?: Record<string, unknown>[] }).option_contracts ?? []);
      if (rawContracts.length && !rawContracts.some((c) => 'open_interest' in c)) warnings.push('Field "open_interest" missing from contracts');

      const chain = joinOpenInterest(snapPages.flatMap(mapSnapshots), contractPages.flatMap(mapContracts));
      const n = chain.length;
      for (const key of ['ask', 'delta', 'gamma', 'dayLow', 'dayHigh'] as const) {
        if (nullCount(chain, key) === n) warnings.push(`"${key}" is null on all ${n} contracts`);
      }
      const withOi = chain.filter((c) => c.openInterest > 0).length;
      if (withOi === 0) warnings.push('Open interest is 0/missing on every contract');
      const dayDates = [...new Set(chain.map((c) => c.dayBarDate).filter(Boolean))].sort();

      const calls = chain.filter((c) => c.type === 'call');
      const ref = price ?? calls[Math.floor(calls.length / 2)]?.strike ?? 0;
      const atm = calls.reduce<OptionContract | undefined>(
        (best, c) => (!best || Math.abs(c.strike - ref) < Math.abs(best.strike - ref) ? c : best),
        undefined,
      );
      return {
        summary: [
          `${n} contracts for ${expiration} (${rawContracts.length} from contracts API, ${withOi} with OI > 0)`,
          `fields present: ${keyCounts.join(', ')}`,
          `nulls — ask ${nullCount(chain, 'ask')}, delta ${nullCount(chain, 'delta')}, gamma ${nullCount(chain, 'gamma')}, iv ${nullCount(chain, 'iv')}, dayLow ${nullCount(chain, 'dayLow')}`,
          `dailyBar dates: ${dayDates.join(', ') || 'none'}`,
          atm
            ? `ATM call ${atm.symbol}: bid ${atm.bid} ask ${atm.ask} day ${atm.dayLow}–${atm.dayHigh} (${atm.dayBarDate}) Δ ${atm.delta} Γ ${atm.gamma} IV ${atm.iv} OI ${atm.openInterest} (${atm.openInterestDate}) quote@ ${atm.quoteTime}`
            : 'no calls in chain',
        ],
        warnings,
      };
    }],
  ];

  console.log(`Smoke test — ${symbol}, ${today} ET, stock feed ${config.stockFeed}, options feed ${config.optionsFeed}\n`);
  let failed = 0;
  let warned = 0;
  for (const [name, run] of checks) {
    try {
      const { summary, warnings } = await run();
      console.log(`${warnings.length ? 'WARN' : 'PASS'}  ${name}`);
      for (const line of summary) console.log(`      ${line}`);
      for (const w of warnings) console.log(`      ⚠ ${w}`);
      if (warnings.length) warned++;
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}\n      ${(err as Error).message}`);
    }
  }
  console.log(`\n${checks.length - failed - warned} pass, ${warned} warn, ${failed} fail`);
  process.exitCode = failed || warned ? 1 : 0;
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
