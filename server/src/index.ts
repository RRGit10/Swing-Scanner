import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type StatusPayload } from './api/routes.js';
import { config } from './config.js';
import { AlpacaMarketProvider } from './market/clock.js';
import { createAlpacaClient, createProviders, downloadLogo } from './providers/index.js';
import { LogoCache } from './logos/cache.js';
import { etToday } from './providers/et.js';
import { CandleCache, DailyMemo } from './scanner/cache.js';
import { makeChart } from './scanner/chart.js';
import { ScannerLoop } from './scanner/loop.js';
import { ScannerDb } from './storage/db.js';

const dbPath = config.dbPath ?? fileURLToPath(new URL('../data/scanner.db', import.meta.url));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new ScannerDb(dbPath);

let loop: ScannerLoop | null = null;
let chart: ReturnType<typeof makeChart> = async () => null;
let logos: LogoCache | null = null;
let startupError: string | null = null;

try {
  const providers = createProviders();
  const candles = new CandleCache(providers.candles);
  loop = new ScannerLoop({
    market: new AlpacaMarketProvider(createAlpacaClient()),
    db,
    scan: {
      candles,
      quotes: providers.quotes,
      options: providers.options,
      earnings: providers.earnings,
      memo: { expirations: new DailyMemo(), earnings: new DailyMemo() },
    },
    // Read on every scan, so a saved settings version applies from the next scan.
    settings: () => {
      const { version, settings } = db.currentSettings();
      return { version, settings };
    },
  });
  chart = makeChart(candles, db);
  // Next to the database: server/data/logos (git-ignored); browser tests get their own folder.
  logos = new LogoCache(join(dirname(dbPath), 'logos'), providers.company, downloadLogo, etToday);
} catch (err) {
  // e.g. missing API keys: keep serving the API (health shows which keys are missing) with the scanner off
  startupError = (err as Error).message;
  console.error(`[scanner] not started: ${startupError}`);
}

const disabledStatus = (): StatusPayload => ({
  market: 'closed', banner: null, sessionDate: null, inLiquidWindow: false, lastScanAt: null, nextScanAt: null, scannerError: startupError,
});

const app = createApp({
  db,
  status: () => loop?.status() ?? disabledStatus(),
  chart: (t, tf) => chart(t, tf),
  logo: async (t) => (logos ? logos.get(t) : null),
});

app.listen(config.port, config.host, () => {
  console.log(`API listening on http://${config.host}:${config.port}${config.readOnly ? ' (read-only)' : ''}`);
  loop?.start({ readOnly: config.readOnly }).catch((err: Error) => console.error(`[scanner] start failed: ${err.message}`));
});
