import { describe, expect, it } from 'vitest';
import { ScannerDb } from '../db.js';
import { DEFAULT_APP_SETTINGS } from '../../scanner/settings.js';
import { applyScan, type SignalSnapshot } from '../../history/signals.js';

const NOW = 1_800_000_000;

describe('settings versions', () => {
  it('starts at version 1 with the CLAUDE.md defaults', () => {
    const db = new ScannerDb(':memory:');
    expect(db.currentSettings()).toMatchObject({ version: 1, settings: DEFAULT_APP_SETTINGS, note: 'defaults' });
  });

  it('each save is a new version with what changed; unchanged saves are not versioned', () => {
    const db = new ScannerDb(':memory:');
    const next = structuredClone(DEFAULT_APP_SETTINGS);
    next.contracts.budget = 750;
    expect(db.saveSettings(next, NOW)).toMatchObject({ version: 2, changed: true });
    expect(db.saveSettings(next, NOW + 60)).toMatchObject({ version: 2, changed: false });
    expect(db.currentSettings()).toMatchObject({ version: 2, savedAt: NOW });
    expect(db.settingsVersions().map((v) => [v.version, v.changes.map((c) => c.path)])).toEqual([
      [2, ['contracts.budget']],
      [1, []],
    ]);
  });

  it('reset to defaults is saved as a new version', () => {
    const db = new ScannerDb(':memory:');
    const next = structuredClone(DEFAULT_APP_SETTINGS);
    next.contracts.budget = 750;
    db.saveSettings(next, NOW);
    expect(db.saveSettings(DEFAULT_APP_SETTINGS, NOW + 60, 'reset to defaults')).toMatchObject({ version: 3, changed: true });
    expect(db.currentSettings()).toMatchObject({ version: 3, note: 'reset to defaults', settings: DEFAULT_APP_SETTINGS });
  });
});

describe('signals stamped with the settings version', () => {
  const snap = (key: string, settingsVersion: number): SignalSnapshot => ({
    key, ticker: 'SPY', type: 'double_top', direction: 'bearish', timeframes: ['15m'], tradingTimeframe: '15m', state: 'armed',
    status: 'WATCH', lowerQuality: false, triggerTime: null, triggerLevel: 1, invalidation: 2,
    targets: [{ kind: 'pattern', label: 'T', price: 0.5 }], contract: null, horizonExpiration: null, settingsVersion,
  });

  it('keeps the version in force when first seen, and summarizes per version', () => {
    const db = new ScannerDb(':memory:');
    const first = applyScan(null, snap('a', 1), NOW).row;
    db.upsertSignal({ ...first, outcome: 'win' });
    // seen again under version 2: still version 1
    expect(applyScan(db.getSignal('a'), snap('a', 2), NOW + 60).row.settingsVersion).toBe(1);
    db.upsertSignal({ ...applyScan(null, snap('b', 2), NOW).row, outcome: 'loss' });

    expect(db.historySummary(1).pattern).toMatchObject({ resolved: 1, wins: 1, hitRate: 1 });
    expect(db.historySummary(2).pattern).toMatchObject({ resolved: 1, wins: 0, hitRate: 0 });
    expect(db.historySummary().pattern).toMatchObject({ resolved: 2, wins: 1, hitRate: 0.5 });
  });

  it('migrates an older database that has no settings_version column', async () => {
    const { default: Database } = await import('better-sqlite3');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = `${mkdtempSync(`${tmpdir()}/swing-`)}/old.db`;
    const old = new Database(path);
    old.exec('CREATE TABLE signals (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE)');
    old.close();
    const db = new ScannerDb(path);
    expect(db.columnNames('signals')).toContain('settings_version');
    db.close();
  });
});
