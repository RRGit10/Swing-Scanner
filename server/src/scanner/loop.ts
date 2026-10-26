import type { StatusPayload } from '../api/routes.js';
import { applyScan, endMissing, type SignalSnapshot } from '../history/signals.js';
import { reevaluateHistory } from '../history/reevaluate.js';
import { noteEntryAsks, trackOutcomes, type TrackerDeps } from '../history/tracker.js';
import { lastSessionDate, type MarketCalendarProvider, type TradingDay } from '../market/clock.js';
import { inLiquidWindow, isMarketOpen, nextScanTime } from '../market/timing.js';
import { addDays, etClock, etToUnix, hhmmToMinutes } from '../providers/et.js';
import type { ScannerDb } from '../storage/db.js';
import { sortTickers, type PatternEntry, type TickerEntry } from './group.js';
import { scanTicker, type ScanDeps } from './scan.js';
import type { AppSettings } from './settings.js';

export interface LoopDeps {
  market: MarketCalendarProvider;
  db: ScannerDb;
  scan: ScanDeps;
  /** read at the start of every scan, so saved changes apply from the next scan */
  settings: () => { version: number; settings: AppSettings };
  now?: () => number;
  log?: (msg: string) => void;
}

const HEARTBEAT_MS = 30_000;
const CLOSED_BANNER = 'market closed — last session';

/**
 * Runs scans on the timing rules (2 min in liquid windows, 10 min otherwise, none while closed),
 * persists results and signal history, and tracks outcomes. A 30 s heartbeat re-checks the clock,
 * so a sleeping Mac or a stopped server simply resumes (outcomes are backfilled by the tracker).
 */
export class ScannerLoop {
  private calendar: TradingDay[] = [];
  private calendarDate = '';
  private lastScanAt: number | null = null;
  private nextScanAt: number | null = null;
  private postCloseTrackedFor = '';
  private scanning = false;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: LoopDeps) {
    this.now = deps.now ?? (() => Math.floor(Date.now() / 1000));
    this.log = deps.log ?? ((m) => console.log(`[scanner] ${m}`));
  }

  /** readOnly: serve saved results only (no scans, no tracking) — used by the browser tests. */
  async start(opts: { heartbeat?: boolean; readOnly?: boolean } = {}): Promise<void> {
    await this.refreshCalendar();
    this.lastScanAt = this.deps.db.latestScan()?.startedAt ?? null;
    if (opts.readOnly) return;
    const re = reevaluateHistory(this.deps.db, this.now());
    if (re.changed || re.confirmed) this.log(`history re-evaluated (tracking from first seen): ${re.changed} changed, ${re.confirmed} confirmed`);
    await this.track('startup');
    if (this.isOpen() || !this.deps.db.latestScan()) await this.scanOnce();
    this.plan();
    if (opts.heartbeat !== false) this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  status(): StatusPayload {
    const now = this.now();
    const open = this.isOpen();
    return {
      market: open ? 'open' : 'closed',
      banner: open ? null : CLOSED_BANNER,
      sessionDate: lastSessionDate(this.calendar, now),
      inLiquidWindow: open && inLiquidWindow(now, this.today(), 'scan'),
      lastScanAt: this.lastScanAt,
      nextScanAt: this.nextScanAt,
      scanning: this.scanning,
      scannerError: this.lastError,
    };
  }

  /** One full watchlist scan: save the grouped result, update signal history, track outcomes. */
  async scanOnce(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    const started = this.now();
    try {
      await this.refreshCalendar();
      const { version, settings } = this.deps.settings();
      const today = etClock(started).date;
      const sessionDate = lastSessionDate(this.calendar, started) ?? today;
      const frozenT1 = new Map(this.deps.db.activeSignals().flatMap((r) => (r.frozenT1 != null ? [[r.key, r.frozenT1] as const] : [])));
      const ctx = { today, sessionDate, calendar: this.calendar, settings, frozenT1 };
      const entries: TickerEntry[] = [];
      for (const symbol of settings.watchlist) entries.push(await scanTicker(this.deps.scan, symbol, ctx));

      const sorted = sortTickers(entries);
      const errors = entries.filter((e) => e.error).map((e) => `${e.ticker}: ${e.error}`);
      this.deps.db.saveScan({
        startedAt: started,
        finishedAt: this.now(),
        market: this.isOpen() ? 'open' : 'closed',
        sessionDate,
        payload: { tickers: sorted, settingsVersion: version },
        errors,
      });
      // Closed-market scans are display-only: they never create, trigger, freeze or update history records.
      if (this.isOpen()) {
        this.persistSignals(sorted, started, version, settings.watchlist);
        await noteEntryAsks(this.trackerDeps(), sorted, sessionDate);
      }
      await this.track('scan');
      this.lastScanAt = started;
      this.lastError = errors.length ? errors.join('; ') : null;
      this.log(`scanned ${entries.length} tickers, ${sorted.reduce((n, e) => n + e.patterns.length, 0)} patterns${errors.length ? `, ${errors.length} errors` : ''}`);
    } catch (err) {
      this.lastError = (err as Error).message;
      this.log(`scan failed: ${this.lastError}`);
    } finally {
      this.scanning = false;
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.refreshCalendar();
      const now = this.now();
      const due = this.nextScanAt == null || now >= this.nextScanAt;
      if (this.isOpen() && due) await this.scanOnce();
      const day = this.today();
      if (day && this.postCloseTrackedFor !== day.date && now >= etToUnix(day.date, hhmmToMinutes(day.close)) + this.deps.settings().settings.scanner.postCloseTrackMin * 60) {
        this.postCloseTrackedFor = day.date;
        await this.track('post-close');
      }
      // Re-plan only once the planned scan has passed (or after a scan); re-planning every heartbeat would keep
      // pushing the next scan into the future, so scheduled scans would never run.
      if (due) this.plan();
    } catch (err) {
      this.lastError = (err as Error).message;
    }
  }

  private plan(): void {
    this.nextScanAt = nextScanTime(this.now(), this.today(), this.deps.settings().settings.scanner);
  }

  private persistSignals(entries: TickerEntry[], now: number, version: number, watchlist: string[]): void {
    const db = this.deps.db;
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const p of entry.patterns) {
        seen.add(p.key);
        const { row, events } = applyScan(db.getSignal(p.key), toSnapshot(entry, p, version), now);
        const id = db.upsertSignal(row);
        if (events.length) db.addEvents(id, events);
      }
    }
    // Only end signals of tickers that scanned cleanly: an API error is not "no longer detected".
    const clean = new Set(entries.filter((e) => !e.error).map((e) => e.ticker));
    const listed = new Set(watchlist);
    for (const row of db.activeSignals()) {
      const removed = !listed.has(row.ticker);
      if (seen.has(row.key) || (!removed && !clean.has(row.ticker))) continue;
      const { row: ended, events } = endMissing(row, now, removed ? 'removed from watchlist' : 'no longer detected');
      db.upsertSignal(ended);
      db.addEvents(row.id!, events);
    }
  }

  private async track(reason: string): Promise<void> {
    const { errors } = await trackOutcomes(this.trackerDeps(), this.now());
    if (errors.length) this.log(`outcome tracking (${reason}): ${errors.join('; ')}`);
  }

  private trackerDeps(): TrackerDeps {
    return {
      db: this.deps.db,
      candles: this.deps.scan.candles,
      options: this.deps.scan.options,
      settings: this.deps.settings().settings,
      calendar: () => this.calendar,
    };
  }

  private today(): TradingDay | undefined {
    const date = etClock(this.now()).date;
    return this.calendar.find((d) => d.date === date);
  }

  private isOpen(): boolean {
    return isMarketOpen(this.now(), this.today());
  }

  /** Calendar for the surrounding weeks, refreshed once per ET date (holidays and half days included). */
  private async refreshCalendar(): Promise<void> {
    const today = etClock(this.now()).date;
    if (this.calendarDate === today) return;
    this.calendar = await this.deps.market.getCalendar(addDays(today, -14), addDays(today, 45));
    this.calendarDate = today;
  }
}

function toSnapshot(entry: TickerEntry, p: PatternEntry, settingsVersion: number): SignalSnapshot {
  const pick = 'symbol' in p.contract ? entry.contracts.find((c) => c.contract.symbol === (p.contract as { symbol: string }).symbol) : undefined;
  return {
    key: p.key,
    ticker: entry.ticker,
    type: p.type,
    direction: p.direction,
    timeframes: p.timeframes,
    tradingTimeframe: p.tradingTimeframe,
    state: p.state,
    status: p.status,
    lowerQuality: p.lowerQuality,
    triggerTime: p.triggerTime,
    triggerLevel: p.triggerLevel,
    invalidation: p.invalidation,
    targets: p.targets,
    contract: pick ? { symbol: pick.contract.symbol, ask: pick.contract.ask, expiration: pick.expiration } : null,
    horizonExpiration: p.horizonExpiration,
    settingsVersion,
  };
}
