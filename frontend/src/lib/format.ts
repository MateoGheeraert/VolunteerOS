import { TZDate } from '@date-fns/tz';

/**
 * Every event happens in Brussels for the MVP: times are shown and entered in Brussels time
 * and sent to the API as UTC. No per-event or per-organization timezone yet.
 */
export const TIME_ZONE = 'Europe/Brussels';
export const LOCALE = 'nl-BE';

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

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * ISO string from the API → the Brussels date ("2026-12-19") and time ("14:00") for a form.
 * Pure (no "now"), so client components may call it while Next.js prerenders them.
 */
export function utcIsoToBrussels(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
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

const longDayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** A calendar day with its year ("1990-05-17" → "17 mei 1990"), e.g. a birth date. */
export function formatLongDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return longDayFormat.format(new Date(Date.UTC(year!, month! - 1, day!)));
}

/** "18:00–21:00", with "+1" when the shift ends on the next Brussels day ("22:00–02:00 +1"). */
export function formatShiftTime(startsAt: string, endsAt: string): string {
  const start = utcIsoToBrussels(startsAt);
  const end = utcIsoToBrussels(endsAt);
  const days = Math.round(
    (Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${start.date}T00:00:00Z`)) / 86_400_000,
  );
  return `${start.time}–${end.time}${days > 0 ? ` +${days}` : ''}`;
}

/** A Brussels calendar day as a short label ("2026-12-12" → "za 12 dec"). */
export const formatShortDay = (date: string): string => formatDay(date);

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "zaterdag 12 december om 18:00", in Brussels. */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));
