/**
 * Clock times and calendar days in Brussels, where the organizations are. Shifts are stored as
 * instants; planning rules ("niet vóór 18:00") and Mila's shift suggestions speak in local clock
 * times. Pure, so the solver and the planners stay unit-testable.
 */

const TIME_ZONE = 'Europe/Brussels';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function localParts(at: Date) {
  const parts = partsFormat.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The calendar day in Brussels, `YYYY-MM-DD`. */
export function brusselsDay(at: Date): string {
  const p = localParts(at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The clock time in Brussels, `HH:MM`. */
export function brusselsClock(at: Date): string {
  const p = localParts(at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since local midnight in Brussels (0–1439). */
export function brusselsMinutes(at: Date): number {
  const p = localParts(at);
  return p.hour * 60 + p.minute;
}

/** Brussels' offset from UTC at that instant, in minutes (60 in winter, 120 in summer). */
function offsetMinutes(at: Date): number {
  const p = localParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant of a Brussels day and clock time ("2026-12-12", "18:00"). */
export function fromBrussels(day: string, time: string): Date {
  const naive = Date.parse(`${day}T${time}:00Z`);
  const first = naive - offsetMinutes(new Date(naive)) * 60_000;
  // Near a DST switch the offset at the result can differ from the guess: correct once.
  return new Date(naive - offsetMinutes(new Date(first)) * 60_000);
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(day: string, days: number): string {
  const result = new Date(`${day}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `HH:MM` as minutes since midnight, or null when it isn't a valid clock time. */
export function clockToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "18u", "18:00", "6 uur", "18.30" → `HH:MM`; null when it can't be read as a time. */
export function normalizeClock(text: string): string | null {
  const match = /^\s*(\d{1,2})(?:[:.hu](\d{2}))?\s*(?:u|uur|h)?\s*$/i.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}
