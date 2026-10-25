import { useEffect, useState } from 'react';

/**
 * Company logo served by our API (cached server-side from Finnhub), or a rounded letter badge for
 * ETFs and tickers without one. Asks /info first so a missing logo never becomes a failed request.
 */
export function TickerLogo({ ticker, size = 40 }: { ticker: string; size?: number }) {
  const [state, setState] = useState<'loading' | 'image' | 'letter'>('loading');
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(`/api/logo/${ticker}/info`)
      .then((r) => r.json() as Promise<{ hasLogo: boolean }>)
      .then((b) => !cancelled && setState(b.hasLogo ? 'image' : 'letter'))
      .catch(() => !cancelled && setState('letter'));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const box = { width: size, height: size };
  if (state === 'image') {
    return (
      <img
        data-testid="logo"
        data-kind="image"
        src={`/api/logo/${ticker}`}
        alt=""
        width={size}
        height={size}
        onError={() => setState('letter')}
        className="rounded-lg bg-white object-contain p-1 ring-1 ring-card-border"
        style={box}
      />
    );
  }
  return (
    <span
      data-testid="logo"
      data-kind={state === 'letter' ? 'letter' : 'loading'}
      aria-hidden
      className="grid place-items-center rounded-lg bg-accent-wash text-lg font-bold text-accent"
      style={box}
    >
      {state === 'letter' ? ticker.charAt(0) : ''}
    </span>
  );
}
