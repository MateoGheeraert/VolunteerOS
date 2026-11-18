import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/** Pages anyone may open. Everything else needs a session cookie. */
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invitations',
  '/e/',
];

/**
 * A quick convenience check only: is there a session cookie at all? The (app) layout verifies the
 * session for real, and Nest authorizes every request itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals and files with an extension (favicon, images).
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
