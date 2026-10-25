import express from 'express';
import type { KeyPoint, PatternLine } from '../analysis/patterns/types.js';
import { config, hasEnv } from '../config.js';
import type { Candle, Timeframe } from '../providers/types.js';
import type { TickerEntry } from '../scanner/group.js';
import type { SignalStatus } from '../scanner/status.js';
import { DEFAULT_APP_SETTINGS } from '../scanner/settings.js';
import { validateSettings } from '../settings/validate.js';
import type { ScannerDb } from '../storage/db.js';

export interface StatusPayload {
  market: 'open' | 'closed';
  /** e.g. "market closed — last session" */
  banner: string | null;
  sessionDate: string | null;
  inLiquidWindow: boolean;
  lastScanAt: number | null;
  nextScanAt: number | null;
  scanning?: boolean;
  scannerError?: string | null;
}

export interface ChartPayload {
  ticker: string;
  timeframe: Timeframe;
  candles: Candle[];
  ema: Record<13 | 48 | 55 | 200, (number | null)[]>;
  patterns: { key: string; type: string; direction: string; status: SignalStatus; points: KeyPoint[]; lines: PatternLine[] }[];
}

export interface AppDeps {
  db: ScannerDb;
  status: () => StatusPayload;
  now?: () => number;
  chart: (ticker: string, tf: Timeframe) => Promise<ChartPayload | null>;
}

const TIMEFRAMES: Timeframe[] = ['15m', '30m', '1h', '1d'];

/** JSON API. Read-only except settings (saved as a new version; the scanner picks them up on its next scan). */
export function createApp(deps: AppDeps): express.Express {
  const app = express();
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  app.use(express.json({ limit: '64kb' }));
  const latestTickers = (): TickerEntry[] => (deps.db.latestScan()?.payload as { tickers?: TickerEntry[] } | undefined)?.tickers ?? [];

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      keys: { alpaca: hasEnv('ALPACA_API_KEY_ID') && hasEnv('ALPACA_SECRET_KEY'), finnhub: hasEnv('FINNHUB_API_KEY') },
      stockFeed: config.stockFeed,
      optionsFeed: config.optionsFeed,
    });
  });

  app.get('/api/status', (_req, res) => {
    res.json(deps.status());
  });

  app.get('/api/signals', (_req, res) => {
    const scan = deps.db.latestScan();
    res.json({
      scannedAt: scan?.startedAt ?? null,
      finishedAt: scan?.finishedAt ?? null,
      market: scan?.market ?? null,
      sessionDate: scan?.sessionDate ?? null,
      errors: scan?.errors ?? [],
      tickers: latestTickers(),
    });
  });

  app.get('/api/signals/:ticker', (req, res) => {
    const entry = latestTickers().find((t) => t.ticker === req.params.ticker.toUpperCase());
    if (!entry) return void res.status(404).json({ error: `No scan result for ${req.params.ticker}` });
    res.json(entry);
  });

  app.get('/api/chart/:ticker', async (req, res, next) => {
    try {
      const tf = String(req.query.tf ?? '15m') as Timeframe;
      if (!TIMEFRAMES.includes(tf)) return void res.status(400).json({ error: `tf must be one of ${TIMEFRAMES.join(', ')}` });
      const chart = await deps.chart(req.params.ticker.toUpperCase(), tf);
      if (!chart) return void res.status(404).json({ error: `No chart for ${req.params.ticker}` });
      res.json(chart);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/history', (_req, res) => {
    const current = deps.db.currentSettings().version;
    const signals = deps.db.allSignals().map((s) => ({ ...s, events: deps.db.events(s.id!) }));
    res.json({
      currentVersion: current,
      versions: deps.db.settingsVersions().map(({ version, savedAt, changes, note }) => ({ version, savedAt, changes, note })),
      summary: { current: deps.db.historySummary(current), allTime: deps.db.historySummary() },
      signals,
    });
  });

  const settingsBody = () => ({ ...deps.db.currentSettings(), defaults: DEFAULT_APP_SETTINGS });

  app.get('/api/settings', (_req, res) => {
    res.json(settingsBody());
  });

  app.put('/api/settings', (req, res) => {
    const result = validateSettings(req.body, deps.db.currentSettings().settings);
    if (!result.ok) return void res.status(400).json({ errors: result.errors });
    const saved = deps.db.saveSettings(result.settings, now());
    res.json({ ...settingsBody(), ...saved });
  });

  app.post('/api/settings/reset', (_req, res) => {
    const saved = deps.db.saveSettings(DEFAULT_APP_SETTINGS, now(), 'reset to defaults');
    res.json({ ...settingsBody(), ...saved });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}
