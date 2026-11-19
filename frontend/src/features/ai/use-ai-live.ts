'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Updates arriving close together cause one refresh. */
const REFRESH_DELAY_MS = 300;

/**
 * Keeps the page in step with the agent: when a run starts or ends, or the event's suggestions
 * change (also from another organizer's screen), the server components render again with fresh
 * data. The browser reconnects the stream by itself after a dropped connection.
 */
export function useAiLive(eventId: string, enabled: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`/api/events/${eventId}/ai/stream`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    };
    source.addEventListener('ai_run', refresh);
    source.addEventListener('ai_suggestions', refresh);
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [eventId, enabled, router]);
}
