import { useEffect, useState } from 'react';
import Disclaimer from './Disclaimer';
import { OPTION_PRICE_LABEL } from './labels';

interface Health {
  ok: boolean;
  keys: { alpaca: boolean; finnhub: boolean };
  stockFeed: 'sip' | 'iex';
  optionsFeed: 'indicative' | 'opra';
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen">
      <Disclaimer />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Swing Scanner</h1>
        <p className="mt-2 text-slate-400">Phase 1 scaffold. Dashboard arrives in phase 6.</p>
        <div className="mt-6 rounded border border-slate-800 p-4 text-sm">
          {error && <p className="text-red-400">API unreachable: {error}</p>}
          {!error && !health && <p className="text-slate-400">Checking API…</p>}
          {health && (
            <ul className="space-y-1">
              <li>API: {health.ok ? 'ok' : 'down'}</li>
              <li>Alpaca keys: {health.keys.alpaca ? 'set' : 'missing'}</li>
              <li>Finnhub key: {health.keys.finnhub ? 'set' : 'missing'}</li>
            </ul>
          )}
        </div>
        {health && (
          <div className="mt-4 rounded border border-slate-800 p-4 text-sm">
            <h2 className="font-medium">Data sources</h2>
            <ul className="mt-2 space-y-1 text-slate-300">
              <li>Stock quotes: Finnhub, real-time</li>
              <li>
                Stock candles: Alpaca {health.stockFeed.toUpperCase()}
                {health.stockFeed === 'sip' && ', 15-min delayed'}
              </li>
              <li>
                Option prices: Alpaca
                {health.optionsFeed === 'indicative' && (
                  <span className="ml-2 rounded bg-amber-900/60 px-1.5 py-0.5 text-xs text-amber-200">
                    {OPTION_PRICE_LABEL}
                  </span>
                )}
              </li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
