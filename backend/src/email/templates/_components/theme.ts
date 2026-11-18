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
