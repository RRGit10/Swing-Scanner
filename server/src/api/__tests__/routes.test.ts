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
    status: 'WATCH', lowerQuality: false, triggerTime: null, triggerLevel: 1, invalidation: 2, targets: [{ kind: 'pattern', label: 'T', price: 0.5 }], contract: null, horizonExpiration: null,
  }, NOW);
  db.addEvents(db.upsertSignal(row), events);

  const app = createApp({
    db,
    status: () => ({ market: 'closed', banner: 'market closed — last session', sessionDate: '2026-10-23', inLiquidWindow: false, lastScanAt: NOW, nextScanAt: null }),
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

  it('GET /api/history returns signals with events and the summary', async () => {
    const { body } = await get('/api/history');
    expect(body.summary).toMatchObject({ total: 1, triggered: 0 });
    expect(body.signals[0]).toMatchObject({ key: 'k', outcome: 'open' });
    expect(body.signals[0].events.map((e: { kind: string }) => e.kind)).toEqual(['first_seen']);
  });

  it('only GET is exposed (no write endpoints)', async () => {
    const res = await fetch(base + '/api/signals', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
