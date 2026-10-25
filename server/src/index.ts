import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp, type StatusPayload } from './api/routes.js';
import { config } from './config.js';
import { AlpacaMarketProvider } from './market/clock.js';
import { createAlpacaClient, createProviders } from './providers/index.js';
import { CandleCache, DailyMemo } from './scanner/cache.js';
import { makeChart } from './scanner/chart.js';
import { ScannerLoop } from './scanner/loop.js';
import { DEFAULT_APP_SETTINGS } from './scanner/settings.js';
import { ScannerDb } from './storage/db.js';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(dataDir, { recursive: true });
const db = new ScannerDb(`${dataDir}scanner.db`);

let loop: ScannerLoop | null = null;
let chart: ReturnType<typeof makeChart> = async () => null;
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
    settings: DEFAULT_APP_SETTINGS,
  });
  chart = makeChart(candles, db);
} catch (err) {
  // e.g. missing API keys: keep serving the API (health shows which keys are missing) with the scanner off
  startupError = (err as Error).message;
  console.error(`[scanner] not started: ${startupError}`);
}

const disabledStatus = (): StatusPayload => ({
  market: 'closed', banner: null, sessionDate: null, inLiquidWindow: false, lastScanAt: null, nextScanAt: null, scannerError: startupError,
});

const app = createApp({ db, status: () => loop?.status() ?? disabledStatus(), chart: (t, tf) => chart(t, tf) });

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  loop?.start().catch((err: Error) => console.error(`[scanner] start failed: ${err.message}`));
});
