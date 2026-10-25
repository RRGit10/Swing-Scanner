import { requireEnv } from '../config.js';
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

export function createAlpacaClient(): AlpacaClient {
  return new AlpacaClient(requireEnv('ALPACA_API_KEY_ID'), requireEnv('ALPACA_SECRET_KEY'));
}

export function createProviders(): Providers {
  const alpaca = createAlpacaClient();
  const finnhub = new FinnhubClient(requireEnv('FINNHUB_API_KEY'));
  return {
    candles: new AlpacaCandleProvider(alpaca),
    options: new AlpacaOptionsProvider(alpaca),
    quotes: new FinnhubQuoteProvider(finnhub),
    earnings: new FinnhubEarningsProvider(finnhub),
  };
}

export type * from './types.js';
