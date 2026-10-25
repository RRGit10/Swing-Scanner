import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlpacaClient } from '../alpaca/client.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ next_page_token: null })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = new AlpacaClient('KEY_ID', 'SECRET');

function requestedUrl(): URL {
  return new URL(String(fetchMock.mock.calls[0]![0]));
}

describe('AlpacaClient guard', () => {
  it.each(['/v2/orders', '/v2/positions', '/v2/account', '/v2/options/contracts/../../orders'])(
    'refuses %s on the paper trading API without making a request',
    async (path) => {
      await expect(client.get('paper', path, {})).rejects.toThrow(/not allowed/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('refuses order paths on the data API too', async () => {
    await expect(client.get('data', '/v2/orders', {})).rejects.toThrow(/not allowed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends stock bars to data.alpaca.markets with keys in headers only', async () => {
    await client.get('data', '/v2/stocks/bars', { symbols: 'SPY', timeframe: '15Min' });
    const url = requestedUrl();
    expect(url.origin).toBe('https://data.alpaca.markets');
    expect(url.pathname).toBe('/v2/stocks/bars');
    expect(url.search).not.toMatch(/KEY_ID|SECRET/);
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['APCA-API-KEY-ID']).toBe('KEY_ID');
    expect(headers['APCA-API-SECRET-KEY']).toBe('SECRET');
  });

  it('sends option snapshots to the data API', async () => {
    await client.get('data', '/v1beta1/options/snapshots/SPY', { feed: 'indicative' });
    expect(requestedUrl().origin).toBe('https://data.alpaca.markets');
  });

  it('sends option contracts to the paper API, never the live trading host', async () => {
    await client.get('paper', '/v2/options/contracts', { underlying_symbols: 'SPY' });
    expect(requestedUrl().origin).toBe('https://paper-api.alpaca.markets');
  });

  it('uses GET only', async () => {
    await client.get('paper', '/v2/options/contracts', {});
    expect(fetchMock.mock.calls[0]![1].method).toBe('GET');
  });
});

describe('AlpacaClient.getAllPages', () => {
  it('follows next_page_token until it is null', async () => {
    fetchMock
      .mockImplementationOnce(async () => new Response(JSON.stringify({ n: 1, next_page_token: 'abc' })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ n: 2, next_page_token: null })));
    const pages = await client.getAllPages('data', '/v2/stocks/bars', { symbols: 'SPY' });
    expect(pages).toHaveLength(2);
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get('page_token')).toBe('abc');
  });

  it('throws instead of silently truncating when the page cap is hit', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ next_page_token: 'more' })));
    await expect(client.getAllPages('data', '/v2/stocks/bars', {}, 3)).rejects.toThrow(/more than 3 pages/);
  });
});
