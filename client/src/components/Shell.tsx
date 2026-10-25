import type { ReactNode } from 'react';
import Disclaimer from '../Disclaimer';
import type { StatusPayload } from '../api/types';
import { etTime, shortDate } from '../lib/format';

const NAV = [
  { href: '#/', label: 'Signals', key: 'signals' },
  { href: '#/history', label: 'History', key: 'history' },
  { href: '#/settings', label: 'Settings', key: 'settings' },
];

export function Shell({ active, status, children }: { active: string; status: StatusPayload | null; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Disclaimer />
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-8 gap-y-2 px-4 py-4 md:px-8">
          <a href="#/" className="ticker text-xl text-ink no-underline">
            Swing Scanner
          </a>
          <nav aria-label="Main" className="flex gap-5 text-[15px]">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                aria-current={active === n.key ? 'page' : undefined}
                className={active === n.key ? 'font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[6px]' : 'text-ink-2 hover:text-ink'}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <MarketLine status={status} />
        </div>
      </header>
      {status?.market === 'closed' && status.banner && (
        <div className="border-b border-rule bg-surface">
          <p className="mx-auto max-w-[1400px] px-4 py-2.5 text-sm text-ink-2 md:px-8">
            <span className="font-semibold text-ink">Market closed.</span> Showing the {shortDate(status.sessionDate)} session, read-only. Scans resume at the next open.
          </p>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 md:px-8">{children}</main>
    </div>
  );
}

function MarketLine({ status }: { status: StatusPayload | null }) {
  if (!status) return <span className="ml-auto text-sm text-ink-3">Checking the market…</span>;
  return (
    <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-ink-2">
      <span className="text-ink">
        <span
          aria-hidden
          className={`mr-1.5 inline-block size-2 rounded-full ${status.market === 'open' ? 'bg-long' : 'bg-ink-3'}`}
        />
        {status.market === 'open' ? (status.inLiquidWindow ? 'Open, liquid window' : 'Open, outside liquid windows') : 'Closed'}
      </span>
      <span>Last scan {etTime(status.lastScanAt)}</span>
      {status.market === 'open' && <span>{status.scanning ? 'Scanning now' : `Next scan ${etTime(status.nextScanAt)}`}</span>}
      {status.scannerError && <span className="text-short">Scanner: {status.scannerError}</span>}
    </div>
  );
}
