import { TZDate } from '@date-fns/tz';

/**
 * Every event happens in Brussels for the MVP: times are shown and entered in Brussels time
 * and sent to the API as UTC. No per-event or per-organization timezone yet.
 */
export const TIME_ZONE = 'Europe/Brussels';
export const LOCALE = 'nl-BE';

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-12-19" + "14:00" in Brussels → ISO 8601 UTC string for the API. */
export function brusselsToUtcIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  if ([year, month, day, hours, minutes].some((part) => part === undefined || Number.isNaN(part))) {
    throw new Error(`Invalid date or time: ${date} ${time}`);
  }
  const local = new TZDate(year!, month! - 1, day!, hours!, minutes!, TIME_ZONE);
  return new Date(local.getTime()).toISOString();
}

/** ISO string from the API → the Brussels date ("2026-12-19") and time ("14:00") for a form. */
export function utcIsoToBrussels(iso: string): { date: string; time: string } {
  const local = new TZDate(iso, TIME_ZONE);
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
  };
}

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "za 19 dec 2026 · 14:00–23:00", or with both days when the event spans midnight days. */
export function formatEventRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = utcIsoToBrussels(startsAt).date === utcIsoToBrussels(endsAt).date;
  if (sameDay) {
    return `${dayFormat.format(start)} · ${timeFormat.format(start)}–${timeFormat.format(end)}`;
  }
  return `${dayFormat.format(start)} ${timeFormat.format(start)} – ${dayFormat.format(end)} ${timeFormat.format(end)}`;
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "19 december 2026", in Brussels. */
export const formatDate = (date: Date): string => dateFormat.format(date);

const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });

/** Money is stored in integer cents (never floats). 42050 → "€ 420,50". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Amount must be whole cents: ${cents}`);
  return euro.format(cents / 100);
}

const dayOnlyFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** A calendar day without time ("2026-12-01" → "di 1 dec"), e.g. a task's due date. */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  // A day has no timezone: format it at UTC midnight in UTC, so it never shifts.
  return dayOnlyFormat.format(new Date(Date.UTC(year!, month! - 1, day!)));
}
