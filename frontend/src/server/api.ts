import 'server-only';
import { cookies, headers } from 'next/headers';
import type { CreateClientConfig } from '@/api/generated/client.gen';
import { ApiError } from './api-errors';
import { serverEnv } from './env';

/**
 * Runtime configuration of the generated API client (openapi-ts.config.ts → runtimeConfigPath).
 * Every SDK call (`eventsControllerList()`, …) goes through `forwardToNest` below, so callers never
 * pass a client or headers. Because this file imports 'server-only', a client component that
 * imports the SDK fails the build instead of trying to call Nest from the browser.
 */

/** Placeholder origin: the real (private) backend URL is filled in per request. */
const PLACEHOLDER_ORIGIN = 'http://nest.internal';

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: PLACEHOLDER_ORIGIN,
  throwOnError: true,
  fetch: forwardToNest,
});

async function forwardToNest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  // Read the request first: while prerendering, rendering stops here (no env or network needed).
  const forwarded = await forwardedHeaders();
  const { pathname, search } = new URL(request.url);
  const target = new URL(pathname + search, serverEnv().BACKEND_URL);

  const outgoing = new Headers(request.headers);
  for (const [name, value] of Object.entries(forwarded)) outgoing.set(name, value);

  const response = await fetch(target, {
    method: request.method,
    headers: outgoing,
    body: request.body,
    duplex: 'half',
    cache: 'no-store',
  } as RequestInit);

  if (!response.ok) {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON: keep the text
    }
    throw new ApiError(response.status, body, `${request.method} ${pathname}`);
  }
  return response;
}

/** Cookie, client IP and the internal secret: what Nest needs on every request. */
export async function forwardedHeaders(): Promise<Record<string, string>> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const forwarded: Record<string, string> = {
    'x-internal-secret': serverEnv().INTERNAL_API_SECRET,
  };
  const cookie = cookieStore.toString();
  if (cookie) forwarded.cookie = cookie;
  // Better Auth rate-limits per client IP; without this every request would look like Next.js.
  const ip = headerStore.get('x-forwarded-for');
  if (ip) forwarded['x-forwarded-for'] = ip;
  return forwarded;
}
