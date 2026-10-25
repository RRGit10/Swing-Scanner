export type IntradayTimeframe = '15m' | '30m' | '1h';
export type Timeframe = IntradayTimeframe | '1d';

/**
 * One OHLCV bar. `time` is unix seconds at the bar's start.
 * Daily bars use 00:00 UTC of the trading date, so charts show the right day.
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleRange {
  start?: Date;
  end?: Date;
}

export interface Quote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  /** unix seconds of the last trade */
  time: number;
}

export interface OptionContract {
  symbol: string;
  underlying: string;
  type: 'call' | 'put';
  strike: number;
  /** YYYY-MM-DD */
  expiration: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  /** ET date of the session dayLow/dayHigh/volume belong to (can lag on weekends/holidays) */
  dayBarDate: string | null;
  volume: number;
  /** 0 when the source has no figure; see openInterestDate */
  openInterest: number;
  openInterestDate: string | null;
  delta: number | null;
  gamma: number | null;
  /** per calendar day, negative for long options */
  theta: number | null;
  iv: number | null;
  /** ISO time of the bid/ask quote */
  quoteTime: string | null;
}

export interface EarningsEvent {
  symbol: string;
  /** YYYY-MM-DD */
  date: string;
  /** bmo = before open, amc = after close, dmh = during market hours, '' = unknown */
  hour: string;
  epsEstimate: number | null;
}

export interface CandleProvider {
  getCandles(symbol: string, timeframe: Timeframe, range?: CandleRange): Promise<Candle[]>;
}

export interface OptionsProvider {
  /** YYYY-MM-DD dates, ascending */
  getExpirations(symbol: string): Promise<string[]>;
  getChain(symbol: string, expiration: string): Promise<OptionContract[]>;
}

export interface QuoteProvider {
  getQuote(symbol: string): Promise<Quote>;
}

export interface EarningsProvider {
  /** from/to are YYYY-MM-DD, inclusive */
  getEarnings(symbol: string, from: string, to: string): Promise<EarningsEvent[]>;
}
