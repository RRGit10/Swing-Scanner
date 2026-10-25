import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../routes.js';
import { ScannerDb } from '../../storage/db.js';
import { applyScan } from '../../history/signals.js';

const NOW = 1_800_000_000;
let server: Server;
let base: string;

beforeAll(async () => {
  const db = new ScannerDb(':memory:');
  db.saveScan({
    startedAt: NOW, finishedAt: NOW + 4, market: 'closed', sessionDate: '2026-10-23', errors: [],
    payload: { tickers: [{ ticker: 'SPY', bestStatus: 'WATCH', patterns: [{ key: 'k' }], contracts: [] }, { ticker: 'AAPL', bestStatus: null, patterns: [], contracts: [] }] },
  });
  const { row, events } = applyScan(null, {
    key: 'k', ticker: 'SPY', type: 'double_top', direction: 'bearish', timeframes: ['15m'], tradingTimeframe: '15m', state: 'armed',
    status: 'WATCH', lowerQuality: false, triggerTime: null, triggerLevel: 1, invalidation: 2, targets: [{ kind: 'pattern', label: 'T', price: 0.5 }], contract: null, horizonExpiration: null, settingsVersion: 1,
  }, NOW);
  db.addEvents(db.upsertSignal(row), events);

  const app = createApp({
    db,
    status: () => ({ market: 'closed', banner: 'market closed — last session', sessionDate: '2026-10-23', inLiquidWindow: false, lastScanAt: NOW, nextScanAt: null }),
    logo: async (ticker) => (ticker === 'AAPL' ? { contentType: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } : null),
    chart: async (ticker, tf) => (ticker === 'SPY' ? { ticker, timeframe: tf, candles: [], ema: { 13: [], 48: [], 55: [], 200: [] }, patterns: [] } : null),
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

describe('API', () => {
  it('GET /api/status', async () => {
    expect((await get('/api/status')).body).toMatchObject({ market: 'closed', banner: 'market closed — last session' });
  });

  it('GET /api/signals returns the latest grouped scan, read-only', async () => {
    const { body } = await get('/api/signals');
    expect(body).toMatchObject({ scannedAt: NOW, market: 'closed', sessionDate: '2026-10-23' });
    expect(body.tickers.map((t: { ticker: string }) => t.ticker)).toEqual(['SPY', 'AAPL']);
  });

  it('GET /api/signals/:ticker (case-insensitive) and 404 for unknown', async () => {
    expect((await get('/api/signals/spy')).body.ticker).toBe('SPY');
    expect((await get('/api/signals/ZZZZ')).status).toBe(404);
  });

  it('GET /api/chart/:ticker validates the time frame', async () => {
    expect((await get('/api/chart/SPY?tf=15m')).body).toMatchObject({ ticker: 'SPY', timeframe: '15m' });
    expect((await get('/api/chart/SPY?tf=5m')).status).toBe(400);
    expect((await get('/api/chart/ZZZZ?tf=1h')).status).toBe(404);
  });

  it('GET /api/history returns signals with events, and summaries for this settings version and all time', async () => {
    const { body } = await get('/api/history');
    expect(body.currentVersion).toBe(1);
    expect(body.summary.allTime).toMatchObject({ total: 1, triggered: 0 });
    expect(body.summary.current).toMatchObject({ total: 1 });
    expect(body.versions.map((v: { version: number }) => v.version)).toEqual([1]);
    expect(body.signals[0]).toMatchObject({ key: 'k', outcome: 'open' });
    expect(body.signals[0].events.map((e: { kind: string }) => e.kind)).toEqual(['first_seen']);
  });

  it('only settings can be written; everything else is read-only', async () => {
    expect((await fetch(base + '/api/signals', { method: 'POST' })).status).toBe(404);
    expect((await fetch(base + '/api/history', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('settings API', () => {
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };

  it('GET returns the current version, its settings and the defaults', async () => {
    const { body } = await get('/api/settings');
    expect(body).toMatchObject({ version: 1, note: 'defaults' });
    expect(body.settings.contracts.budget).toBe(500);
    expect(body.defaults.contracts.budget).toBe(500);
  });

  it('PUT saves a new version (applies from the next scan); invalid input returns every error', async () => {
    const ok = await send('PUT', '/api/settings', { contracts: { budget: 750 }, watchlist: ['spy', 'qqq'] });
    expect(ok).toMatchObject({ status: 200, body: { version: 2, changed: true } });
    expect(ok.body.settings.watchlist).toEqual(['SPY', 'QQQ']);
    const bad = await send('PUT', '/api/settings', { contracts: { budget: 1 }, watchlist: [] });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual(['contracts.budget: must be between 50 and 100000', 'watchlist: add at least 1 ticker']);
    expect((await get('/api/settings')).body.version).toBe(2);
  });

  it('POST /api/settings/reset restores the defaults as a new version', async () => {
    const { body } = await send('POST', '/api/settings/reset');
    expect(body).toMatchObject({ version: 3, changed: true, note: 'reset to defaults' });
    expect(body.settings.contracts.budget).toBe(500);
    const history = (await get('/api/history?version=all')).body;
    expect(history.versions.map((v: { version: number; note: string | null }) => [v.version, v.note])).toEqual([
      [3, 'reset to defaults'], [2, null], [1, 'defaults'],
    ]);
  });
});

describe('GET /api/logo/:ticker', () => {
  it('serves a cached logo for a watchlist ticker with a 1-day cache header', async () => {
    const res = await fetch(base + '/api/logo/aapl');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('404 when the ticker has no logo (ETF), or is not on the watchlist; 400 when malformed', async () => {
    expect((await fetch(base + '/api/logo/SPY')).status).toBe(404);
    expect((await fetch(base + '/api/logo/ZZZZ')).status).toBe(404);
    expect((await fetch(base + '/api/logo/' + encodeURIComponent('..%2Fx'))).status).toBe(400);
  });
});

describe('GET /api/logo/:ticker/info', () => {
  it('always answers 200 with hasLogo, so the browser only requests images that exist', async () => {
    expect(await (await fetch(base + '/api/logo/AAPL/info')).json()).toEqual({ ticker: 'AAPL', hasLogo: true });
    expect(await (await fetch(base + '/api/logo/SPY/info')).json()).toEqual({ ticker: 'SPY', hasLogo: false });
    const off = await fetch(base + '/api/logo/ZZZZ/info');
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ ticker: 'ZZZZ', hasLogo: false });
  });
});
