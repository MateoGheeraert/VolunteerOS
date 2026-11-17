import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  /** Private address of the Nest API. Browsers never see it. */
  BACKEND_URL: z.url(),
  /** Shared secret Nest requires on every request (except its health check). */
  INTERNAL_API_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Read lazily so `next build` works without secrets. instrumentation.ts calls it once at server
 * start, so a misconfigured server fails immediately instead of on the first request.
 */
export function serverEnv(): ServerEnv {
  if (!cached) {
    // `KEY=` in a .env file means "not set", as in the backend.
    const defined = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== ''),
    );
    const result = serverEnvSchema.safeParse(defined);
    if (!result.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    }
    cached = result.data;
  }
  return cached;
}
