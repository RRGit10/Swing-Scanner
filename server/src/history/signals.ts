import type { PatternType } from '../analysis/patterns/types.js';
import type { Target } from '../analysis/targets.js';
import type { Direction } from '../analysis/types.js';
import type { EntryStatusName } from '../contracts/types.js';
import type { IntradayTimeframe } from '../providers/types.js';
import type { SignalStatus } from '../scanner/status.js';

/**
 * open = seen, not triggered · pending = triggered, being tracked · win / loss / expired = resolved ·
 * never_triggered = disappeared before triggering · no_contract = triggered with no Friday 3–30 days out to track against
 */
export type Outcome = 'open' | 'pending' | 'win' | 'loss' | 'expired' | 'never_triggered' | 'no_contract';

/** What one scan says about a signal. */
export interface SignalSnapshot {
  key: string;
  ticker: string;
  type: PatternType;
  direction: Direction;
  timeframes: IntradayTimeframe[];
  tradingTimeframe: IntradayTimeframe;
  state: 'armed' | 'triggered';
  status: SignalStatus;
  lowerQuality: boolean;
  /** trigger candle close (unix) */
  triggerTime: number | null;
  triggerLevel: number;
  invalidation: number;
  targets: Target[];
  contract: { symbol: string; ask: number | null; expiration: string } | null;
  /** nearest Friday the method would use; the stock-outcome deadline when there is no contract */
  horizonExpiration: string | null;
}

export interface SignalRow {
  id?: number;
  key: string;
  ticker: string;
  type: PatternType;
  direction: Direction;
  timeframes: IntradayTimeframe[];
  tradingTimeframe: IntradayTimeframe;
  firstSeenAt: number;
  lastSeenAt: number;
  status: SignalStatus;
  lowerQuality: boolean;
  triggerTime: number | null;
  triggerLevel: number;
  invalidation: number;
  targets: Target[];
  /** current pick (may change before the trigger) */
  contractSymbol: string | null;
  // frozen at trigger
  frozenAt: number | null;
  frozenT1: number | null;
  frozenContract: string | null;
  entryAsk: number | null;
  expiration: string | null;
  lowestEntryAsk: number | null;
  /** outcome evaluated through this time */
  lastTrackedAt: number | null;
  outcome: Outcome;
  outcomeAt: number | null;
  exitBid: number | null;
  exitAsk: number | null;
  exitQuoteTime: string | null;
  /** e.g. "exit quote missed" */
  exitNote: string | null;
  /** (exit bid − entry ask) / entry ask × 100, indicative; null if not measured */
  gainPct: number | null;
  endedAt: number | null;
  endedReason: string | null;
}

export interface SignalEvent {
  kind: 'first_seen' | 'status' | 'contract' | 'triggered' | 'ended' | 'reappeared' | 'outcome' | 'exit_quote' | 'backfill';
  at: number;
  from: string | null;
  to: string | null;
  detail: unknown;
}

const event = (kind: SignalEvent['kind'], at: number, from: string | null, to: string | null, detail: unknown = null): SignalEvent => ({
  kind, at, from, to, detail,
});

/** Merge one scan's view of a signal into its row; returns the row and the events to log. */
export function applyScan(prev: SignalRow | null, cur: SignalSnapshot, now: number): { row: SignalRow; events: SignalEvent[] } {
  const events: SignalEvent[] = [];
  const live = {
    lastSeenAt: now,
    status: cur.status,
    lowerQuality: cur.lowerQuality,
    timeframes: cur.timeframes,
    tradingTimeframe: cur.tradingTimeframe,
    triggerLevel: cur.triggerLevel,
    invalidation: cur.invalidation,
    targets: cur.targets,
    contractSymbol: cur.contract?.symbol ?? null,
  };

  let row: SignalRow;
  if (!prev) {
    row = {
      key: cur.key, ticker: cur.ticker, type: cur.type, direction: cur.direction, firstSeenAt: now, ...live,
      triggerTime: cur.triggerTime, frozenAt: null, frozenT1: null, frozenContract: null, entryAsk: null, expiration: null,
      lowestEntryAsk: null, lastTrackedAt: null, outcome: 'open', outcomeAt: null, exitBid: null, exitAsk: null,
      exitQuoteTime: null, exitNote: null, gainPct: null, endedAt: null, endedReason: null,
    };
    events.push(event('first_seen', now, null, cur.status, { contract: row.contractSymbol }));
  } else {
    row = { ...prev, ...live, triggerTime: prev.triggerTime ?? cur.triggerTime };
    if (prev.endedAt != null) {
      row.endedAt = null;
      row.endedReason = null;
      if (prev.outcome === 'never_triggered') row.outcome = 'open';
      events.push(event('reappeared', now, null, cur.status));
    }
    if (prev.status !== cur.status) events.push(event('status', now, prev.status, cur.status));
    if (prev.contractSymbol !== row.contractSymbol) events.push(event('contract', now, prev.contractSymbol, row.contractSymbol));
  }

  if (cur.state === 'triggered' && row.frozenAt == null) {
    row.frozenAt = now;
    row.frozenT1 = cur.targets[0]?.price ?? null;
    row.triggerTime = cur.triggerTime;
    if (cur.contract) {
      row.frozenContract = cur.contract.symbol;
      row.entryAsk = cur.contract.ask;
      row.expiration = cur.contract.expiration;
      row.outcome = 'pending';
      row.lastTrackedAt = cur.triggerTime ?? now;
    } else if (cur.horizonExpiration) {
      // Stock outcome is still tracked (pattern hit rate); there is no option exit to quote.
      row.expiration = cur.horizonExpiration;
      row.outcome = 'pending';
      row.lastTrackedAt = cur.triggerTime ?? now;
      row.exitNote = 'no contract';
    } else {
      row.outcome = 'no_contract';
    }
    events.push(event('triggered', now, null, row.frozenContract, { t1: row.frozenT1, entryAsk: row.entryAsk, expiration: row.expiration }));
  }
  return { row, events };
}

/** A signal missing from a scan ends; never-triggered ones resolve as never_triggered, triggered ones keep tracking. */
export function endMissing(row: SignalRow, now: number): { row: SignalRow; events: SignalEvent[] } {
  if (row.endedAt != null) return { row, events: [] };
  const ended: SignalRow = {
    ...row,
    endedAt: now,
    endedReason: 'no longer detected',
    outcome: row.outcome === 'open' ? 'never_triggered' : row.outcome,
  };
  return { row: ended, events: [event('ended', now, row.status, null, { outcome: ended.outcome })] };
}

/** Lowest ask seen in the entry zone after the trigger, for the frozen contract. */
export function noteEntryAsk(row: SignalRow, ask: number | null, status: EntryStatusName): SignalRow {
  if (row.frozenAt == null || row.frozenContract == null || ask == null || status !== 'AT ENTRY') return row;
  return { ...row, lowestEntryAsk: row.lowestEntryAsk == null ? ask : Math.min(row.lowestEntryAsk, ask) };
}
