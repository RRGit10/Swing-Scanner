import { requireEnv } from '../config.js';
import { RateLimiter } from '../scanner/limiter.js';
import { DEFAULT_SCANNER_SETTINGS } from '../scanner/settings.js';
import { AlpacaCandleProvider } from './alpaca/candles.js';
import { AlpacaClient } from './alpaca/client.js';
import { AlpacaOptionsProvider } from './alpaca/options.js';
import { FinnhubClient } from './finnhub/client.js';
import { FinnhubEarningsProvider } from './finnhub/earnings.js';
import { FinnhubQuoteProvider } from './finnhub/quote.js';
import type { CandleProvider, EarningsProvider, OptionsProvider, QuoteProvider } from './types.js';

export interface Providers {
  candles: CandleProvider;
  options: OptionsProvider;
  quotes: QuoteProvider;
  earnings: EarningsProvider;
}

/** One limiter per provider, shared by every client in the process (free-plan limits, with headroom). */
const alpacaLimiter = new RateLimiter(DEFAULT_SCANNER_SETTINGS.alpacaPerMinute);
const finnhubLimiter = new RateLimiter(DEFAULT_SCANNER_SETTINGS.finnhubPerMinute);

export function createAlpacaClient(): AlpacaClient {
  return new AlpacaClient(requireEnv('ALPACA_API_KEY_ID'), requireEnv('ALPACA_SECRET_KEY'), alpacaLimiter);
}

export function createProviders(): Providers {
  const alpaca = createAlpacaClient();
  const finnhub = new FinnhubClient(requireEnv('FINNHUB_API_KEY'), finnhubLimiter);
  return {
    candles: new AlpacaCandleProvider(alpaca),
    options: new AlpacaOptionsProvider(alpaca),
    quotes: new FinnhubQuoteProvider(finnhub),
    earnings: new FinnhubEarningsProvider(finnhub),
  };
}

export type * from './types.js';
