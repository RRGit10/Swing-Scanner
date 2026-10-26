import Database from 'better-sqlite3';
import type { Outcome, SignalEvent, SignalRow } from '../history/signals.js';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../scanner/settings.js';
import { diffSettings, validateSettings, type SettingsChange } from '../settings/validate.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  market TEXT NOT NULL,
  session_date TEXT,
  payload TEXT NOT NULL,
  errors TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  timeframes TEXT NOT NULL,
  trading_timeframe TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  lower_quality INTEGER NOT NULL,
  trigger_time INTEGER,
  trigger_level REAL NOT NULL,
  invalidation REAL NOT NULL,
  targets TEXT NOT NULL,
  contract_symbol TEXT,
  frozen_at INTEGER,
  frozen_t1 REAL,
  frozen_contract TEXT,
  entry_ask REAL,
  expiration TEXT,
  lowest_entry_ask REAL,
  last_tracked_at INTEGER,
  outcome TEXT NOT NULL,
  outcome_at INTEGER,
  exit_bid REAL,
  exit_ask REAL,
  exit_quote_time TEXT,
  exit_note TEXT,
  gain_pct REAL,
  ended_at INTEGER,
  ended_reason TEXT
);
CREATE TABLE IF NOT EXISTS signal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL REFERENCES signals(id),
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS signal_events_signal ON signal_events(signal_id, id);
CREATE TABLE IF NOT EXISTS settings_versions (
  version INTEGER PRIMARY KEY,
  saved_at INTEGER NOT NULL,
  settings TEXT NOT NULL,
  changes TEXT NOT NULL,
  note TEXT
);
`;

/** Columns added after the first release; added to older databases on open. */
const MIGRATIONS: [table: string, column: string, ddl: string][] = [
  ['signals', 'settings_version', 'ALTER TABLE signals ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 1'],
  ['signals', 'tracked_from', 'ALTER TABLE signals ADD COLUMN tracked_from INTEGER'],
  ['signals', 'pre_checked', 'ALTER TABLE signals ADD COLUMN pre_checked INTEGER NOT NULL DEFAULT 0'],
];

/** camelCase row field → column. JSON fields are (de)serialized; booleans stored as 0/1. */
const COLUMNS: [keyof SignalRow, string, 'json' | 'bool' | 'plain'][] = [
  ['key', 'key', 'plain'], ['ticker', 'ticker', 'plain'], ['type', 'type', 'plain'], ['direction', 'direction', 'plain'],
  ['timeframes', 'timeframes', 'json'], ['tradingTimeframe', 'trading_timeframe', 'plain'], ['firstSeenAt', 'first_seen_at', 'plain'],
  ['lastSeenAt', 'last_seen_at', 'plain'], ['status', 'status', 'plain'], ['lowerQuality', 'lower_quality', 'bool'],
  ['triggerTime', 'trigger_time', 'plain'], ['triggerLevel', 'trigger_level', 'plain'], ['invalidation', 'invalidation', 'plain'],
  ['targets', 'targets', 'json'], ['contractSymbol', 'contract_symbol', 'plain'], ['frozenAt', 'frozen_at', 'plain'],
  ['frozenT1', 'frozen_t1', 'plain'], ['frozenContract', 'frozen_contract', 'plain'], ['entryAsk', 'entry_ask', 'plain'],
  ['expiration', 'expiration', 'plain'], ['lowestEntryAsk', 'lowest_entry_ask', 'plain'], ['lastTrackedAt', 'last_tracked_at', 'plain'],
  ['outcome', 'outcome', 'plain'], ['outcomeAt', 'outcome_at', 'plain'], ['exitBid', 'exit_bid', 'plain'], ['exitAsk', 'exit_ask', 'plain'],
  ['exitQuoteTime', 'exit_quote_time', 'plain'], ['exitNote', 'exit_note', 'plain'], ['gainPct', 'gain_pct', 'plain'],
  ['endedAt', 'ended_at', 'plain'], ['endedReason', 'ended_reason', 'plain'], ['settingsVersion', 'settings_version', 'plain'],
  ['trackedFrom', 'tracked_from', 'plain'], ['preChecked', 'pre_checked', 'bool'],
];

export interface SavedScan {
  startedAt: number;
  finishedAt: number;
  market: 'open' | 'closed';
  sessionDate: string | null;
  payload: unknown;
  errors: string[];
}

export interface SettingsVersion {
  version: number;
  savedAt: number;
  settings: AppSettings;
  changes: SettingsChange[];
  /** e.g. "defaults", "reset to defaults" */
  note: string | null;
}

export interface OutcomeCounts {
  resolved: number;
  wins: number;
  losses: number;
  expired: number;
  /** wins / resolved (T1 touched before invalidation and before expiration); null when nothing resolved */
  hitRate: number | null;
}

export interface HistorySummary {
  total: number;
  /** pending + resolved */
  triggered: number;
  pending: number;
  neverTriggered: number;
  noContract: number;
  /** T1 or invalidation reached before first seen: not counted in either hit rate */
  alreadyResolved: number;
  /** every triggered signal, judged on the stock */
  pattern: OutcomeCounts;
  /** triggered signals that had a contract frozen, with the indicative option gain */
  tradeable: OutcomeCounts & { avgGainPct: number | null; gainSamples: number };
}

type DbRow = Record<string, unknown>;

export class ScannerDb {
  private readonly db: Database.Database;

  /** `path` = file path, or ':memory:' for tests. */
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
    for (const [table, column, ddl] of MIGRATIONS) if (!this.columnNames(table).includes(column)) this.db.exec(ddl);
  }

  columnNames(table: string): string[] {
    return (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  }

  /** Current settings; version 1 = the CLAUDE.md defaults, created on first use. */
  currentSettings(): SettingsVersion {
    const latest = this.db.prepare('SELECT * FROM settings_versions ORDER BY version DESC LIMIT 1').get() as DbRow | undefined;
    if (latest) return toSettingsVersion(latest);
    this.db
      .prepare('INSERT INTO settings_versions (version, saved_at, settings, changes, note) VALUES (1, ?, ?, ?, ?)')
      .run(Math.floor(Date.now() / 1000), JSON.stringify(DEFAULT_APP_SETTINGS), '[]', 'defaults');
    return this.currentSettings();
  }

  /** Saves a new version if anything changed (with the list of changes). */
  saveSettings(settings: AppSettings, now: number, note: string | null = null): { version: number; changed: boolean } {
    const current = this.currentSettings();
    const changes = diffSettings(current.settings, settings);
    if (!changes.length) return { version: current.version, changed: false };
    const version = current.version + 1;
    this.db
      .prepare('INSERT INTO settings_versions (version, saved_at, settings, changes, note) VALUES (?, ?, ?, ?, ?)')
      .run(version, now, JSON.stringify(settings), JSON.stringify(changes), note);
    return { version, changed: true };
  }

  settingsVersions(): SettingsVersion[] {
    return (this.db.prepare('SELECT * FROM settings_versions ORDER BY version DESC').all() as DbRow[]).map(toSettingsVersion);
  }

  close(): void {
    this.db.close();
  }

  saveScan(scan: SavedScan): void {
    this.db
      .prepare('INSERT INTO scans (started_at, finished_at, market, session_date, payload, errors) VALUES (?, ?, ?, ?, ?, ?)')
      .run(scan.startedAt, scan.finishedAt, scan.market, scan.sessionDate, JSON.stringify(scan.payload), JSON.stringify(scan.errors));
  }

  latestScan(): SavedScan | null {
    const r = this.db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get() as DbRow | undefined;
    if (!r) return null;
    return {
      startedAt: r.started_at as number,
      finishedAt: r.finished_at as number,
      market: r.market as 'open' | 'closed',
      sessionDate: r.session_date as string | null,
      payload: JSON.parse(r.payload as string),
      errors: JSON.parse(r.errors as string),
    };
  }

  /** Insert or update by key; returns the row id. */
  upsertSignal(row: SignalRow): number {
    const values = COLUMNS.map(([field, , kind]) => {
      const v = row[field];
      return kind === 'json' ? JSON.stringify(v) : kind === 'bool' ? (v ? 1 : 0) : (v ?? null);
    });
    const cols = COLUMNS.map(([, c]) => c);
    const updates = cols.filter((c) => c !== 'key').map((c) => `${c} = excluded.${c}`).join(', ');
    this.db
      .prepare(`INSERT INTO signals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(key) DO UPDATE SET ${updates}`)
      .run(...values);
    return (this.db.prepare('SELECT id FROM signals WHERE key = ?').get(row.key) as { id: number }).id;
  }

  getSignal(key: string): SignalRow | null {
    const r = this.db.prepare('SELECT * FROM signals WHERE key = ?').get(key) as DbRow | undefined;
    return r ? toRow(r) : null;
  }

  /** Signals not yet ended (seen in recent scans). */
  activeSignals(): SignalRow[] {
    return (this.db.prepare('SELECT * FROM signals WHERE ended_at IS NULL ORDER BY id').all() as DbRow[]).map(toRow);
  }

  /** Triggered trades still being tracked, or resolved win/loss still waiting for the exit quote. */
  pendingOutcomes(): SignalRow[] {
    const sql = `SELECT * FROM signals WHERE outcome = 'pending'
      OR (outcome IN ('win', 'loss') AND exit_bid IS NULL AND exit_note IS NULL) ORDER BY id`;
    return (this.db.prepare(sql).all() as DbRow[]).map(toRow);
  }

  /** Triggered rows stored before tracking started at first seen (no tracking start yet). */
  rowsToReevaluate(): SignalRow[] {
    return (this.db.prepare('SELECT * FROM signals WHERE frozen_at IS NOT NULL AND tracked_from IS NULL ORDER BY id').all() as DbRow[]).map(toRow);
  }

  allSignals(): SignalRow[] {
    return (this.db.prepare('SELECT * FROM signals ORDER BY first_seen_at DESC, id DESC').all() as DbRow[]).map(toRow);
  }

  addEvents(signalId: number, events: SignalEvent[]): void {
    const stmt = this.db.prepare('INSERT INTO signal_events (signal_id, at, kind, from_value, to_value, detail) VALUES (?, ?, ?, ?, ?, ?)');
    const insert = this.db.transaction((list: SignalEvent[]) => {
      for (const e of list) stmt.run(signalId, e.at, e.kind, e.from, e.to, e.detail == null ? null : JSON.stringify(e.detail));
    });
    insert(events);
  }

  events(signalId: number): SignalEvent[] {
    const rows = this.db.prepare('SELECT * FROM signal_events WHERE signal_id = ? ORDER BY id').all(signalId) as DbRow[];
    return rows.map((r) => ({
      kind: r.kind as SignalEvent['kind'],
      at: r.at as number,
      from: r.from_value as string | null,
      to: r.to_value as string | null,
      detail: r.detail == null ? null : JSON.parse(r.detail as string),
    }));
  }

  /** Summary per pattern type that has signals (all time, or only signals first seen under `version`). */
  historyByPattern(version?: number): Record<string, HistorySummary> {
    const scope = version == null ? '' : `WHERE settings_version = ${Math.floor(version)}`;
    const types = (this.db.prepare(`SELECT DISTINCT type FROM signals ${scope} ORDER BY type`).all() as { type: string }[]).map((r) => r.type);
    return Object.fromEntries(types.map((t) => [t, this.historySummary(version, t)]));
  }

  /** All-time summary, or only signals first seen under `version`; optionally one pattern type. */
  historySummary(version?: number, type?: string): HistorySummary {
    const typeScope = type == null ? '' : `type = '${type.replace(/[^a-z_]/g, '')}'`;
    const scope = [version == null ? '' : `settings_version = ${Math.floor(version)}`, typeScope].filter(Boolean).join(' AND ');
    const where = (...conds: string[]) => {
      const all = [scope, ...conds].filter(Boolean);
      return all.length ? `WHERE ${all.join(' AND ')}` : '';
    };
    const countBy = (w: string) =>
      Object.fromEntries(
        (this.db.prepare(`SELECT outcome, COUNT(*) n FROM signals ${w} GROUP BY outcome`).all() as { outcome: Outcome; n: number }[]).map(
          (r) => [r.outcome, r.n],
        ),
      ) as Partial<Record<Outcome, number>>;
    const outcomes = (c: Partial<Record<Outcome, number>>): OutcomeCounts => {
      const resolved = (c.win ?? 0) + (c.loss ?? 0) + (c.expired ?? 0);
      return { resolved, wins: c.win ?? 0, losses: c.loss ?? 0, expired: c.expired ?? 0, hitRate: resolved ? (c.win ?? 0) / resolved : null };
    };
    const all = countBy(where());
    const pattern = outcomes(all);
    const gains = this.db
      .prepare(
        `SELECT AVG(gain_pct) avg, COUNT(gain_pct) cnt FROM signals ${where("frozen_contract IS NOT NULL", "outcome IN ('win', 'loss', 'expired')", 'gain_pct IS NOT NULL')}`,
      )
      .get() as { avg: number | null; cnt: number };
    return {
      total: Object.values(all).reduce((a, b) => a + (b ?? 0), 0),
      triggered: pattern.resolved + (all.pending ?? 0),
      pending: all.pending ?? 0,
      neverTriggered: all.never_triggered ?? 0,
      noContract: all.no_contract ?? 0,
      alreadyResolved: all.already_resolved ?? 0,
      pattern,
      tradeable: { ...outcomes(countBy(where('frozen_contract IS NOT NULL'))), avgGainPct: gains.cnt ? gains.avg : null, gainSamples: gains.cnt },
    };
  }
}

function toSettingsVersion(r: DbRow): SettingsVersion {
  // Fill fields added after this version was saved with today's defaults.
  const parsed = validateSettings(JSON.parse(r.settings as string), DEFAULT_APP_SETTINGS);
  return {
    version: r.version as number,
    savedAt: r.saved_at as number,
    settings: parsed.ok ? parsed.settings : DEFAULT_APP_SETTINGS,
    changes: JSON.parse(r.changes as string),
    note: (r.note as string | null) ?? null,
  };
}

function toRow(r: DbRow): SignalRow {
  const row: Record<string, unknown> = { id: r.id };
  for (const [field, col, kind] of COLUMNS) {
    const v = r[col];
    row[field] = kind === 'json' ? JSON.parse(v as string) : kind === 'bool' ? v === 1 : v;
  }
  return row as unknown as SignalRow;
}
