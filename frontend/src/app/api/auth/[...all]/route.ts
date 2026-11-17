import type { NextRequest } from 'next/server';
import { serverEnv } from '@/server/env';

/**
 * Forwards /api/auth/* (Better Auth) to Nest, adding the internal secret. A plain rewrite can't
 * add headers. The session cookie is set on this origin, so it stays first-party.
 */
async function forward(request: NextRequest): Promise<Response> {
  const { BACKEND_URL, INTERNAL_API_SECRET } = serverEnv();
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, BACKEND_URL);

  const headers = new Headers(request.headers);
  for (const hopByHop of ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade']) {
    headers.delete(hopByHop);
  }
  headers.set('x-internal-secret', INTERNAL_API_SECRET);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  // fetch already decoded the body, so these would no longer be true.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { forward as GET, forward as POST };
