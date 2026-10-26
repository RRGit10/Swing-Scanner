import { entryStatus } from '../contracts/exitPlan.js';
import type { TradingDay } from '../market/clock.js';
import type { OptionsProvider } from '../providers/types.js';
import type { CandleCache } from '../scanner/cache.js';
import type { TickerEntry } from '../scanner/group.js';
import { timeframeCandles } from '../scanner/scan.js';
import type { AppSettings } from '../scanner/settings.js';
import type { ScannerDb } from '../storage/db.js';
import { evaluateOutcome, exitQuote, expirationCloseUnix, gainPct } from './outcome.js';
import { noteEntryAsk, type SignalEvent, type SignalRow } from './signals.js';

export interface TrackerDeps {
  db: ScannerDb;
  candles: CandleCache;
  options: OptionsProvider;
  settings: AppSettings;
  calendar: () => TradingDay[];
}

const TF_MINUTES = { '15m': 15, '30m': 30, '1h': 60 } as const;

/**
 * Resolve open triggered trades from 1-min bars since the last tracked time (in time order), then collect
 * exit quotes. A gap longer than normal (server stopped / Mac slept) is logged as a backfill.
 */
export async function trackOutcomes(deps: TrackerDeps, now: number): Promise<{ errors: string[] }> {
  const s = deps.settings.scanner;
  const errors: string[] = [];

  for (const original of deps.db.pendingOutcomes()) {
    try {
      let row: SignalRow = original;
      const events: SignalEvent[] = [];

      if (row.outcome === 'pending' && !row.preChecked) {
        // Triggered before we first saw it: did T1 or invalidation already happen before we could act?
        const seen = row.trackedFrom!;
        if (now < seen + s.dataSettleMin * 60) continue; // delayed data doesn't cover the first-seen moment yet
        const start = row.triggerTime ?? seen;
        const minutes = await deps.candles.provider.getMinuteBars(row.ticker, new Date(start * 1000), new Date(seen * 1000));
        const trading = timeframeCandles(await deps.candles.get15m(row.ticker))[row.tradingTimeframe];
        const before = evaluateOutcome(
          { direction: row.direction, t1: row.frozenT1!, invalidation: row.invalidation, fromTime: start, expirationClose: seen, tradingTfMinutes: TF_MINUTES[row.tradingTimeframe] },
          minutes,
          trading,
          0, // never "expired": this window only looks for a T1 touch or an invalidation close
        );
        if (before) {
          row = { ...row, preChecked: true, outcome: 'already_resolved', outcomeAt: before.at, exitNote: 'already resolved when first seen', gainPct: null };
          deps.db.upsertSignal(row);
          deps.db.addEvents(row.id!, [{ kind: 'outcome', at: now, from: 'pending', to: 'already_resolved', detail: { at: before.at, by: before.kind === 'win' ? 'T1 touched' : 'invalidation close', firstSeenAt: row.firstSeenAt } }]);
          continue;
        }
        row = { ...row, preChecked: true };
      }

      if (row.outcome === 'pending') {
        // Never earlier than first seen, so a backfill only covers time after we saw the signal live.
        const from = Math.max(row.lastTrackedAt ?? row.frozenAt!, row.trackedFrom ?? 0);
        const minutes = await deps.candles.provider.getMinuteBars(row.ticker, new Date(from * 1000), new Date(now * 1000));
        const trading = timeframeCandles(await deps.candles.get15m(row.ticker))[row.tradingTimeframe];
        const close = deps.calendar().find((d) => d.date === row.expiration)?.close ?? '16:00';
        const result = evaluateOutcome(
          {
            direction: row.direction,
            t1: row.frozenT1!,
            invalidation: row.invalidation,
            fromTime: from,
            expirationClose: expirationCloseUnix(row.expiration!, close),
            tradingTfMinutes: TF_MINUTES[row.tradingTimeframe],
          },
          minutes,
          trading,
          now,
          s.dataSettleMin * 60,
        );

        // Normal runs lag the data cursor by about the SIP delay plus one scan interval.
        if (now - from > (s.dataSettleMin + s.backfillGapMin) * 60) {
          events.push({
            kind: 'backfill',
            at: now,
            from: String(from),
            to: String(now),
            detail: { minuteBars: minutes.length, result: result?.kind ?? 'still open' },
          });
        }
        if (result) {
          row = { ...row, outcome: result.kind, outcomeAt: result.at, lastTrackedAt: result.at };
          events.push({ kind: 'outcome', at: now, from: 'pending', to: result.kind, detail: { at: result.at, t1: row.frozenT1 } });
        } else {
          const newest = minutes.at(-1);
          row = { ...row, lastTrackedAt: newest ? Math.max(from, newest.time + 60) : from };
        }
      }

      if ((row.outcome === 'win' || row.outcome === 'loss') && row.frozenContract && row.exitBid == null && row.exitNote == null) {
        const snap = await deps.options.getContract(row.frozenContract);
        const q = exitQuote(snap, row.outcomeAt!, now, s);
        if (q.kind === 'ok') {
          row = {
            ...row,
            exitBid: q.bid,
            exitAsk: q.ask,
            exitQuoteTime: q.quoteTime,
            gainPct: row.entryAsk ? gainPct(q.bid, row.entryAsk) : null,
          };
          events.push({ kind: 'exit_quote', at: now, from: null, to: 'ok', detail: { bid: q.bid, ask: q.ask, quoteTime: q.quoteTime } });
        } else if (q.kind === 'missed') {
          row = { ...row, exitNote: 'exit quote missed', gainPct: null };
          events.push({ kind: 'exit_quote', at: now, from: null, to: 'missed', detail: null });
        }
      }

      deps.db.upsertSignal(row);
      if (events.length) deps.db.addEvents(row.id!, events);
    } catch (err) {
      errors.push(`${original.key}: ${(err as Error).message}`);
    }
  }
  return { errors };
}

/** After each scan: lowest ask seen in the entry zone since the trigger, for each tracked trade's frozen contract. */
export async function noteEntryAsks(deps: TrackerDeps, entries: TickerEntry[], sessionDate: string): Promise<void> {
  for (const row of deps.db.pendingOutcomes()) {
    if (row.outcome !== 'pending' || !row.frozenContract) continue;
    const pick = entries.find((e) => e.ticker === row.ticker)?.contracts.find((c) => c.contract.symbol === row.frozenContract);
    const contract = pick?.contract ?? (await deps.options.getContract(row.frozenContract));
    if (!contract) continue;
    const updated = noteEntryAsk(row, contract.ask, entryStatus(contract, sessionDate, deps.settings.contracts).status);
    if (updated !== row) deps.db.upsertSignal(updated);
  }
}
