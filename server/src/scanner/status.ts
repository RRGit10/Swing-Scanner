import type { CandleBias } from '../analysis/candles.js';
import type { Direction } from '../analysis/types.js';
import type { EntryStatusName } from '../contracts/types.js';

export type SignalStatus = 'AT ENTRY' | 'READY' | 'WATCH' | 'WAIT';

/**
 * WAIT = newest candle doji/spinning top. WATCH = armed, or triggered with non-matching bias.
 * READY = triggered + matching bias. AT ENTRY = READY + contract ask in the entry zone.
 * entryStatus is null when no contract fits; the status stands.
 */
export function signalStatus(p: {
  state: 'armed' | 'triggered';
  candleBias: CandleBias;
  direction: Direction;
  entryStatus: EntryStatusName | null;
}): SignalStatus {
  if (p.candleBias === 'neutral') return 'WAIT';
  if (p.state === 'armed' || p.candleBias !== p.direction) return 'WATCH';
  return p.entryStatus === 'AT ENTRY' ? 'AT ENTRY' : 'READY';
}

const RANK: Record<SignalStatus, number> = { 'AT ENTRY': 0, READY: 1, WATCH: 2, WAIT: 3 };

export function statusRank(s: SignalStatus): number {
  return RANK[s];
}
