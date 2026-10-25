import type { Candle, CandleProvider } from '../providers/types.js';

/**
 * Candle cache. 15m bars: full history once, then only from the last cached bar (which is refetched,
 * since it may have been partial). Daily bars: once per ET date.
 */
export class CandleCache {
  private readonly intraday = new Map<string, Candle[]>();
  private readonly daily = new Map<string, { date: string; bars: Candle[] }>();

  constructor(readonly provider: CandleProvider) {}

  async get15m(symbol: string): Promise<Candle[]> {
    const have = this.intraday.get(symbol);
    if (!have?.length) {
      const bars = await this.provider.getCandles(symbol, '15m');
      this.intraday.set(symbol, bars);
      return bars;
    }
    const last = have.at(-1)!;
    const fresh = await this.provider.getCandles(symbol, '15m', { start: new Date(last.time * 1000) });
    const merged = [...have.filter((b) => b.time < last.time), ...fresh.filter((b) => b.time >= last.time)];
    this.intraday.set(symbol, merged);
    return merged;
  }

  /** Last fetched 15m bars without a network call (empty if never fetched). */
  peek15m(symbol: string): Candle[] {
    return this.intraday.get(symbol) ?? [];
  }

  async getDaily(symbol: string, date: string): Promise<Candle[]> {
    const cached = this.daily.get(symbol);
    if (cached?.date === date) return cached.bars;
    const bars = await this.provider.getCandles(symbol, '1d');
    this.daily.set(symbol, { date, bars });
    return bars;
  }
}

/** Per-key value cached for one ET date; a failed load is not cached. */
export class DailyMemo<T> {
  private readonly entries = new Map<string, { date: string; value: Promise<T> }>();

  get(key: string, date: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached?.date === date) return cached.value;
    const value = load();
    this.entries.set(key, { date, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }
}
