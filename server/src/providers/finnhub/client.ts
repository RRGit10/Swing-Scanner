import type { RateLimiter } from '../../scanner/limiter.js';
import { fetchJson } from '../http.js';

const BASE_URL = 'https://finnhub.io/api/v1';

export class FinnhubClient {
  constructor(
    private readonly apiKey: string,
    private readonly limiter?: RateLimiter,
  ) {}

  /** Key goes in the X-Finnhub-Token header, never the URL, so it can't leak into logged paths. */
  get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    const call = () => fetchJson('Finnhub', url, { 'X-Finnhub-Token': this.apiKey });
    return this.limiter ? this.limiter.run(call) : call();
  }
}
