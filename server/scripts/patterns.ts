/**
 * Runs the pattern detectors on live data and prints every signal, merged across time frames,
 * with the contract the selection engine picks for it.
 * Usage: npm run patterns [-- TICKER ...]   (default: the watchlist)
 */
import { DEFAULT_CANDLE_SETTINGS, classifyLastThree } from '../src/analysis/candles.js';
import { emaTable } from '../src/analysis/emaLevels.js';
import { mergeTimeframes, type TimeframeMatch } from '../src/analysis/merge.js';
import { detectPatterns } from '../src/analysis/patterns/index.js';
import { patternTargets } from '../src/analysis/targets.js';
import { selectContract } from '../src/contracts/select.js';
import { DEFAULT_CONTRACT_SETTINGS, type ContractResult } from '../src/contracts/types.js';
import { aggregate15m } from '../src/providers/aggregate.js';
import { addDays, etClock, etToday } from '../src/providers/et.js';
import { createProviders } from '../src/providers/index.js';
import type { Candle, IntradayTimeframe, OptionContract } from '../src/providers/types.js';
import { DEFAULT_WATCHLIST } from '../src/watchlist.js';

const OPTION_PRICE_LABEL = 'indicative (modeled), 15-min delayed';

const tickers = process.argv.slice(2).map((t) => t.toUpperCase());
const watchlist = tickers.length ? tickers : DEFAULT_WATCHLIST;

const when = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const t = (unix: number) => when.format(new Date(unix * 1000)).replace(',', '');
const f = (n: number) => n.toFixed(2);
const monthDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** e.g. "SPY 755P Nov 6" */
const contractName = (c: OptionContract) => `${c.underlying} ${c.strike}${c.type === 'call' ? 'C' : 'P'} ${monthDay(c.expiration)}`;

function printContract(r: ContractResult) {
  for (const sk of r.skippedExpirations) console.log(`  skipped ${sk.expiration}: ${sk.reason}`);
  if (r.kind === 'none') {
    console.log(`  CONTRACT: ${r.reason}`);
    return;
  }
  const c = r.contract;
  const e = r.entry;
  console.log(
    `  CONTRACT: ${contractName(c)} (exp ${r.expiration}, ${r.dte}d) | Δ ${c.delta!.toFixed(3)} grade ${r.grade} | ask ${f(c.ask!)} [${OPTION_PRICE_LABEL}] | OI ${c.openInterest}` +
      (r.earningsDate ? ` | ⚠ EARNINGS ${r.earningsDate} before expiration` : ''),
  );
  console.log(
    `  entry zone ${e.zone ? `${f(e.zone.low)}–${f(e.zone.high)}` : '—'} (day ${c.dayLow ?? '—'}–${c.dayHigh ?? '—'} on ${c.dayBarDate ?? '—'}) → ${e.status}`,
  );
  const x = r.exitPlan;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
  console.log(
    `  exit plan: est. gain at T1 ${pct(x.targets[0]!.estimateChangePct)} | markers ${x.markers.map((m) => `+${m.pct}% ${f(m.price)}`).join(' · ')} | ` +
      x.targets.map((tg, i) => `T${i + 1} ${tg.label} ${f(tg.stockPrice)}: estimate ${f(tg.estimate)} (${pct(tg.estimateChangePct)})`).join(' · ') +
      ` | break-even at expiration ${f(x.breakEven)} (info)`,
  );
  console.log(`  greeks: Δ ${c.delta!.toFixed(3)} Γ ${c.gamma!.toFixed(4)} Θ/day ${c.theta!.toFixed(3)} IV ${(c.iv! * 100).toFixed(1)}%`);
}

async function main() {
  const p = createProviders();
  const today = etToday();
  const quiet: string[] = [];
  let total = 0;

  for (const symbol of watchlist) {
    const bars15 = await p.candles.getCandles(symbol, '15m');
    const daily = await p.candles.getCandles(symbol, '1d');
    const byTf: Record<IntradayTimeframe, Candle[]> = {
      '15m': bars15,
      '30m': aggregate15m(bars15, '30m'),
      '1h': aggregate15m(bars15, '1h'),
    };
    const found: TimeframeMatch[] = (Object.keys(byTf) as IntradayTimeframe[]).flatMap((timeframe) =>
      detectPatterns(byTf[timeframe]).map((match) => ({ timeframe, match })),
    );
    const merged = mergeTimeframes(found);
    if (!merged.length) {
      quiet.push(symbol);
      continue;
    }

    // Real-time price for targets/display; delayed 15m close (aligned with the delayed option quote) for estimates.
    const quote = await p.quotes.getQuote(symbol);
    const delayedPrice = bars15.at(-1)!.close;
    const sessionDate = etClock(bars15.at(-1)!.time).date;
    const table = emaTable({ ...byTf, '1d': daily });
    const [expirations, earnings] = await Promise.all([
      p.options.getExpirations(symbol),
      p.earnings.getEarnings(symbol, today, addDays(today, DEFAULT_CONTRACT_SETTINGS.maxDte)),
    ]);
    const chainCache = new Map<string, Promise<OptionContract[]>>();
    const getChain = (exp: string) => {
      if (!chainCache.has(exp)) chainCache.set(exp, p.options.getChain(symbol, exp));
      return chainCache.get(exp)!;
    };

    for (const sig of merged) {
      total++;
      const m = sig.match;
      const candles = byTf[sig.tradingTimeframe];
      const others = sig.timeframes.length > 1 ? ` (also on ${sig.timeframes.slice(1).join(', ')})` : '';
      console.log(`\n${symbol}  ${m.type}  ${m.direction}  ${m.state.toUpperCase()}  — trading chart ${sig.tradingTimeframe}${others}`);
      console.log(`  key points: ${m.points.map((pt) => `${pt.label} ${f(pt.price)} ${t(pt.time)}`).join(' · ')}`);
      for (const l of m.lines.filter((l) => l.label === 'neckline' || l.label === 'pole')) {
        console.log(`  ${l.label}: ${f(l.from.price)} ${t(l.from.time)} → ${f(l.to.price)} ${t(l.to.time)}`);
      }
      const side = m.direction === 'bullish' ? '>' : '<';
      const trig = m.triggerIndex == null ? 'not yet' : `${t(m.triggerTime!)} close ${f(candles[m.triggerIndex]!.close)}`;
      console.log(`  trigger level ${f(m.triggerLevel)} (close ${side}) — trigger candle: ${trig}`);
      const targets = patternTargets(m, table, quote.price);
      console.log(
        `  targets: ${targets.map((x, i) => `T${i + 1} ${f(x.price)} (${x.label})`).join(' · ')}  | invalidation ${f(m.invalidation)}  | price ${f(quote.price)} (Finnhub real-time), delayed 15m close ${f(delayedPrice)}`,
      );

      const newest = classifyLastThree(candles, DEFAULT_CANDLE_SETTINGS).labels.at(-1);
      const result = await selectContract(
        {
          direction: m.direction,
          expirations,
          today,
          sessionDate,
          targets,
          triggered: m.state === 'triggered',
          newestCandleNames: newest?.names ?? [],
          quotePrice: delayedPrice,
          earnings,
          settings: DEFAULT_CONTRACT_SETTINGS,
        },
        getChain,
      );
      printContract(result);
    }
  }

  console.log(`\n${total} signal(s). No pattern: ${quiet.join(', ') || 'none'}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
