const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DASH = '—';

/** OCC symbol → "SPY 756P Oct 30" */
export function contractName(occ: string): string {
  const m = /^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(occ);
  if (!m) return occ;
  const [, root, , mm, dd, cp, strike] = m as unknown as string[];
  const k = Number(strike) / 1000;
  return `${root} ${Number.isInteger(k) ? k : String(k)}${cp} ${MONTHS[Number(mm) - 1]} ${Number(dd)}`;
}

export const money = (n: number | null | undefined) => (n == null ? DASH : n.toFixed(2));

/** Fixed decimals with a real minus sign (Δ −0.40). */
export const fixed = (n: number | null | undefined, digits: number) => (n == null ? DASH : n.toFixed(digits).replace('-', '−'));

/** fraction → "58%" */
export const pct = (fraction: number | null | undefined) => (fraction == null ? DASH : `${Math.round(fraction * 100)}%`);

/** percent value → "+45%" / "−13%" */
export function signedPct(value: number | null | undefined): string {
  if (value == null) return DASH;
  const r = Math.round(value);
  return r < 0 ? `−${Math.abs(r)}%` : `+${r}%`;
}

const etParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(unix: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of etParts.formatToParts(new Date(unix * 1000))) out[p.type] = p.value;
  return out;
}

/** "15:30" New York time */
export function etTime(unix: number | null | undefined): string {
  if (unix == null) return DASH;
  const p = parts(unix);
  return `${p.hour}:${p.minute}`;
}

/** "Fri Oct 23, 15:30" New York time */
export function etDateTime(unix: number | null | undefined): string {
  if (unix == null) return DASH;
  const p = parts(unix);
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute}`;
}

/** "2026-10-30" → "Fri Oct 30" */
export function shortDate(date: string | null | undefined): string {
  if (!date) return DASH;
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
}

export function patternLabel(type: string): string {
  const s = type.replaceAll('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
