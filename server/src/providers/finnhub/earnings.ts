import type { EarningsEvent, EarningsProvider } from '../types.js';
import type { FinnhubClient } from './client.js';

interface FinnhubEarning {
  symbol: string;
  date: string;
  hour?: string | null;
  epsEstimate?: number | null;
}

export function mapEarnings(body: unknown): EarningsEvent[] {
  const list = (body as { earningsCalendar?: FinnhubEarning[] | null }).earningsCalendar ?? [];
  return list.map((e) => ({
    symbol: e.symbol,
    date: e.date,
    hour: e.hour ?? '',
    epsEstimate: typeof e.epsEstimate === 'number' ? e.epsEstimate : null,
  }));
}

export class FinnhubEarningsProvider implements EarningsProvider {
  constructor(private readonly client: FinnhubClient) {}

  async getEarnings(symbol: string, from: string, to: string): Promise<EarningsEvent[]> {
    return mapEarnings(await this.client.get('/calendar/earnings', { symbol, from, to }));
  }
}
