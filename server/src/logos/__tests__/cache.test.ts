import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LogoCache, type Download } from '../cache.js';
import type { CompanyProvider } from '../../providers/types.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const URLS: Record<string, string | null> = {
  AAPL: 'https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png',
  SPY: null,
  EVIL: 'https://example.com/logo.png',
  HTTP: 'http://static2.finnhub.io/logo.png',
};

function setup(over: { download?: Download; failProfile?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'logos-'));
  const calls = { profile: 0, download: 0 };
  let today = '2026-10-26';
  const company: CompanyProvider = {
    getLogoUrl: async (s) => {
      calls.profile++;
      if (over.failProfile) throw new Error('Finnhub 429 on /api/v1/stock/profile2');
      return URLS[s] ?? null;
    },
  };
  const download: Download = async (url) => {
    calls.download++;
    return over.download ? over.download(url) : { contentType: 'image/png', bytes: PNG };
  };
  const cache = new LogoCache(dir, company, download, () => today);
  return { cache, calls, dir, setToday: (d: string) => (today = d) };
}

describe('LogoCache', () => {
  it('fetches a stock logo once per ET day and serves it from disk after that', async () => {
    const { cache, calls, dir, setToday } = setup();
    expect(await cache.get('AAPL')).toEqual({ contentType: 'image/png', bytes: PNG });
    expect(await cache.get('AAPL')).toEqual({ contentType: 'image/png', bytes: PNG });
    expect(calls).toEqual({ profile: 1, download: 1 });
    expect(readdirSync(dir).sort()).toEqual(['AAPL.img', 'AAPL.json']);
    setToday('2026-10-27');
    await cache.get('AAPL');
    expect(calls).toEqual({ profile: 2, download: 2 });
  });

  it('a ticker with no logo (ETF) is remembered for the day as "none"', async () => {
    const { cache, calls } = setup();
    expect(await cache.get('SPY')).toBeNull();
    expect(await cache.get('SPY')).toBeNull();
    expect(calls).toEqual({ profile: 1, download: 0 });
  });

  it('concurrent requests share one fetch', async () => {
    const { cache, calls } = setup();
    await Promise.all([cache.get('AAPL'), cache.get('AAPL'), cache.get('AAPL')]);
    expect(calls).toEqual({ profile: 1, download: 1 });
  });

  it('only downloads https URLs on finnhub.io', async () => {
    const { cache, calls } = setup();
    expect(await cache.get('EVIL')).toBeNull();
    expect(await cache.get('HTTP')).toBeNull();
    expect(calls.download).toBe(0);
  });

  it('rejects non-images and files over 512 KB', async () => {
    const html = setup({ download: async () => ({ contentType: 'text/html', bytes: Buffer.from('<html>') }) });
    expect(await html.cache.get('AAPL')).toBeNull();
    const big = setup({ download: async () => ({ contentType: 'image/png', bytes: Buffer.alloc(513 * 1024) }) });
    expect(await big.cache.get('AAPL')).toBeNull();
  });

  it('a failed fetch is not cached (tried again next time) and falls back to an older image if there is one', async () => {
    const { cache, calls } = setup({ failProfile: true });
    await expect(cache.get('AAPL')).rejects.toThrow(/429/);
    await expect(cache.get('AAPL')).rejects.toThrow(/429/);
    expect(calls.profile).toBe(2);

    const ok = setup();
    await ok.cache.get('AAPL');
    ok.setToday('2026-10-27');
    const failing = new LogoCache(ok.dir, { getLogoUrl: async () => Promise.reject(new Error('down')) }, async () => ({ contentType: 'image/png', bytes: PNG }), () => '2026-10-27');
    expect(await failing.get('AAPL')).toEqual({ contentType: 'image/png', bytes: PNG });
  });

  it('refuses malformed tickers before touching disk or network', async () => {
    const { cache, calls } = setup();
    await expect(cache.get('../etc/passwd')).rejects.toThrow(/ticker/);
    expect(calls).toEqual({ profile: 0, download: 0 });
  });
});
