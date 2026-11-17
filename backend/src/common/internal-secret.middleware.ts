import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/** Paths that the hosting platform probes directly, without the secret. */
const EXEMPT_PATHS = new Set(['/api/health']);

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Nest only listens on a private network and is reached through the Next.js server.
 * This is defense in depth on top of that: every request must carry the shared secret.
 * It never replaces authentication or authorization, which still run on every route.
 */
export function internalSecretMiddleware(secret: string) {
  const expected = digest(secret);
  return (req: Request, res: Response, next: NextFunction) => {
    if (EXEMPT_PATHS.has(req.path)) {
      return next();
    }
    const provided = req.header(INTERNAL_SECRET_HEADER);
    // Hashing both sides gives equal lengths, so the comparison is constant-time.
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }
    next();
  };
}
