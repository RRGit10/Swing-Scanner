import type { Quote, QuoteProvider } from '../types.js';
import type { FinnhubClient } from './client.js';

interface FinnhubQuote {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export function mapQuote(symbol: string, body: unknown): Quote {
  const q = body as FinnhubQuote;
  // Finnhub answers unknown symbols with HTTP 200 and all zeros.
  if (!q || !q.c || !q.t) throw new Error(`Finnhub returned no quote for ${symbol}`);
  return {
    symbol,
    price: q.c,
    open: q.o,
    high: q.h,
    low: q.l,
    prevClose: q.pc,
    change: q.d ?? 0,
    changePercent: q.dp ?? 0,
    time: q.t,
  };
}

export class FinnhubQuoteProvider implements QuoteProvider {
  constructor(private readonly client: FinnhubClient) {}

  async getQuote(symbol: string): Promise<Quote> {
    return mapQuote(symbol, await this.client.get('/quote', { symbol }));
  }
}
