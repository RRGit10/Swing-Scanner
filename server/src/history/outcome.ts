import type { Direction } from '../analysis/types.js';
import { etClock, etToUnix, hhmmToMinutes } from '../providers/et.js';
import type { Candle } from '../providers/types.js';
import type { ScannerSettings } from '../scanner/settings.js';

export interface TrackedTrade {
  direction: Direction;
  /** frozen at trigger */
  t1: number;
  invalidation: number;
  /** evaluate events at/after this time (trigger close, or the last tracked time) */
  fromTime: number;
  expirationClose: number;
  tradingTfMinutes: number;
}

export interface OutcomeEvent {
  kind: 'win' | 'loss' | 'expired';
  at: number;
}

/** Unix seconds of the session close (default 16:00 ET) on an expiration date. */
export function expirationCloseUnix(expiration: string, close = '16:00'): number {
  return etToUnix(expiration, hhmmToMinutes(close));
}

/** A bar's close time, capped at 16:00 ET (the last 1h bar is 15:30–16:00). */
function closeTime(bar: Candle, tfMinutes: number): number {
  const date = etClock(bar.time).date;
  return Math.min(bar.time + tfMinutes * 60, etToUnix(date, 16 * 60));
}

/**
 * Whichever comes first after `fromTime`: T1 touched (1-min high/low) = win, or a trading-chart close
 * beyond invalidation = loss. On a tie the close wins (it happens at the start of that minute).
 * Neither by the expiration close → expired, once delayed data has had `settleSec` to arrive.
 */
export function evaluateOutcome(
  trade: TrackedTrade,
  minuteBars: Candle[],
  tradingBars: Candle[],
  now: number,
  settleSec = 20 * 60,
): OutcomeEvent | null {
  const bull = trade.direction === 'bullish';
  const events: OutcomeEvent[] = [];
  for (const b of minuteBars) {
    if (b.time < trade.fromTime || b.time >= trade.expirationClose) continue;
    if (bull ? b.high >= trade.t1 : b.low <= trade.t1) events.push({ kind: 'win', at: b.time });
  }
  for (const b of tradingBars) {
    const at = closeTime(b, trade.tradingTfMinutes);
    if (at < trade.fromTime || at > trade.expirationClose) continue;
    if (bull ? b.close < trade.invalidation : b.close > trade.invalidation) events.push({ kind: 'loss', at });
  }
  events.sort((a, b) => a.at - b.at || (a.kind === 'loss' ? -1 : 1));
  if (events[0]) return events[0];
  return now >= trade.expirationClose + settleSec ? { kind: 'expired', at: trade.expirationClose } : null;
}

export type ExitQuoteResult =
  | { kind: 'ok'; bid: number; ask: number; quoteTime: string }
  | { kind: 'wait' }
  | { kind: 'missed' };

/**
 * Exit quote = the first option snapshot whose quote time is at/after the hit (quotes are 15-min
 * delayed, so it arrives ~16 min later). Too late or never → "exit quote missed" (never estimated).
 */
export function exitQuote(
  snapshot: { bid: number | null; ask: number | null; quoteTime: string | null } | null,
  hitAt: number,
  now: number,
  s: ScannerSettings,
): ExitQuoteResult {
  const maxLag = s.exitQuoteMaxLagMin * 60;
  if (snapshot?.quoteTime) {
    const quoted = Date.parse(snapshot.quoteTime) / 1000;
    if (quoted >= hitAt) {
      return quoted <= hitAt + maxLag && snapshot.bid != null && snapshot.ask != null
        ? { kind: 'ok', bid: snapshot.bid, ask: snapshot.ask, quoteTime: snapshot.quoteTime }
        : { kind: 'missed' };
    }
  }
  return now > hitAt + maxLag + s.dataSettleMin * 60 ? { kind: 'missed' } : { kind: 'wait' };
}

/** Buy at the ask, sell at the bid. */
export function gainPct(exitBid: number, entryAsk: number): number {
  return ((exitBid - entryAsk) / entryAsk) * 100;
}
