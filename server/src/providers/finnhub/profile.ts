import type { CompanyProvider } from '../types.js';
import type { FinnhubClient } from './client.js';

/** Logo URL from /stock/profile2; ETFs come back as {} (no logo). */
export function mapLogoUrl(body: unknown): string | null {
  const logo = (body as { logo?: unknown } | null)?.logo;
  return typeof logo === 'string' && logo.trim() ? logo.trim() : null;
}

export class FinnhubCompanyProvider implements CompanyProvider {
  constructor(private readonly client: FinnhubClient) {}

  async getLogoUrl(symbol: string): Promise<string | null> {
    return mapLogoUrl(await this.client.get('/stock/profile2', { symbol }));
  }
}
