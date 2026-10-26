/**
 * Writes client/e2e/fixtures/patterns.json: one fake ticker per v1 pattern, built from the server's
 * pattern unit-test fixtures, as /api/signals and /api/chart payloads. The browser tests serve these
 * with page.route so every pattern shape is checked in a real browser (live data rarely has all five).
 * Usage: npx tsx scripts/e2e-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as fx from '../src/analysis/__fixtures__/patterns.js';
import * as dg from '../src/analysis/__fixtures__/diagrams.js';
import { classifyLastThree, DEFAULT_CANDLE_SETTINGS } from '../src/analysis/candles.js';
import { emaSet } from '../src/analysis/ema.js';
import { detectPatterns } from '../src/analysis/patterns/index.js';
import type { PatternType } from '../src/analysis/patterns/types.js';
import type { Candle } from '../src/providers/types.js';

const CASES: [ticker: string, type: PatternType, candles: Candle[]][] = [
  ['BULLF', 'bull_flag', fx.bullFlagTriggered],
  ['BEARF', 'bear_flag', fx.mirror(fx.bullFlagTriggered)],
  ['DTOP', 'double_top', fx.doubleTopArmed],
  ['CUPH', 'cup_and_handle', fx.cupHandleFromHandle],
  ['IHS', 'inverse_head_and_shoulders', fx.ihsTriggered],
  // not from the class method
  ['DBOT', 'double_bottom', dg.diagramDoubleBottom],
  ['ICUP', 'inverted_cup_and_handle', dg.diagramInvertedCupAndHandle],
  ['HSTOP', 'head_and_shoulders', dg.diagramHeadShoulders],
];

const tickers = [];
const charts: Record<string, unknown> = {};
for (const [ticker, type, candles] of CASES) {
  const m = detectPatterns(candles).find((x) => x.type === type);
  if (!m) throw new Error(`${type} not detected in its fixture`);
  const key = `${ticker}|${m.type}|${m.direction}|${m.points[0]!.time}`;
  const last = candles.at(-1)!;
  tickers.push({
    ticker, price: last.close, delayedPrice: last.close, emaTable: [], contracts: [], bestStatus: 'WATCH',
    patterns: [{
      key, type: m.type, direction: m.direction, timeframes: ['15m'], tradingTimeframe: '15m', state: m.state, status: 'WATCH',
      lowerQuality: false, triggerTime: m.triggerTime == null ? null : m.triggerTime + 900, triggerLevel: m.triggerLevel,
      invalidation: m.invalidation, targets: [{ kind: 'pattern', label: 'Pattern target', price: m.target }],
      candleLabels: classifyLastThree(candles, DEFAULT_CANDLE_SETTINGS).labels, drawings: { '15m': { points: m.points, lines: m.lines } },
      horizonExpiration: null, dailyEmasInPath: [], ema55Reversal: null,
      contract: { none: 'no contract fits', skippedExpirations: [] },
    }],
  });
  charts[ticker] = {
    ticker, timeframe: '15m', candles, ema: emaSet(candles),
    patterns: [{ key, type: m.type, direction: m.direction, status: 'WATCH', points: m.points, lines: m.lines }],
  };
}

// A ticker with no pattern: candles and EMAs only.
const quiet = fx.candlesOf(fx.ZIGZAG);
tickers.push({ ticker: 'NONE', price: quiet.at(-1)!.close, delayedPrice: quiet.at(-1)!.close, emaTable: [], contracts: [], bestStatus: null, patterns: [] });
charts.NONE = { ticker: 'NONE', timeframe: '15m', candles: quiet, ema: emaSet(quiet), patterns: [] };

const out = fileURLToPath(new URL('../../client/e2e/fixtures/patterns.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('.', 'file://' + out)), { recursive: true });
writeFileSync(out, JSON.stringify({ tickers, charts }, null, 1) + '\n');
console.log(`wrote ${tickers.length} pattern fixtures to ${out}`);
