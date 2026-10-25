import type { ReactNode } from 'react';
import Disclaimer from '../Disclaimer';
import type { StatusPayload } from '../api/types';
import { etTime, shortDate } from '../lib/format';

const NAV = [
  { href: '#/', label: 'Signals', key: 'signals' },
  { href: '#/history', label: 'History', key: 'history' },
  { href: '#/settings', label: 'Settings', key: 'settings' },
];

function LogoMark() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-8 text-accent">
      <path d="M3 23 L12 14 L18 19 L28 8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 8 H28 V15" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell({ active, status, children }: { active: string; status: StatusPayload | null; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Disclaimer />
      <header className="border-b border-card-border">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-10 gap-y-3 px-4 py-4 md:px-8">
          <a href="#/" className="flex items-center gap-2.5 text-[22px] font-bold tracking-tight text-ink">
            <LogoMark />
            Swing Scanner
          </a>
          <nav aria-label="Main" className="flex gap-7 text-[15px]">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                aria-current={active === n.key ? 'page' : undefined}
                className={`border-b-2 pb-1.5 pt-2 ${active === n.key ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <MarketLine status={status} />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-8">
        {status?.market === 'closed' && status.banner && (
          <p className="mb-5 flex items-start gap-3 rounded-lg border border-accent/40 bg-accent-wash px-4 py-3 text-sm text-ink-2">
            <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-accent">
              <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 9 V14 M10 6.2 V6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="font-semibold text-ink">Market closed.</span> Showing the {shortDate(status.sessionDate)} session, read-only. Scans resume at the next open.
            </span>
          </p>
        )}
        {children}
      </main>
    </div>
  );
}

function MarketLine({ status }: { status: StatusPayload | null }) {
  if (!status) return <span className="ml-auto text-sm text-ink-3">Checking the market…</span>;
  const open = status.market === 'open';
  return (
    <div className="ml-auto text-right text-sm leading-relaxed text-ink-2">
      <div className="text-[15px] text-ink">
        <span aria-hidden className={`mr-2 inline-block size-2.5 rounded-full align-middle ${open ? 'bg-long' : 'bg-ink-3'}`} />
        {open ? (status.inLiquidWindow ? 'Open, liquid window' : 'Open, outside liquid windows') : 'Closed'}
      </div>
      <div>
        Last scan {etTime(status.lastScanAt)}
        {open && <span className="ml-3">{status.scanning ? 'Scanning now' : `Next ${etTime(status.nextScanAt)}`}</span>}
      </div>
      {status.scannerError && <div className="text-short">Scanner: {status.scannerError}</div>}
    </div>
  );
}
