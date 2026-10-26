import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, useResource } from '../api/client';
import type { AppSettings, SettingsPayload } from '../api/types';
import { etDateTime } from '../lib/format';

/** One editable number. `scale` converts stored fractions to what people type (0.002 → 0.2 %). */
interface Field {
  path: string;
  label: string;
  help?: string;
  unit?: string;
  scale?: number;
  step?: number;
}

const CORE: { title: string; fields: Field[] }[] = [
  {
    title: 'Budget and contracts',
    fields: [
      { path: 'contracts.budget', label: 'Budget per trade', unit: '$', help: 'Ask × 100 must fit this.', step: 50 },
      { path: 'contracts.minDte', label: 'Minimum days to expiration', unit: 'days' },
      { path: 'contracts.maxDte', label: 'Maximum days to expiration', unit: 'days' },
      { path: 'contracts.minOpenInterest', label: 'Open interest floor', help: 'Contracts below this are skipped, every grade.', step: 50 },
      { path: 'contracts.gradeCMinOpenInterest', label: 'Open interest for grade C', step: 100 },
    ],
  },
  {
    title: 'Chart reading',
    fields: [
      { path: 'ema.reversalTolerance', label: '55 EMA reversal tolerance', unit: '%', scale: 100, step: 0.05, help: 'How close the touch candle must come to the 55 EMA.' },
      { path: 'patterns.pivotN', label: 'Pivot bars each side', help: 'Swing highs and lows need this many bars on each side.' },
      { path: 'patterns.maxSpanDays', label: 'Longest pattern', unit: 'trading days' },
    ],
  },
];

const ADVANCED: { title: string; fields: Field[] }[] = [
  {
    title: 'Contracts',
    fields: [
      { path: 'contracts.minPremium', label: 'Lowest contract price', unit: '$', step: 0.05 },
      { path: 'contracts.gradeA', label: 'Grade A from delta', step: 0.01 },
      { path: 'contracts.gradeB', label: 'Grade B from delta', step: 0.01 },
      { path: 'contracts.gradeC', label: 'Grade C from delta', step: 0.01 },
      { path: 'contracts.entryZoneFraction', label: 'Entry zone', unit: '% of day range', scale: 100, step: 5 },
      { path: 'contracts.thetaDays', label: 'Days of theta in the estimate', step: 0.5 },
    ],
  },
  {
    title: 'Patterns',
    fields: [
      { path: 'patterns.lookback', label: 'Candles searched', step: 10 },
      { path: 'patterns.recentTriggerBars', label: 'A trigger stays new for', unit: 'candles' },
      { path: 'patterns.atrPeriod', label: 'ATR period (tolerance ruler)' },
      { path: 'patterns.peakTolAtr', label: 'Double top: peaks within', unit: '× ATR', step: 0.1 },
      { path: 'patterns.dipDepthAtr', label: 'Double top: dip at least', unit: '× ATR', step: 0.1 },
      { path: 'patterns.poleMinAtr', label: 'Flag: pole at least', unit: '× ATR', step: 0.1 },
      { path: 'patterns.poleMaxBars', label: 'Flag: pole within', unit: 'candles' },
      { path: 'patterns.flagMinBars', label: 'Flag: shortest flag', unit: 'candles' },
      { path: 'patterns.flagMaxBars', label: 'Flag: longest flag', unit: 'candles' },
      { path: 'patterns.flagPoleMultiple', label: 'Flag: at most', unit: '× the pole candles', step: 0.5 },
      { path: 'patterns.flagMaxSlopeAtr', label: 'Flag: slope against the pole, at most', unit: '× ATR per candle', step: 0.05 },
      { path: 'patterns.flagMaxHeightFraction', label: 'Flag: channel height at most', unit: '% of pole', scale: 100, step: 5 },
      { path: 'patterns.flagMaxRetrace', label: 'Flag: deepest pullback', unit: '% of pole', scale: 100, step: 5 },
      { path: 'patterns.cupMinDepthAtr', label: 'Cup: depth at least', unit: '× ATR', step: 0.1 },
      { path: 'patterns.rimTolAtr', label: 'Cup: rims within (neckline tilt)', unit: '× ATR', step: 0.1 },
      { path: 'patterns.cupMaxAvgHeight', label: 'Cup: rounded, average height at most', unit: '% of depth', scale: 100, step: 1 },
      { path: 'patterns.cupMinWidth', label: 'Cup: width at least', unit: 'candles' },
      { path: 'patterns.handleMaxFraction', label: 'Cup: longest handle', unit: '% of cup width', scale: 100, step: 5 },
      { path: 'patterns.handleMinDepthFraction', label: 'Cup: handle low above', unit: '% of depth', scale: 100, step: 5 },
      { path: 'patterns.shoulderTolAtr', label: 'Inverse H&S: shoulders within', unit: '× ATR', step: 0.1 },
      { path: 'patterns.headMinAtr', label: 'Inverse H&S: head below shoulder by', unit: '× ATR', step: 0.1 },
    ],
  },
  {
    title: 'Candles',
    fields: [
      { path: 'candles.runLookback', label: 'Run-up / drop lookback', unit: 'candles' },
      { path: 'candles.dojiMaxBody', label: 'Doji: body under', unit: '% of range', scale: 100 },
      { path: 'candles.boomMaxWick', label: 'Boom boom: each wick under', unit: '% of range', scale: 100 },
      { path: 'candles.boomBodyMultiple', label: 'Boom boom: body over', unit: '× average body', step: 0.1 },
      { path: 'candles.boomAvgPeriod', label: 'Boom boom: average of', unit: 'candles' },
      { path: 'candles.hammerMaxBody', label: 'Hammer: body at most', unit: '% of range', scale: 100 },
      { path: 'candles.hammerWickToBody', label: 'Hammer: long wick at least', unit: '× body', step: 0.5 },
      { path: 'candles.hammerMaxOppositeWick', label: 'Hammer: other wick at most', unit: '% of range', scale: 100 },
      { path: 'candles.spinningMaxBody', label: 'Spinning top: body at most', unit: '% of range', scale: 100 },
    ],
  },
];

const ALL_FIELDS = [...CORE, ...ADVANCED].flatMap((s) => s.fields);

const get = (obj: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj) as number;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Form = Record<string, string>;

function toForm(s: AppSettings): Form {
  const f: Form = {};
  for (const fd of ALL_FIELDS) f[fd.path] = String(round(get(s, fd.path) * (fd.scale ?? 1)));
  f.watchlist = s.watchlist.join(', ');
  f.profitMarkers = s.contracts.profitMarkers.map((m) => round(m * 100)).join(', ');
  return f;
}

function fromForm(f: Form): unknown {
  const body: Record<string, Record<string, unknown>> = { contracts: {}, patterns: {}, candles: {}, ema: {} };
  for (const fd of ALL_FIELDS) {
    const [group, key] = fd.path.split('.') as [string, string];
    const n = f[fd.path]!.trim() === '' ? NaN : Number(f[fd.path]);
    body[group]![key] = Number.isFinite(n) ? round(n / (fd.scale ?? 1)) : null;
  }
  body.contracts!.profitMarkers = f.profitMarkers!.split(/[\s,]+/).filter(Boolean).map((m) => round(Number(m) / 100));
  return { ...body, watchlist: f.watchlist!.split(/[\s,]+/).filter(Boolean) };
}

type Message = { tone: 'ok' | 'error'; text: string; errors?: string[] };

export function Settings() {
  const { data, error, reload } = useResource<SettingsPayload>('/api/settings');
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (data) setForm(toForm(data.settings));
  }, [data]);

  if (error) return <p className="text-short">{error}</p>;
  if (!data || !form) return <p className="text-ink-3">Loading settings…</p>;

  const set = (path: string, value: string) => setForm({ ...form, [path]: value });

  async function save() {
    setBusy(true);
    try {
      const r = await api<SettingsPayload>('/api/settings', { method: 'PUT', body: fromForm(form!) });
      setMessage(r.changed ? { tone: 'ok', text: `Saved as version ${r.version}. Applies from the next scan.` } : { tone: 'ok', text: 'Nothing changed, so no new version was saved.' });
      reload();
    } catch (e) {
      const errors = e instanceof ApiError ? ((e.body as { errors?: string[] })?.errors ?? []) : [];
      setMessage({ tone: 'error', text: errors.length ? 'Settings not saved. Fix these and save again:' : `Settings not saved: ${(e as Error).message}`, errors });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const r = await api<SettingsPayload>('/api/settings/reset', { method: 'POST' });
      setMessage({ tone: 'ok', text: r.changed ? `Reset to the defaults as version ${r.version}. Applies from the next scan.` : 'Already on the defaults, so no new version was saved.' });
      setConfirmReset(false);
      reload();
    } catch (e) {
      setMessage({ tone: 'error', text: `Reset failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const fieldsGrid = (fields: Field[]) => (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((fd) => (
        <NumberField key={fd.path} field={fd} value={form[fd.path]!} defaultValue={round(get(data.defaults, fd.path) * (fd.scale ?? 1))} onChange={(v) => set(fd.path, v)} />
      ))}
    </div>
  );

  return (
    <form
      className="max-w-5xl"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <span className="text-sm text-ink-2">
          Version {data.version}, saved {etDateTime(data.savedAt)}
          {data.note ? ` (${data.note})` : ''}
        </span>
      </div>
      <p className="mt-2 max-w-prose text-ink-2">Changes apply from the next scan. Each save becomes a new settings version, so History can show results per version.</p>

      <Section title="Watchlist">
        <label className="block max-w-2xl">
          <span className="text-sm text-ink-2">Tickers, separated by commas or spaces (up to 25)</span>
          <input
            name="watchlist"
            value={form.watchlist}
            onChange={(e) => set('watchlist', e.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2 uppercase"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </Section>

      {CORE.map((s) => (
        <Section key={s.title} title={s.title}>
          {fieldsGrid(s.fields)}
        </Section>
      ))}

      <Section title="Spreads">
        <label className="flex items-center gap-3 text-ink-3">
          <input type="checkbox" disabled className="size-4" />
          Spreads: not part of the core method. Not available in v1.
        </label>
      </Section>

      <details className="mt-8 border-t border-rule pt-5">
        <summary className="cursor-pointer text-lg font-semibold">Advanced</summary>
        <p className="mt-1 text-sm text-ink-2">Thresholds behind the pattern, candle and contract rules. The defaults are the decided CLAUDE.md values.</p>
        {ADVANCED.map((s) => (
          <Section key={s.title} title={s.title} small>
            {fieldsGrid(s.fields)}
          </Section>
        ))}
        <Section title="Profit markers" small>
          <label className="block max-w-sm">
            <span className="text-sm text-ink-2">Percent gains, separated by commas</span>
            <input value={form.profitMarkers} onChange={(e) => set('profitMarkers', e.target.value)} className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2" />
          </label>
        </Section>
      </details>

      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-rule bg-paper py-4">
        <button type="submit" disabled={busy} className="rounded-sm bg-ink px-4 py-2 font-semibold text-paper disabled:opacity-50">
          Save settings
        </button>
        {!confirmReset ? (
          <button type="button" disabled={busy} onClick={() => setConfirmReset(true)} className="rounded-sm border border-rule px-4 py-2 text-ink-2 hover:border-ink-2">
            Reset to defaults
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-sm" role="alert">
            Replace every setting with the CLAUDE.md defaults? This saves a new version.
            <button type="button" onClick={() => void reset()} disabled={busy} className="rounded-sm bg-short px-3 py-1.5 font-semibold text-paper">
              Reset to defaults
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-sm px-3 py-1.5 text-ink-2 underline">
              Keep my settings
            </button>
          </span>
        )}
        {message && (
          <div role="status" className={`basis-full text-sm ${message.tone === 'ok' ? 'text-long' : 'text-short'}`}>
            {message.text}
            {message.errors && message.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {message.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function Section({ title, small, children }: { title: string; small?: boolean; children: ReactNode }) {
  return (
    <fieldset className={small ? 'mt-5' : 'mt-8 border-t border-rule pt-5'}>
      <legend className={small ? 'mb-3 text-[15px] font-semibold' : 'mb-3 float-left w-full text-lg font-semibold'}>{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function NumberField({ field, value, defaultValue, onChange }: { field: Field; value: string; defaultValue: number; onChange: (v: string) => void }) {
  const id = `f-${field.path}`;
  const changed = Number(value) !== defaultValue;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-ink">
        {field.label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        {field.unit === '$' && <span className="text-ink-2">$</span>}
        <input
          id={id}
          name={field.path}
          type="number"
          inputMode="decimal"
          step={field.step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-28 rounded-sm border bg-surface px-2 py-1.5 text-right ${changed ? 'border-ink-2' : 'border-rule'}`}
        />
        {field.unit && field.unit !== '$' && <span className="text-sm text-ink-2">{field.unit}</span>}
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        {field.help ? `${field.help} ` : ''}Default {defaultValue}
        {field.unit && field.unit !== '$' && field.unit.startsWith('%') ? '%' : ''}
      </p>
    </div>
  );
}
