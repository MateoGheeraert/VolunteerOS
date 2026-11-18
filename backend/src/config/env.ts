import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Pooled Neon connection string, used by the running app. */
  DATABASE_URL: z.url(),
  /** Public origin of the Next.js app. Cookies and auth callback URLs point here, never at Nest. */
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Shared secret that only the Next.js server knows; every request to Nest must carry it. */
  INTERNAL_API_SECRET: z.string().min(32),
  /** Where emails go: `console` prints them, `resend` sends them. Default: resend in production. */
  EMAIL_PROVIDER: z.enum(['console', 'resend']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  // Resend's shared test sender only delivers to the Resend account's own address. Use an address
  // on a verified domain in production.
  EMAIL_FROM: z.string().default('VolunteerOS <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` in a .env file means "not set", not an empty value.
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
