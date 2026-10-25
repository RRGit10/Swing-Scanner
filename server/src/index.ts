import express from 'express';
import { config, hasEnv } from './config.js';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    keys: {
      alpaca: hasEnv('ALPACA_API_KEY_ID') && hasEnv('ALPACA_SECRET_KEY'),
      finnhub: hasEnv('FINNHUB_API_KEY'),
    },
    stockFeed: config.stockFeed,
    optionsFeed: config.optionsFeed,
  });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
