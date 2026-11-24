import { describe, expect, it } from 'vitest';
import { parseEventPath } from '@/lib/event-path';

describe('parseEventPath', () => {
  it('reads the event and its section', () => {
    expect(parseEventPath('/events/abc/budget')).toEqual({ eventId: 'abc', section: 'budget' });
    expect(parseEventPath('/events/abc')).toEqual({ eventId: 'abc', section: null });
  });

  it('is not inside an event elsewhere or on the create page', () => {
    expect(parseEventPath('/events')).toBeNull();
    expect(parseEventPath('/events/new')).toBeNull();
    expect(parseEventPath('/suppliers/abc')).toBeNull();
    expect(parseEventPath(null)).toBeNull();
  });
});
