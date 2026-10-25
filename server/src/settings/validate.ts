import type { AppSettings } from '../scanner/settings.js';
import { DEFAULT_APP_SETTINGS } from '../scanner/settings.js';

type Result = { ok: true; settings: AppSettings } | { ok: false; errors: string[] };

/** Editable numeric settings: [path, min, max, whole number]. Scanner timing and rate limits are not editable. */
const NUMERIC: [string, number, number, boolean?][] = [
  ['contracts.budget', 50, 100000],
  ['contracts.minPremium', 0.05, 10],
  ['contracts.minDte', 0, 30, true],
  ['contracts.maxDte', 1, 60, true],
  ['contracts.gradeA', 0.01, 0.99],
  ['contracts.gradeB', 0.01, 0.99],
  ['contracts.gradeC', 0.01, 0.99],
  ['contracts.minOpenInterest', 0, 100000, true],
  ['contracts.gradeCMinOpenInterest', 0, 100000, true],
  ['contracts.entryZoneFraction', 0.05, 1],
  ['contracts.thetaDays', 0, 5],
  ['ema.reversalTolerance', 0.0001, 0.05],
  ['patterns.pivotN', 1, 10, true],
  ['patterns.atrPeriod', 5, 50, true],
  ['patterns.lookback', 50, 500, true],
  ['patterns.recentTriggerBars', 1, 10, true],
  ['patterns.maxSpanDays', 1, 20, true],
  ['patterns.peakTolAtr', 0.05, 10],
  ['patterns.dipDepthAtr', 0.05, 10],
  ['patterns.poleMinAtr', 0.05, 10],
  ['patterns.poleMaxBars', 2, 50, true],
  ['patterns.flagMinBars', 1, 30, true],
  ['patterns.flagMaxBars', 1, 30, true],
  ['patterns.flagMaxRetrace', 0.1, 0.9],
  ['patterns.cupMinDepthAtr', 0.05, 10],
  ['patterns.rimTolAtr', 0.05, 10],
  ['patterns.cupMinWidth', 5, 100, true],
  ['patterns.handleMaxFraction', 0.1, 1],
  ['patterns.handleMinDepthFraction', 0, 0.9],
  ['patterns.shoulderTolAtr', 0.05, 10],
  ['patterns.headMinAtr', 0.05, 10],
  ['candles.runLookback', 3, 50, true],
  ['candles.dojiMaxBody', 0.01, 0.5],
  ['candles.boomMaxWick', 0.01, 0.5],
  ['candles.boomBodyMultiple', 1, 5],
  ['candles.boomAvgPeriod', 5, 100, true],
  ['candles.hammerMaxBody', 0.05, 0.9],
  ['candles.hammerWickToBody', 1, 10],
  ['candles.hammerMaxOppositeWick', 0.01, 0.5],
  ['candles.spinningMaxBody', 0.05, 0.9],
];

const MAX_TICKERS = 25;
const TICKER = /^[A-Z][A-Z.]{0,9}$/;

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce((o, k) => o[k] as Record<string, unknown>, obj);
  parent[last] = value;
}

/**
 * Validate a full or partial settings body against `current`: missing fields keep their current value,
 * unknown fields are ignored. Returns every problem at once, in plain words.
 */
export function validateSettings(body: unknown, current: AppSettings = DEFAULT_APP_SETTINGS): Result {
  const next = structuredClone(current) as unknown as Record<string, unknown>;
  const errors: string[] = [];

  for (const [path, min, max, whole] of NUMERIC) {
    const v = getPath(body, path);
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${path}: must be a number`);
    else if (whole && !Number.isInteger(v)) errors.push(`${path}: must be a whole number`);
    else if (v < min || v > max) errors.push(`${path}: must be between ${min} and ${max}`);
    else setPath(next, path, v);
  }

  const markers = getPath(body, 'contracts.profitMarkers');
  if (markers !== undefined) {
    const ok =
      Array.isArray(markers) &&
      markers.length >= 1 &&
      markers.length <= 5 &&
      markers.every((m, i) => typeof m === 'number' && m >= 0.05 && m <= 5 && (i === 0 || m > (markers[i - 1] as number)));
    if (ok) setPath(next, 'contracts.profitMarkers', [...markers]);
    else errors.push('contracts.profitMarkers: 1 to 5 increasing values between 0.05 and 5');
  }

  const list = getPath(body, 'watchlist');
  if (list !== undefined) {
    if (!Array.isArray(list) || list.some((t) => typeof t !== 'string')) {
      errors.push('watchlist: must be a list of ticker symbols');
    } else {
      const tickers = [...new Set(list.map((t: string) => t.trim().toUpperCase()).filter(Boolean))];
      const bad = tickers.filter((t) => !TICKER.test(t));
      for (const t of bad) errors.push(`watchlist: "${t}" is not a ticker symbol`);
      if (tickers.length === 0) errors.push('watchlist: add at least 1 ticker');
      else if (tickers.length > MAX_TICKERS) errors.push(`watchlist: at most ${MAX_TICKERS} tickers`);
      else if (!bad.length) next.watchlist = tickers;
    }
  }

  const s = next as unknown as AppSettings;
  if (!errors.length) {
    if (s.contracts.maxDte < s.contracts.minDte) {
      errors.push(`contracts.maxDte: must be at least the minimum days to expiration (${s.contracts.minDte})`);
    }
    if (s.contracts.gradeCMinOpenInterest < s.contracts.minOpenInterest) {
      errors.push(`contracts.gradeCMinOpenInterest: must be at least the OI floor (${s.contracts.minOpenInterest})`);
    }
    if (!(s.contracts.gradeA > s.contracts.gradeB && s.contracts.gradeB > s.contracts.gradeC)) {
      errors.push('contracts: delta grades must go A > B > C');
    }
    if (s.patterns.flagMaxBars < s.patterns.flagMinBars) {
      errors.push(`patterns.flagMaxBars: must be at least the minimum flag length (${s.patterns.flagMinBars})`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, settings: s };
}

export interface SettingsChange {
  path: string;
  from: unknown;
  to: unknown;
}

function leaves(obj: unknown, prefix = ''): [string, unknown][] {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return [[prefix, obj]];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

/** Every leaf setting whose value differs (arrays compared as a whole). */
export function diffSettings(before: AppSettings, after: AppSettings): SettingsChange[] {
  const old = new Map(leaves(before));
  return leaves(after)
    .filter(([path, v]) => JSON.stringify(old.get(path)) !== JSON.stringify(v))
    .map(([path, to]) => ({ path, from: old.get(path), to }));
}
