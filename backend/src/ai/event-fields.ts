import type { AiEventField } from './ai.types.js';

/** Event fields the agent may fill in, with what they hold. */
export const EVENT_FIELD_LIMITS: Record<AiEventField, { maxLength: number }> = {
  description: { maxLength: 2000 },
  location: { maxLength: 200 },
  expectedAttendance: { maxLength: 7 },
};

/**
 * A proposed or answered value for an event field, cleaned up; null when it doesn't fit the
 * field (e.g. "ongeveer 800" for a number).
 */
export function normalizeEventFieldValue(field: AiEventField, raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > EVENT_FIELD_LIMITS[field].maxLength) return null;
  if (field === 'expectedAttendance') {
    return /^\d+$/.test(value) ? String(Number(value)) : null;
  }
  return value;
}

/** The value as the event stores it. */
export function eventFieldPatch(
  field: AiEventField,
  value: string,
): { description: string } | { location: string } | { expectedAttendance: number } {
  switch (field) {
    case 'expectedAttendance':
      return { expectedAttendance: Number(value) };
    case 'description':
      return { description: value };
    case 'location':
      return { location: value };
  }
}
