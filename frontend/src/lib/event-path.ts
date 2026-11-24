/**
 * The event a page is inside, read from its path: `/events/<id>` and its sections
 * (`/events/<id>/budget`). `/events/new` is the create page, not an event.
 */
export function parseEventPath(
  pathname: string | null,
): { eventId: string; section: string | null } | null {
  const match = pathname?.match(/^\/events\/([^/]+)(?:\/([^/]+))?/);
  const eventId = match?.[1];
  if (!eventId || eventId === 'new') return null;
  return { eventId, section: match[2] ?? null };
}
