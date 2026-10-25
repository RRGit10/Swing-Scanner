import { etClock } from './et.js';
import type { Candle } from './types.js';

const SESSION_OPEN = 9 * 60 + 30; // 9:30 ET, minutes after midnight
const SESSION_CLOSE = 16 * 60; // 16:00 ET

/** Keep only bars that start inside the regular session (9:30–16:00 ET). */
export function filterRegularHours(candles: Candle[]): Candle[] {
  return candles.filter((c) => {
    const { minutes } = etClock(c.time);
    return minutes >= SESSION_OPEN && minutes < SESSION_CLOSE;
  });
}

/**
 * Combine regular-hours 15m bars into 30m or 1h bars anchored at the 9:30 ET open
 * (1h buckets: 9:30, 10:30, … 15:30 — the last one is a partial 30-minute bar).
 */
export function aggregate15m(candles: Candle[], timeframe: '30m' | '1h'): Candle[] {
  const size = timeframe === '30m' ? 30 : 60;
  const sorted = filterRegularHours(candles).sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  let key = '';

  for (const c of sorted) {
    const { date, minutes } = etClock(c.time);
    const bucketMinutes = SESSION_OPEN + Math.floor((minutes - SESSION_OPEN) / size) * size;
    const bucketKey = `${date} ${bucketMinutes}`;
    const last = out.at(-1);

    if (bucketKey !== key || !last) {
      key = bucketKey;
      out.push({ ...c, time: c.time - (minutes - bucketMinutes) * 60 });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
  }
  return out;
}
