import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { ChartPayload, PatternEntry } from '../api/types';
import { PatternShapes } from '../chart/PatternShapes';
import { buildPatternDrawing, candleTags } from '../chart/shapes';

const EMA_PERIODS = ['13', '48', '55', '200'] as const;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const withAlpha = (hex: string, a: number) => `rgba(${rgb(hex).join(', ')}, ${a})`;
/** Opaque blend of `tint` over `base` (tag backgrounds that stay readable over lines). */
const blend = (base: string, tint: string, t: number) => {
  const a = rgb(base);
  const b = rgb(tint);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(', ')})`;
};

// Display-only time zone: data keeps real UTC timestamps; formatters show New York time (per the
// lightweight-charts skill: pre-shifting timestamps changes chart semantics). Daily bars are stamped
// 00:00 UTC of their trading date, so they are formatted in UTC.
const nyTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nyDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const nyFull = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const utcDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const utcFull = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const yearOf = (d: Date) => String(d.getUTCFullYear());

function formatters(intraday: boolean) {
  return {
    tick: (time: Time, type: TickMarkType) => {
      if (typeof time !== 'number') return String(time);
      const d = new Date(time * 1000);
      if (type === TickMarkType.Year) return yearOf(d);
      if (!intraday || type === TickMarkType.Month || type === TickMarkType.DayOfMonth) return (intraday ? nyDay : utcDay).format(d);
      return nyTime.format(d);
    },
    crosshair: (time: Time) => (typeof time === 'number' ? (intraday ? nyFull : utcFull).format(new Date(time * 1000)).replace(',', '') : String(time)),
  };
}

function useColorScheme(): 'light' | 'dark' {
  const query = '(prefers-color-scheme: dark)';
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => (matchMedia(query).matches ? 'dark' : 'light'));
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return scheme;
}

interface ChartRefs {
  chart: IChartApi;
  candles: ISeriesApi<'Candlestick'>;
  emas: Record<(typeof EMA_PERIODS)[number], ISeriesApi<'Line'>>;
  shapes: PatternShapes;
  levels: IPriceLine[];
  /** price range of the pattern's levels, read by the (cheap) autoscale provider */
  levelRange: { min: number; max: number } | null;
}

/**
 * Candles + 13/48/55/200 EMAs + the selected pattern drawn as its shape (a series primitive), with
 * trigger/targets/invalidation as labeled price levels and short tags for the last 3 candles.
 * The chart is created once; data, shapes and colors update in place.
 */
export function PriceChart({ chart: data, pattern }: { chart: ChartPayload; pattern: PatternEntry | null }) {
  const host = useRef<HTMLDivElement>(null);
  const refs = useRef<ChartRefs | null>(null);
  const scheme = useColorScheme();
  const [summary, setSummary] = useState('');

  // Create once.
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      // TradingView attribution, as the lightweight-charts license requires.
      layout: { background: { type: ColorType.Solid, color: css('--surface') }, fontFamily: 'Archivo, sans-serif', attributionLogo: true },
      timeScale: { secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 },
    });
    const r: ChartRefs = {
      chart,
      candles: chart.addSeries(CandlestickSeries, {
        borderVisible: false,
        priceLineVisible: false,
        // keep targets and invalidation in view
        autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const res = original();
          const lv = refs.current?.levelRange;
          if (!res || !lv) return res;
          return { ...res, priceRange: { minValue: Math.min(res.priceRange.minValue, lv.min), maxValue: Math.max(res.priceRange.maxValue, lv.max) } };
        },
      }),
      emas: {} as ChartRefs['emas'],
      shapes: new PatternShapes(),
      levels: [],
      levelRange: null,
    };
    for (const p of EMA_PERIODS) {
      r.emas[p] = chart.addSeries(LineSeries, { lineWidth: p === '55' ? 2 : 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: p });
    }
    r.candles.attachPrimitive(r.shapes);
    refs.current = r;
    return () => {
      refs.current = null;
      chart.remove();
    };
  }, []);

  // Data: replace only when the dataset or the framed pattern changes.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const intraday = data.timeframe !== '1d';
    const f = formatters(intraday);
    r.chart.applyOptions({ timeScale: { timeVisible: intraday, tickMarkFormatter: f.tick }, localization: { timeFormatter: f.crosshair } });
    r.candles.setData(data.candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    for (const p of EMA_PERIODS) {
      r.emas[p].setData(data.ema[p].flatMap((v, i) => (v == null ? [] : [{ time: data.candles[i]!.time as UTCTimestamp, value: v }])));
    }
    // Frame the pattern (from its first key point, with some lead-in); otherwise the latest candles.
    const n = data.candles.length;
    const firstPoint = pattern ? data.patterns.find((p) => p.key === pattern.key)?.points[0]?.time : undefined;
    const startIdx = firstPoint != null ? data.candles.findIndex((k) => k.time >= firstPoint) : -1;
    const from = startIdx >= 0 ? Math.max(0, startIdx - 25) : Math.max(0, n - (intraday ? 110 : 160));
    r.chart.timeScale().setVisibleLogicalRange({ from, to: n + 4 });
  }, [data, pattern]);

  // Colors, pattern shape, price levels and candle tags (rebuilt on data, pattern or theme change).
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const long = css('--long');
    const short = css('--short');
    const ink3 = css('--ink-3');
    const rule = css('--rule');
    const surface = css('--surface');
    const dirColor = pattern?.direction === 'bearish' ? short : long;
    const dark = scheme === 'dark';

    r.chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: surface }, textColor: css('--ink-2') },
      grid: { vertLines: { color: `${rule}55` }, horzLines: { color: `${rule}55` } },
      rightPriceScale: { borderColor: rule },
      timeScale: { borderColor: rule },
    });
    r.candles.applyOptions({ upColor: long, downColor: short, wickUpColor: long, wickDownColor: short });
    for (const p of EMA_PERIODS) r.emas[p].applyOptions({ color: css(`--ema-${p}`) });

    for (const l of r.levels) r.candles.removePriceLine(l);
    r.levels = [];
    r.levelRange = null;

    const points = pattern && data.timeframe !== '1d' ? data.patterns.find((p) => p.key === pattern.key)?.points : undefined;
    const drawing = pattern && points ? buildPatternDrawing({ candles: data.candles, points, pattern }) : null;
    if (pattern && drawing) {
      const levels = [
        { price: pattern.triggerLevel, color: css('--amber'), style: LineStyle.Dashed, title: 'Trigger' },
        ...pattern.targets.map((t, i) => ({ price: t.price, color: dirColor, style: LineStyle.Solid, title: `T${i + 1}` })),
        { price: pattern.invalidation, color: ink3, style: LineStyle.Dotted, title: 'Invalidation' },
      ];
      r.levels = levels.map((l) => r.candles.createPriceLine({ price: l.price, color: l.color, lineStyle: l.style, lineWidth: 1, axisLabelVisible: true, title: l.title }));
      const prices = levels.map((l) => l.price);
      r.levelRange = { min: Math.min(...prices), max: Math.max(...prices) };
    }

    const tags = pattern && data.timeframe === pattern.tradingTimeframe ? candleTags(pattern.candleLabels, data.candles) : [];
    r.shapes.setData({
      drawing,
      candleTags: tags,
      candles: data.candles,
      emas: EMA_PERIODS.map((p) => data.ema[p]),
      levels: pattern && drawing ? [pattern.triggerLevel, ...pattern.targets.map((t) => t.price), pattern.invalidation] : [],
      style: {
        stroke: dirColor,
        fill: withAlpha(dirColor, dark ? 0.18 : 0.12),
        tagFill: blend(surface, dirColor, dark ? 0.28 : 0.16),
        candleTagFill: surface,
        candleTagBorder: ink3,
        text: css('--ink'),
      },
    });
    const candleText = tags.length ? ` Candle tags: ${tags.map((t) => t.text).join(', ')}.` : '';
    setSummary(drawing ? `${drawing.summary}${candleText}` : pattern ? `${pattern.type.replaceAll('_', ' ')} is not drawn on this time frame.${candleText}` : '');
  }, [data, pattern, scheme]);

  return (
    <>
      <div ref={host} className="h-[420px] w-full md:h-[520px]" data-testid="price-chart" />
      <p className="sr-only" data-testid="pattern-drawing" aria-live="polite">
        {summary}
      </p>
    </>
  );
}
