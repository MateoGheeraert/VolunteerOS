/**
 * The "Lagune" brand colors from frontend/src/app/globals.css, as plain hex values: email
 * clients don't support CSS variables. Keep these in sync when the brand changes.
 */
export const emailTheme = {
  primary: '#147a90',
  primaryForeground: '#ffffff',
  tint: '#e3f0ed',
  background: '#faf7f2',
  card: '#ffffff',
  ink: '#1f3b3f',
  inkMuted: '#5b7376',
  line: '#e6e1d8',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/** All emails are Dutch (initial market: Flanders) and show times in Belgian time. */
export const EMAIL_LOCALE = 'nl-BE';
export const EMAIL_TIME_ZONE = 'Europe/Brussels';

/** "25 november 2026" */
export function formatEmailDate(date: Date): string {
  return new Intl.DateTimeFormat(EMAIL_LOCALE, {
    dateStyle: 'long',
    timeZone: EMAIL_TIME_ZONE,
  }).format(date);
}

/** "25 november 2026 om 14:05" */
export function formatEmailDateTime(date: Date): string {
  const time = new Intl.DateTimeFormat(EMAIL_LOCALE, {
    timeStyle: 'short',
    timeZone: EMAIL_TIME_ZONE,
  }).format(date);
  return `${formatEmailDate(date)} om ${time}`;
}

const shiftDay = new Intl.DateTimeFormat(EMAIL_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: EMAIL_TIME_ZONE,
});
const shiftTime = new Intl.DateTimeFormat(EMAIL_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: EMAIL_TIME_ZONE,
});

/**
 * "zaterdag 12 december · 18:00–21:00", or with both days for a shift past midnight
 * ("zaterdag 12 december 22:00 – zondag 13 december 02:00").
 */
export function formatEmailShift(startsAt: Date, endsAt: Date): string {
  const startDay = shiftDay.format(startsAt);
  const endDay = shiftDay.format(endsAt);
  if (startDay === endDay) {
    return `${startDay} · ${shiftTime.format(startsAt)}–${shiftTime.format(endsAt)}`;
  }
  return `${startDay} ${shiftTime.format(startsAt)} – ${endDay} ${shiftTime.format(endsAt)}`;
}
