import { inject } from 'vitest';

// Loaded before every integration test file, so loadEnv() sees a complete test environment.
// The database is the throwaway Docker container that global-setup.ts started for this run.
export const TEST_APP_URL = 'http://localhost:3000';
export const TEST_INTERNAL_SECRET = 'test-internal-secret-test-internal-secret';

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: inject('databaseUrl'),
  APP_URL: TEST_APP_URL,
  BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
  INTERNAL_API_SECRET: TEST_INTERNAL_SECRET,
});
delete process.env.RESEND_API_KEY;
