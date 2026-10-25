import { etClock, etToUnix, hhmmToMinutes } from '../providers/et.js';
import type { ScannerSettings } from '../scanner/settings.js';
import type { TradingDay } from './clock.js';

/** Minutes after midnight ET. */
export interface Window {
  start: number;
  end: number;
}

const MORNING: Window = { start: 9 * 60 + 30, end: 11 * 60 + 30 };

/** 9:30–11:30 plus the final hour of the session (15:00–16:00, or the last hour before an early close). */
export function liquidWindows(day: TradingDay): Window[] {
  const close = hhmmToMinutes(day.close);
  return [MORNING, { start: close - 60, end: close }];
}

function sameDayMinutes(unix: number, day: TradingDay | undefined): number | null {
  if (!day) return null;
  const c = etClock(unix);
  return c.date === day.date ? c.minutes : null;
}

export function isMarketOpen(unix: number, day: TradingDay | undefined): boolean {
  const m = sameDayMinutes(unix, day);
  return m != null && m >= hhmmToMinutes(day!.open) && m < hhmmToMinutes(day!.close);
}

/**
 * 'scan': is a scan at this moment inside a window (end exclusive)?
 * 'close': does a candle closing at this moment count as inside (both ends inclusive)?
 */
export function inLiquidWindow(unix: number, day: TradingDay | undefined, mode: 'scan' | 'close'): boolean {
  const m = sameDayMinutes(unix, day);
  if (m == null) return false;
  return liquidWindows(day!).some((w) => m >= w.start && (mode === 'scan' ? m < w.end : m <= w.end));
}

/** "Lower quality" = the trigger candle closed outside the liquid windows. */
export function lowerQuality(triggerCloseUnix: number, day: TradingDay | undefined): boolean {
  return !inLiquidWindow(triggerCloseUnix, day, 'close');
}

/**
 * Next scan time on `day`: every liquidIntervalMin inside a window, otherIntervalMin otherwise, never
 * skipping past a window start; the open if before it. null when no scan is left today (closed/holiday).
 */
export function nextScanTime(nowUnix: number, day: TradingDay | undefined, s: ScannerSettings): number | null {
  if (!day) return null;
  const now = etClock(nowUnix);
  if (now.date !== day.date) return null;
  const open = hhmmToMinutes(day.open);
  const close = hhmmToMinutes(day.close);
  if (now.minutes < open) return etToUnix(day.date, open);
  if (now.minutes >= close) return null;

  const step = inLiquidWindow(nowUnix, day, 'scan') ? s.liquidIntervalMin : s.otherIntervalMin;
  let next = nowUnix + step * 60;
  for (const w of liquidWindows(day)) {
    const start = etToUnix(day.date, w.start);
    if (start > nowUnix && start < next) next = start;
  }
  return next < etToUnix(day.date, close) ? next : null;
}
