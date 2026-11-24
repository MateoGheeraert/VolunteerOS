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

  /**
   * Direct (unpooled) Neon connection. The job queue needs it: Neon's pooler runs in transaction
   * mode, which breaks the session-level locks and LISTEN/NOTIFY the queue and live updates use.
   * Falls back to DATABASE_URL (fine locally and in tests, where there is no pooler).
   */
  DATABASE_URL_UNPOOLED: z.url().optional(),
  /** Whether this process runs background jobs. Off in tests, which run job handlers directly. */
  JOB_WORKERS: z.enum(['on', 'off']).default('on'),

  /**
   * Unset turns the AI features off: runs fail fast and the app works without suggestions. Which
   * model each feature uses is decided in code (src/ai/model-catalog.ts).
   */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** What one organization may spend on AI per calendar month, in euro cents. */
  AI_MONTHLY_CAP_CENTS: z.coerce.number().int().nonnegative().default(1000),

  /**
   * File storage on Cloudflare R2, through its S3 API. Set all four or none: unset turns file
   * uploads off (existing files stay listed, but can't be added or downloaded).
   */
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
});

const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` in a .env file means "not set", not an empty value.
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  const r2Set = R2_KEYS.filter((key) => result.data[key] !== undefined);
  if (r2Set.length > 0 && r2Set.length < R2_KEYS.length) {
    throw new Error(`Invalid environment variables: set all of ${R2_KEYS.join(', ')}, or none`);
  }
  return result.data;
}
