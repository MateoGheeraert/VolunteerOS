import { forwardedHeaders } from '@/server/api';
import { serverEnv } from '@/server/env';

/**
 * The live AI updates of an event (Server-Sent Events), passed through from Nest, which the
 * browser can't reach. Nest checks the session cookie and the caller's access to the event.
 * Closing the page aborts the upstream request too.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/events/[eventId]/ai/stream'>,
) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return new Response(null, { status: 404 });

  const upstream = await fetch(
    new URL(`/api/events/${eventId}/ai/stream`, serverEnv().BACKEND_URL),
    {
      headers: { ...(await forwardedHeaders()), accept: 'text/event-stream' },
      signal: request.signal,
      cache: 'no-store',
    },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status === 200 ? 502 : upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Stops proxies (nginx and the like) from buffering the stream.
      'x-accel-buffering': 'no',
    },
  });
}
