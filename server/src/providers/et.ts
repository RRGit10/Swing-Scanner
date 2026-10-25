const etFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ET calendar date and minutes after midnight for a unix-seconds timestamp. */
export function etClock(unixSeconds: number): { date: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of etFormat.formatToParts(new Date(unixSeconds * 1000))) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "YYYY-MM-DD HH:mm" in ET. */
export function etStamp(date: Date): string {
  const { date: day, minutes } = etClock(Math.floor(date.getTime() / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Today's date in ET, YYYY-MM-DD. */
export function etToday(): string {
  return etClock(Date.now() / 1000).date;
}

/** Calendar-day arithmetic on a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
